import 'server-only'
import { db } from '@/lib/db'
import { createInvitationRun } from '@/lib/outreach/service'
import { hasError } from './validate'
import { importRow } from './import'

/**
 * The import queue worker.
 *
 * Jobs are claimed with `FOR UPDATE SKIP LOCKED`, so several workers can run
 * concurrently without ever handing the same chunk to two of them. Each job
 * covers a bounded slice of rows, which keeps a single failure from losing the
 * whole import and makes progress observable while it runs.
 *
 * Invitation *sending* no longer lives here: it moved to the outreach worker
 * (src/lib/outreach/worker.ts), where every send is a per-recipient attempt
 * on a run. The old `kind: 'invite'` jobs are retired — their offsets never
 * matched what a pass actually sent, which stranded half a batch's queue, and
 * re-queues collided with the old job keys and silently created nothing.
 *
 * Nothing here runs inside a browser request: an import of several thousand
 * rows would exceed any sensible request timeout, and a half-finished HTTP
 * request is the one situation where idempotency is hardest to reason about.
 */

type ClaimedJob = {
  id: string
  batchId: string
  kind: string
  offset: number
  size: number
  attempts: number
  maxAttempts: number
}

/**
 * Claim one pending job atomically.
 *
 * The `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)` shape is what
 * makes this safe: the row is locked and marked RUNNING in a single statement,
 * so two workers cannot both see it as PENDING.
 */
async function claimJob(): Promise<ClaimedJob | null> {
  const rows = await db.$queryRaw<ClaimedJob[]>`
    UPDATE import_jobs
    SET status = 'RUNNING', "claimedAt" = now(), attempts = attempts + 1, "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM import_jobs
      WHERE status = 'PENDING'
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, "batchId", kind, "offset", size, attempts, "maxAttempts"
  `
  return rows[0] ?? null
}

async function finishJob(job: ClaimedJob, error?: unknown) {
  if (!error) {
    await db.importJob.update({
      where: { id: job.id },
      data: { status: 'COMPLETED', completedAt: new Date(), lastError: null },
    })
    return
  }

  const message = error instanceof Error ? error.message : String(error)
  const exhausted = job.attempts >= job.maxAttempts

  // Back to PENDING while attempts remain, so a transient database or SMTP
  // blip retries itself rather than needing an administrator.
  await db.importJob.update({
    where: { id: job.id },
    data: {
      status: exhausted ? 'FAILED' : 'PENDING',
      lastError: message.slice(0, 500),
      completedAt: exhausted ? new Date() : null,
    },
  })
}

/** Run pending jobs until none remain or the budget is spent. */
export async function runQueue({ maxJobs = 20 }: { maxJobs?: number } = {}): Promise<{
  processed: number
}> {
  let processed = 0

  for (let i = 0; i < maxJobs; i += 1) {
    const job = await claimJob()
    if (!job) break

    try {
      // 'invite' jobs are retired (cancelled by migration); a straggler is a no-op.
      if (job.kind === 'import') await runImportChunk(job)
      await finishJob(job)
    } catch (error) {
      console.error('[migration] job failed', job.id, error)
      await finishJob(job, error)
    }

    processed += 1
    await refreshBatchStatus(job.batchId)
  }

  return { processed }
}

