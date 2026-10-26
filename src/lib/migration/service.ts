import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { storage } from '@/lib/storage'
import { getSettings } from '@/lib/settings'
import {
  MIGRATION_FIELDS,
  guessMapping,
  parseCsv,
  toCsv,
  type MigrationField,
  type ParsedCsv,
} from './csv'
import { createInvitationRun } from '@/lib/outreach/service'
import { hasError, mappingErrors, normaliseEmail, validateRow } from './validate'
import { refreshBatchStatus } from './worker'

/**
 * Everything the Previous Participants admin screens do, in one place.
 *
 * The screens themselves hold no logic beyond rendering: an import that creates
 * accounts and emails thousands of people must be driven by code that can be
 * tested without a browser, and the same operations are wanted later from a
 * cron job and a CLI.
 *
 * The order of operations is deliberate and enforced by `status`:
 *
 *   upload → DRAFT → validate → VALIDATED → confirm → QUEUED → worker → COMPLETED
 *
 * Nothing is written to the `users` table before an administrator has seen the
 * validation report and confirmed it. A dry run is genuinely dry.
 */

/** How many rows one upload may contain. Beyond this the file is rejected. */
export const MAX_ROWS = 20_000

/** Rows per background job. Small enough that one failure loses little. */
export const CHUNK_SIZE = 100

/** Uploaded CSVs are deleted this many days after the batch finishes. */
export const UPLOAD_RETENTION_DAYS = 30

export type UploadResult =
  | { ok: true; batchId: string; parsed: ParsedCsv }
  | { ok: false; error: string }

