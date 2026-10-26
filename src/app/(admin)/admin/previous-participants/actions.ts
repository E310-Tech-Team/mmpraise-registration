'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fail, ok, parseOrFail, type ActionResult } from '@/lib/actions/result'
import { requirePermission } from '@/lib/auth/rbac'
import { audit } from '@/lib/audit'
import { ipKey, rateLimit } from '@/lib/security/rate-limit'
import type { MigrationField } from '@/lib/migration/csv'
import {
  cancelBatch,
  createBatch,
  failedRowsCsv,
  queueImport,
  queueInvitations,
  retryFailedRows,
  saveMapping,
  validateBatch,
} from '@/lib/migration/service'
import { runQueue } from '@/lib/migration/worker'
import { runOutreachQueue } from '@/lib/outreach/worker'
import { db } from '@/lib/db'

/**
 * Server actions for the previous-edition migration.
 *
 * Every one begins with `requirePermission`. The navigation hides what an
 * administrator cannot use, but that is a convenience — these checks are the
 * access control, and they run on the server where a crafted request cannot
 * skip them.
 *
 * The permissions are deliberately fine-grained. Reading a batch, creating one,
 * running it and emailing everybody in it are four different levels of trust,
 * and the last is the only irreversible one.
 */

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024

const uploadSchema = z.object({
  name: z.string().trim().min(3, 'Give this import a name you will recognise later').max(120),
  sourceEdition: z
    .string()
    .trim()
    .min(2, 'Say which edition these people took part in')
    .max(80),
  sourceYear: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? Number(value) : null))
    .refine((value) => value === null || (Number.isInteger(value) && value >= 2000 && value <= 2100), {
      message: 'Enter a four-digit year',
    }),
  sourceNote: z.string().trim().max(500).optional().nullable(),
  sendInvitations: z.boolean().default(false),
})

export async function uploadBatchAction(formData: FormData): Promise<ActionResult<{ batchId: string }>> {
  const user = await requirePermission('migration:create')

  // An import is expensive and irreversible enough to be worth rate limiting
  // even for a trusted administrator — it is also the obvious lever if an
  // administrator account is ever compromised.
  // Ten uploads per hour: generous for real work, and a hard ceiling on what a
  // compromised administrator account could push through unattended.
  const limit = await rateLimit(await ipKey('migration-upload'), 10, 60)
  if (!limit.allowed) {
    return fail('Too many uploads in a short time. Try again shortly.', undefined, 'rate_limited')
  }

  const parsed = parseOrFail(uploadSchema, {
    name: formData.get('name'),
    sourceEdition: formData.get('sourceEdition'),
    sourceYear: formData.get('sourceYear') ?? undefined,
    sourceNote: formData.get('sourceNote') || null,
    sendInvitations: formData.get('sendInvitations') === 'on',
  })
  if (!parsed.ok) return parsed.result

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return fail('Choose a CSV file to upload', { file: 'Choose a CSV file to upload' })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail('That file is too large', {
      file: `Files must be under ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB. Split a larger list into several imports.`,
    })
  }
  /*
   * Extension and declared type are both checked, and neither is trusted: the
   * bytes are parsed as CSV regardless, and a file that is not CSV simply
   * produces no usable header row and is rejected by `createBatch`.
   */
  if (!/\.csv$/i.test(file.name)) {
    return fail('That file is not a CSV', {
      file: 'Save your spreadsheet as CSV and upload that. Excel workbooks cannot be read directly.',
    })
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  const result = await createBatch({
    file: { name: file.name, bytes },
    name: parsed.data.name,
    sourceEdition: parsed.data.sourceEdition,
    sourceYear: parsed.data.sourceYear,
    sourceNote: parsed.data.sourceNote ?? null,
    sendInvitations: parsed.data.sendInvitations,
    actorId: user.id,
  })

  if (!result.ok) return fail(result.error, { file: result.error })

  if (result.parsed.forbiddenHeaders.length > 0) {
    // Recorded, not rejected. The administrator needs to know their source file
    // contains credential-looking columns; those columns are simply never
    // mapped and their values are never read.
    await audit({
      action: 'migration.batch_created',
      entityType: 'MigrationBatch',
      entityId: result.batchId,
      actorId: user.id,
      metadata: { forbiddenHeadersIgnored: result.parsed.forbiddenHeaders },
    })
  }

  revalidatePath('/admin/previous-participants')
  return ok({ batchId: result.batchId })
}

export async function saveMappingAction(
  batchId: string,
  mapping: Record<string, MigrationField | ''>,
): Promise<ActionResult<undefined>> {
  const user = await requirePermission('migration:create')

  const result = await saveMapping({ batchId, mapping, actorId: user.id })
  if (!result.ok) {
    return fail(result.error, result.errors ? { mapping: result.errors.join(' ') } : undefined)
  }

  revalidatePath(`/admin/previous-participants/${batchId}`)
  return ok()
}

export async function validateBatchAction(batchId: string): Promise<ActionResult<undefined>> {
  const user = await requirePermission('migration:create')

  const result = await validateBatch({ batchId, actorId: user.id })
  if (!result.ok) return fail(result.error)

  revalidatePath(`/admin/previous-participants/${batchId}`)
  return ok()
}