/** Import one slice of a batch's rows. */
async function runImportChunk(job: ClaimedJob) {
  const batch = await db.migrationBatch.findUnique({ where: { id: job.batchId } })
  if (!batch || batch.status === 'CANCELLED') return

  const records = await db.migratedUserRecord.findMany({
    where: {
      batchId: job.batchId,
      rowNumber: { gte: job.offset, lt: job.offset + job.size },
      // IMPORTED rows are skipped, which is what makes a retry safe.
      status: { in: ['VALID', 'WARNING'] },
    },
    orderBy: { rowNumber: 'asc' },
  })

  for (const record of records) {
    /*
     * The record *is* the validated row.
     *
     * This used to re-run `validateRow` over `sourceData` and the batch's
     * column mapping — which cannot work: `sourceData` holds the row already
     * projected through that mapping and keyed by field name, while
     * `validateRow` expects the raw CSV row keyed by its headers. Every lookup
     * missed, every row was re-judged as having no email address, and a batch
     * that validated perfectly imported nothing at all.
     *
     * The columns beside `sourceData` are the normalised values precisely so
     * this step does not have to re-derive them. Reading them is both correct
     * and one less place for the two passes to disagree.
     */
    const messages = (record.validationMessages ?? []) as {
      field: string
      level: 'error' | 'warning'
      message: string
    }[]

    const row = {
      rowNumber: record.rowNumber,
      email: record.normalisedEmail,
      firstName: record.firstName,
      lastName: record.lastName,
      phone: record.phone,
      previousDepartment: record.previousDepartment,
      previousRegistrationId: record.previousRegistrationId,
      source: (record.sourceData ?? {}) as Record<string, string>,
    }

    if (hasError(messages)) {
      await db.migratedUserRecord.update({
        where: { id: record.id },
        data: { status: 'INVALID' },
      })
      continue
    }

    try {
      /*
       * The row's own edition wins over the batch's.
       *
       * The 2022–2026 export gives every person their own Year; without this,
       * one upload would record all 13,969 people against a single made-up
       * edition label and their real history would be gone. The batch's edition
       * remains the fallback for files that carry no per-row year.
       */
      const rowEdition = row.source.previousEdition?.trim() || batch.sourceEdition
      const rowYear = /^\d{4}$/.test(rowEdition) ? Number(rowEdition) : batch.sourceYear

      const outcome = await importRow({
        batchId: batch.id,
        edition: rowEdition,
        year: rowYear,
        row,
      })

      await db.migratedUserRecord.update({
        where: { id: record.id },
        data: {
          status: 'IMPORTED',
          action: outcome.action,
          matchedUserId: outcome.userId,
          validationMessages: [
            ...messages,
            ...outcome.conflicts.map((c) => ({
              field: c.field,
              level: 'warning' as const,
              message: `Existing value "${c.existing}" kept; imported value "${c.incoming}" not applied.`,
            })),
          ] as never,
          /*
           * Never QUEUED here. The old code marked rows QUEUED at import when
           * the batch asked for invitations — without creating the jobs to
           * send them, which deadlocked the whole batch. The upload-time
           * choice is honoured once, in refreshBatchStatus, the moment the
           * import completes, through the same path as the Invite button.
           */
          invitationStatus: 'NOT_QUEUED',
        },
      })
    } catch (error) {
      await db.migratedUserRecord.update({
        where: { id: record.id },
        data: {
          status: 'FAILED',
          validationMessages: [
            {
              field: '_row',
              level: 'error',
              message: error instanceof Error ? error.message : 'Import failed.',
            },
          ] as never,
        },
      })
    }
  }
}

/** Recompute a batch's counters and status from its rows. */
export async function refreshBatchStatus(batchId: string) {
  const [counts, pendingJobs, failedJobs] = await Promise.all([
    db.migratedUserRecord.groupBy({
      by: ['status', 'action'],
      where: { batchId },
      _count: { _all: true },
    }),
    db.importJob.count({ where: { batchId, status: { in: ['PENDING', 'RUNNING'] } } }),
    db.importJob.count({ where: { batchId, status: 'FAILED' } }),
  ])

  const total = (status: string) =>
    counts.filter((c) => c.status === status).reduce((sum, c) => sum + c._count._all, 0)

  const created = counts
    .filter((c) => c.status === 'IMPORTED' && c.action === 'CREATE')
    .reduce((sum, c) => sum + c._count._all, 0)
  const matched = counts
    .filter((c) => c.status === 'IMPORTED' && c.action === 'MATCH_EXISTING')
    .reduce((sum, c) => sum + c._count._all, 0)

  const failed = total('FAILED')
  const batch = await db.migrationBatch.findUnique({
    where: { id: batchId },
    select: { status: true, sendInvitations: true, invitationsAutoQueuedAt: true, createdById: true },
  })
  if (!batch || batch.status === 'CANCELLED') return

  const done = pendingJobs === 0
  const status = !done
    ? 'IMPORTING'
    : failedJobs > 0 || failed > 0
      ? 'COMPLETED_WITH_WARNINGS'
      : 'COMPLETED'

  await db.migrationBatch.update({
    where: { id: batchId },
    data: {
      createdRows: created,
      matchedRows: matched,
      skippedRows: total('SKIPPED'),
      failedRows: failed,
      status,
      completedAt: done ? new Date() : null,
    },
  })

  /*
   * Honour the upload-time "send invitations" choice, exactly once, the moment
   * the import completes — through the same path as the Invite button, so the
   * jobs actually exist. The atomic null-guard means concurrent workers
   * finishing the last two chunks cannot both fire it.
   */
  if (done && batch.sendInvitations && !batch.invitationsAutoQueuedAt) {
    const guard = await db.migrationBatch.updateMany({
      where: { id: batchId, invitationsAutoQueuedAt: null },
      data: { invitationsAutoQueuedAt: new Date() },
    })
    if (guard.count === 1) {
      const queued = await createInvitationRun({ batchId, actorId: batch.createdById })
      if (!queued.ok) {
        console.info(`[migration] auto-queue for batch ${batchId}: ${queued.error}`)
      }
    }
  }
}