function checksum(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** MIG-2027-0007 — quotable in an email to whoever is chasing an import. */
async function nextReference(): Promise<string> {
  const year = new Date().getUTCFullYear()
  const count = await db.migrationBatch.count()
  return `MIG-${year}-${String(count + 1).padStart(4, '0')}`
}

/**
 * Store an uploaded CSV and create the batch that describes it.
 *
 * The file is written to private storage under a random key, never a path
 * derived from its filename, and the parsed rows are *not* persisted yet — this
 * step only records that a file arrived and how its columns appear to map.
 */
export async function createBatch(params: {
  file: { name: string; bytes: Buffer }
  name: string
  sourceEdition: string
  sourceYear: number | null
  sourceNote: string | null
  sendInvitations: boolean
  actorId: string
}): Promise<UploadResult> {
  const { file, actorId } = params

  const text = file.bytes.toString('utf8')
  const parsed = parseCsv(text, { maxRows: MAX_ROWS })

  if (parsed.headers.length === 0) {
    return { ok: false, error: 'That file has no header row, so its columns cannot be mapped.' }
  }
  if (parsed.rows.length === 0) {
    return { ok: false, error: 'That file has a header row but no data rows.' }
  }

  const fileChecksum = checksum(file.bytes)

  /*
   * The same bytes for the same edition is the same import.
   *
   * Checked before anything is written, so an administrator who presses upload
   * twice — or who is not sure whether last week's import ran — is shown the
   * existing batch rather than creating a second one that would double every
   * count and, if invitations were on, email everybody again.
   */
  const existing = await db.migrationBatch.findUnique({
    where: {
      fileChecksum_sourceEdition: {
        fileChecksum,
        sourceEdition: params.sourceEdition,
      },
    },
    select: { id: true, reference: true, status: true },
  })
  if (existing) {
    return {
      ok: false,
      error: `This exact file has already been uploaded for ${params.sourceEdition} as ${existing.reference}. Open that batch instead of importing it twice.`,
    }
  }

  const storageKey = `migrations/${randomUUID()}.csv`
  await storage.put(storageKey, file.bytes, 'text/csv')

  const batch = await db.migrationBatch.create({
    data: {
      reference: await nextReference(),
      name: params.name,
      sourceEdition: params.sourceEdition,
      sourceYear: params.sourceYear,
      sourceNote: params.sourceNote,
      originalFilename: file.name.slice(0, 255),
      fileChecksum,
      storageKey,
      fileSizeBytes: file.bytes.byteLength,
      columnMapping: guessMapping(parsed.headers) as never,
      sendInvitations: params.sendInvitations,
      status: 'DRAFT',
      totalRows: parsed.rows.length,
      createdById: actorId,
    },
  })

  await audit({
    action: 'migration.batch_created',
    entityType: 'MigrationBatch',
    entityId: batch.id,
    actorId,
    metadata: {
      reference: batch.reference,
      rows: parsed.rows.length,
      edition: params.sourceEdition,
      forbiddenHeaders: parsed.forbiddenHeaders,
    },
  })

  return { ok: true, batchId: batch.id, parsed }
}

/** Re-read the stored CSV. Null once the file has been deleted by retention. */
export async function readBatchCsv(batchId: string): Promise<ParsedCsv | null> {
  const batch = await db.migrationBatch.findUnique({
    where: { id: batchId },
    select: { storageKey: true, fileDeletedAt: true },
  })
  if (!batch?.storageKey || batch.fileDeletedAt) return null

  try {
    const bytes = await storage.get(batch.storageKey)
    return parseCsv(bytes.toString('utf8'), { maxRows: MAX_ROWS })
  } catch {
    return null
  }
}

export async function saveMapping(params: {
  batchId: string
  mapping: Record<string, MigrationField | ''>
  actorId: string
}): Promise<{ ok: true } | { ok: false; error: string; errors?: string[] }> {
  const errors = mappingErrors(params.mapping)
  if (errors.length > 0) {
    return { ok: false, error: 'The column mapping is not usable yet.', errors }
  }

  const batch = await db.migrationBatch.findUnique({
    where: { id: params.batchId },
    select: { status: true },
  })
  if (!batch) return { ok: false, error: 'That batch no longer exists.' }
  if (batch.status !== 'DRAFT' && batch.status !== 'VALIDATED') {
    return { ok: false, error: 'The mapping cannot change once the import has been queued.' }
  }

  await db.migrationBatch.update({
    where: { id: params.batchId },
    // Back to DRAFT: a changed mapping invalidates the previous dry run, and
    // confirming against a stale report would import different data from the
    // one the administrator actually read.
    data: { columnMapping: params.mapping as never, status: 'DRAFT' },
  })

  return { ok: true }
}

export type ValidationSummary = {
  total: number
  valid: number
  warning: number
  invalid: number
  duplicateInFile: number
  willCreate: number
  willMatch: number
}

/**
 * The dry run.
 *
 * Every row is parsed, validated and checked against existing accounts, and the
 * verdicts are stored as `MigratedUserRecord` rows — but nothing touches
 * `users`, `volunteer_profiles` or the mail queue. That separation is the whole
 * point: an administrator decides on evidence, not on a promise.
 */
export async function validateBatch(params: {
  batchId: string
  actorId: string
}): Promise<{ ok: true; summary: ValidationSummary } | { ok: false; error: string }> {
  const batch = await db.migrationBatch.findUnique({ where: { id: params.batchId } })
  if (!batch) return { ok: false, error: 'That batch no longer exists.' }
  if (batch.status !== 'DRAFT' && batch.status !== 'VALIDATED') {
    return { ok: false, error: 'This batch has already been imported.' }
  }

  const parsed = await readBatchCsv(params.batchId)
  if (!parsed) {
    return {
      ok: false,
      error:
        'The uploaded file is no longer available, so it cannot be validated again. Upload it once more to start a new batch.',
    }
  }

  const mapping = batch.columnMapping as Record<string, MigrationField | ''>
  const errors = mappingErrors(mapping)
  if (errors.length > 0) return { ok: false, error: errors[0]! }

  // Start from a clean slate so a re-run never leaves verdicts from an earlier
  // mapping sitting alongside the new ones.
  await db.migratedUserRecord.deleteMany({ where: { batchId: batch.id } })

  const seenEmails = new Set<string>()
  const summary: ValidationSummary = {
    total: 0,
    valid: 0,
    warning: 0,
    invalid: 0,
    duplicateInFile: 0,
    willCreate: 0,
    willMatch: 0,
  }

  // Row numbers are 1-based over the data rows, matching what the administrator
  // sees in the preview table rather than the spreadsheet's own line numbers.
  const rows = parsed.rows.map((raw, index) => validateRow(raw, mapping, index + 1))

  /*
   * One query for every email in the file rather than one query per row. A
   * 20,000-row import would otherwise make 20,000 round trips, which is both
   * slow and enough concurrent load to affect the live site.
   */
  const emails = [...new Set(rows.map((r) => r.email).filter(Boolean))]
  const existingUsers = new Map<string, string>()
  for (let i = 0; i < emails.length; i += 1000) {
    const slice = emails.slice(i, i + 1000)
    const found = await db.user.findMany({
      where: { email: { in: slice } },
      select: { id: true, email: true },
    })
    for (const user of found) existingUsers.set(normaliseEmail(user.email), user.id)
  }

  const records: {
    batchId: string
    rowNumber: number
    sourceData: object
    normalisedEmail: string
    firstName: string | null
    lastName: string | null
    phone: string | null
    previousRegistrationId: string | null
    previousDepartment: string | null
    action: 'CREATE' | 'MATCH_EXISTING' | 'SKIP_DUPLICATE' | 'SKIP_INVALID'
    status: 'VALID' | 'WARNING' | 'INVALID' | 'SKIPPED'
    validationMessages: object
  }[] = []

  for (const row of rows) {
    summary.total += 1
    const messages = [...row.messages]

    let action: (typeof records)[number]['action'] = 'CREATE'
    let status: (typeof records)[number]['status']

    if (hasError(messages)) {
      action = 'SKIP_INVALID'
      status = 'INVALID'
      summary.invalid += 1
    } else if (seenEmails.has(row.email)) {
      // The same address twice in one file is a data-entry artefact, not two
      // people. The first occurrence wins; the rest are recorded and skipped.
      action = 'SKIP_DUPLICATE'
      status = 'SKIPPED'
      messages.push({
        field: 'email',
        level: 'warning',
        message: 'This address appears earlier in the same file; only the first row is imported.',
      })
      summary.duplicateInFile += 1
    } else {
      seenEmails.add(row.email)
      const matchedId = existingUsers.get(row.email)
      if (matchedId) {
        action = 'MATCH_EXISTING'
        messages.push({
          field: 'email',
          level: 'warning',
          message:
            'An account already exists for this address. It will be linked to this edition; no second account is created and nothing already recorded is overwritten.',
        })
        summary.willMatch += 1
      } else {
        summary.willCreate += 1
      }
      status = messages.length > 0 ? 'WARNING' : 'VALID'
      if (status === 'WARNING') summary.warning += 1
      else summary.valid += 1
    }

    records.push({
      batchId: batch.id,
      rowNumber: row.rowNumber,
      sourceData: row.source,
      normalisedEmail: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      previousRegistrationId: row.previousRegistrationId,
      previousDepartment: row.previousDepartment,
      action,
      status,
      validationMessages: messages,
    })
  }

  for (let i = 0; i < records.length; i += 500) {
    await db.migratedUserRecord.createMany({ data: records.slice(i, i + 500) as never })
  }

  await db.migrationBatch.update({
    where: { id: batch.id },
    data: {
      status: 'VALIDATED',
      totalRows: summary.total,
      validRows: summary.valid,
      warningRows: summary.warning,
      invalidRows: summary.invalid,
      skippedRows: summary.duplicateInFile,
    },
  })

  await audit({
    action: 'migration.batch_validated',
    entityType: 'MigrationBatch',
    entityId: batch.id,
    actorId: params.actorId,
    metadata: { ...summary },
  })

  return { ok: true, summary }
}

/**
 * Confirm a validated batch and queue the work.
 *
 * Jobs are created with `skipDuplicates`, and `(batchId, kind, offset)` is
 * unique — so pressing confirm twice enqueues nothing the second time rather
 * than importing every row again.
 */
export async function queueImport(params: {
  batchId: string
  actorId: string
}): Promise<{ ok: true; jobs: number } | { ok: false; error: string }> {
  const batch = await db.migrationBatch.findUnique({ where: { id: params.batchId } })
  if (!batch) return { ok: false, error: 'That batch no longer exists.' }
  if (batch.status !== 'VALIDATED') {
    return {
      ok: false,
      error:
        batch.status === 'DRAFT'
          ? 'Validate the batch before importing it, so you can see what will happen first.'
          : 'This batch has already been queued.',
    }
  }

  const importable = await db.migratedUserRecord.count({
    where: { batchId: batch.id, status: { in: ['VALID', 'WARNING'] } },
  })
  if (importable === 0) {
    return { ok: false, error: 'No row in this batch can be imported. Fix the file and upload it again.' }
  }

  const maxRow = await db.migratedUserRecord.aggregate({
    where: { batchId: batch.id },
    _max: { rowNumber: true },
  })
  const highest = maxRow._max.rowNumber ?? 0

  const jobs: { batchId: string; kind: string; offset: number; size: number }[] = []
  for (let offset = 0; offset <= highest; offset += CHUNK_SIZE) {
    jobs.push({ batchId: batch.id, kind: 'import', offset, size: CHUNK_SIZE })
  }

  await db.importJob.createMany({ data: jobs, skipDuplicates: true })
  await db.migrationBatch.update({
    where: { id: batch.id },
    data: { status: 'QUEUED', startedAt: new Date() },
  })

  await audit({
    action: 'migration.import_queued',
    entityType: 'MigrationBatch',
    entityId: batch.id,
    actorId: params.actorId,
    metadata: { jobs: jobs.length, rows: importable, sendInvitations: batch.sendInvitations },
  })

  return { ok: true, jobs: jobs.length }
}

/**
 * Queue invitation emails for everyone this batch created.
 *
 * Always a separate, explicit step from the administrator's side (the
 * upload-time checkbox is honoured through this same path when the import
 * completes). Emailing several thousand people is the one action in this
 * module that cannot be undone, and it should never happen twice: the run's
 * per-recipient attempts and each record's one-send key see to that.
 *
 * Since the outreach rework this is a thin wrapper: the eligibility claim, the
 * run, its attempts and its correctly-sized jobs all live in
 * src/lib/outreach/service.ts, shared with reminder campaigns.
 */
export async function queueInvitations(params: {
  batchId: string
  actorId: string
}): Promise<{ ok: true; queued: number } | { ok: false; error: string }> {
  return createInvitationRun({ batchId: params.batchId, actorId: params.actorId })
}

export async function cancelBatch(params: {
  batchId: string
  actorId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const batch = await db.migrationBatch.findUnique({
    where: { id: params.batchId },
    select: { status: true },
  })
  if (!batch) return { ok: false, error: 'That batch no longer exists.' }
  if (batch.status === 'COMPLETED' || batch.status === 'COMPLETED_WITH_WARNINGS') {
    return {
      ok: false,
      error: 'This import has already finished. Cancelling would not undo the accounts it created.',
    }
  }

  await db.$transaction([
    db.importJob.updateMany({
      where: { batchId: params.batchId, status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'CANCELLED' },
    }),
    db.migrationBatch.update({ where: { id: params.batchId }, data: { status: 'CANCELLED' } }),
  ])

  await audit({
    action: 'migration.batch_cancelled',
    entityType: 'MigrationBatch',
    entityId: params.batchId,
    actorId: params.actorId,
  })

  return { ok: true }
}

/** Re-queue the rows that failed, leaving the ones that succeeded alone. */
export async function retryFailedRows(params: {
  batchId: string
  actorId: string
}): Promise<{ ok: true; retried: number } | { ok: false; error: string }> {
  const failed = await db.migratedUserRecord.updateMany({
    where: { batchId: params.batchId, status: 'FAILED' },
    // Back to WARNING, not VALID: these rows are known to have had a problem,
    // and the worker only picks up VALID and WARNING.
    data: { status: 'WARNING' },
  })
  if (failed.count === 0) return { ok: false, error: 'There are no failed rows to retry.' }

  const failedJobs = await db.importJob.findMany({
    where: { batchId: params.batchId, kind: 'import', status: 'FAILED' },
    select: { id: true },
  })
  await db.importJob.updateMany({
    where: { id: { in: failedJobs.map((j) => j.id) } },
    data: { status: 'PENDING', attempts: 0, lastError: null, completedAt: null },
  })

  await db.migrationBatch.update({ where: { id: params.batchId }, data: { status: 'IMPORTING' } })

  await audit({
    action: 'migration.rows_retried',
    entityType: 'MigrationBatch',
    entityId: params.batchId,
    actorId: params.actorId,
    metadata: { rows: failed.count, jobs: failedJobs.length },
  })

  return { ok: true, retried: failed.count }
}

/**
 * The failed-row report an administrator downloads, fixes and re-uploads.
 *
 * Values go out through `toCsv`, which prefixes anything a spreadsheet would
 * treat as a formula — the report contains attacker-influenced strings from the
 * original file, and it is opened in Excel by definition.
 */
export async function failedRowsCsv(batchId: string): Promise<string> {
  const records = await db.migratedUserRecord.findMany({
    where: { batchId, status: { in: ['INVALID', 'FAILED', 'SKIPPED'] } },
    orderBy: { rowNumber: 'asc' },
  })

  const headers = [
    'Row',
    'Status',
    'Email',
    'First name',
    'Last name',
    'Phone',
    'Previous department',
    'Previous registration ID',
    'Problems',
  ]

  const rows = records.map((record) => {
    const messages = (record.validationMessages ?? []) as { field: string; message: string }[]
    return [
      record.rowNumber,
      record.status,
      record.normalisedEmail,
      record.firstName ?? '',
      record.lastName ?? '',
      record.phone ?? '',
      record.previousDepartment ?? '',
      record.previousRegistrationId ?? '',
      messages.map((m) => `${m.field}: ${m.message}`).join(' | '),
    ]
  })

  return toCsv(headers, rows)
}

/**
 * Delete uploaded CSVs whose retention period has passed.
 *
 * The parsed rows stay in `MigratedUserRecord.sourceData`, so a completed
 * import can still be explained long after the file itself is gone — which is
 * the point: the report survives, the bulk personal data does not.
 */
export async function purgeExpiredUploads(now: Date = new Date()): Promise<{ deleted: number }> {
  const cutoff = new Date(now.getTime() - UPLOAD_RETENTION_DAYS * 86_400_000)

  const batches = await db.migrationBatch.findMany({
    where: {
      storageKey: { not: null },
      fileDeletedAt: null,
      OR: [{ completedAt: { lt: cutoff } }, { completedAt: null, createdAt: { lt: cutoff } }],
    },
    select: { id: true, storageKey: true },
  })

  for (const batch of batches) {
    if (batch.storageKey) await storage.delete(batch.storageKey).catch(() => undefined)
    await db.migrationBatch.update({
      where: { id: batch.id },
      data: { fileDeletedAt: new Date(), storageKey: null },
    })
  }

  return { deleted: batches.length }
}

/** Field labels, for the mapping screen and the validation report. */
export const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  MIGRATION_FIELDS.map((field) => [field.key, field.label]),
)

/** The support address quoted in invitation emails and on the batch screens. */
export async function supportEmail(): Promise<string> {
  return (await getSettings()).support_email
}

export { refreshBatchStatus }