export async function queueImportAction(batchId: string): Promise<ActionResult<{ jobs: number }>> {
  const user = await requirePermission('migration:execute')

  const result = await queueImport({ batchId, actorId: user.id })
  if (!result.ok) return fail(result.error)

  /*
   * Run one pass immediately so a small import finishes before the
   * administrator has finished reading the confirmation, rather than sitting at
   * "queued" until something else happens to trigger the worker. Anything left
   * over is picked up by the next pass — see runQueueAction.
   */
  await runQueue({ maxJobs: 5 }).catch((error) => {
    console.error('[migration] inline pass failed', error)
  })

  revalidatePath(`/admin/previous-participants/${batchId}`)
  return ok({ jobs: result.jobs })
}

export async function queueInvitationsAction(
  batchId: string,
): Promise<ActionResult<{ queued: number }>> {
  const user = await requirePermission('migration:invite')

  const result = await queueInvitations({ batchId, actorId: user.id })
  if (!result.ok) return fail(result.error)

  // Invitations are outreach jobs now; start the first slices immediately.
  await runOutreachQueue({ maxJobs: 3 }).catch((error) => {
    console.error('[migration] inline invite pass failed', error)
  })

  revalidatePath(`/admin/previous-participants/${batchId}`)
  return ok({ queued: result.queued })
}

/**
 * Advance the queue by one pass.
 *
 * Called by the batch screen while an import is running, so progress moves
 * without a separate scheduler. A production deployment should also call the
 * same worker from cron; this exists so the platform is usable without one.
 */
export async function runQueueAction(batchId: string): Promise<ActionResult<{ processed: number }>> {
  await requirePermission('migration:execute')

  // Both queues: import chunks, and any outreach run (invitations, reminders)
  // waiting to send — so "Process now" and the batch screen's poll advance
  // everything that can move.
  const result = await runQueue({ maxJobs: 5 })
  const outreach = await runOutreachQueue({ maxJobs: 3 })
  revalidatePath(`/admin/previous-participants/${batchId}`)
  return ok({ processed: result.processed + outreach.processed })
}

export async function cancelBatchAction(batchId: string): Promise<ActionResult<undefined>> {
  const user = await requirePermission('migration:execute')

  const result = await cancelBatch({ batchId, actorId: user.id })
  if (!result.ok) return fail(result.error)

  revalidatePath('/admin/previous-participants')
  revalidatePath(`/admin/previous-participants/${batchId}`)
  return ok()
}

export async function retryFailedRowsAction(
  batchId: string,
): Promise<ActionResult<{ retried: number }>> {
  const user = await requirePermission('migration:execute')

  const result = await retryFailedRows({ batchId, actorId: user.id })
  if (!result.ok) return fail(result.error)

  await runQueue({ maxJobs: 5 }).catch(() => undefined)

  revalidatePath(`/admin/previous-participants/${batchId}`)
  return ok({ retried: result.retried })
}

/**
 * Exclude one person from the invitation run, or put them back in.
 *
 * The case this exists for: a name an administrator recognises as a colleague
 * who has already been contacted another way, or an address that is known to
 * bounce. Excluding is not deleting — the record stays, so the batch's totals
 * still reconcile.
 */
export async function setInviteExclusionAction(
  recordId: string,
  excluded: boolean,
): Promise<ActionResult<undefined>> {
  const user = await requirePermission('migration:invite')

  const record = await db.migratedUserRecord.findUnique({
    where: { id: recordId },
    select: { id: true, batchId: true, invitationStatus: true },
  })
  if (!record) return fail('That record no longer exists.')
  if (record.invitationStatus === 'SENT' || record.invitationStatus === 'DELIVERED') {
    return fail('That invitation has already been sent, so it cannot be withdrawn from here.')
  }

  await db.migratedUserRecord.update({
    where: { id: recordId },
    data: {
      /*
       * The flag alone. Exclusion used to also write invitationStatus
       * SUPPRESSED — the same value activation wrote — so reports could not
       * tell "we chose not to email them" from "they responded". The outreach
       * eligibility predicates filter on this flag directly.
       */
      excludedFromInvites: excluded,
      // A never-sent row drops out of the send queue immediately.
      ...(excluded ? { invitationStatus: 'NOT_QUEUED' as const } : {}),
    },
  })

  await audit({
    action: 'migration.invitations_queued',
    entityType: 'MigrationRecord',
    entityId: recordId,
    actorId: user.id,
    metadata: { excluded },
  })

  revalidatePath(`/admin/previous-participants/${record.batchId}`)
  return ok()
}

/**
 * The failed-row report.
 *
 * Returned as a string for the browser to save rather than streamed from a
 * route handler, so the permission check and the audit record live in the same
 * place as every other migration operation.
 */
export async function downloadFailedRowsAction(
  batchId: string,
): Promise<ActionResult<{ filename: string; csv: string }>> {
  const user = await requirePermission('migration:export')

  const batch = await db.migrationBatch.findUnique({
    where: { id: batchId },
    select: { reference: true },
  })
  if (!batch) return fail('That batch no longer exists.')

  const csv = await failedRowsCsv(batchId)

  await audit({
    action: 'migration.exported',
    entityType: 'MigrationBatch',
    entityId: batchId,
    actorId: user.id,
    metadata: { report: 'failed_rows', bytes: csv.length },
  })

  return ok({ filename: `${batch.reference}-unimported-rows.csv`, csv })
}

/** The blank template an administrator prepares their file from. */
export async function downloadTemplateAction(): Promise<ActionResult<{ filename: string; csv: string }>> {
  await requirePermission('migration:view')
  const { sampleTemplate } = await import('@/lib/migration/csv')
  return ok({ filename: 'mmpraise-previous-participants-template.csv', csv: sampleTemplate() })
}
