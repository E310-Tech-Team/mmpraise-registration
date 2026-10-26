import 'server-only'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { env } from '@/lib/env'
import { sendMailTracked } from '@/lib/mail/mailer'
import {
  migrationInvitationEmail,
  reminderUnactivatedEmail,
  reminderUnconfirmedEmail,
} from '@/lib/mail/templates'
import type { OutreachRun, Prisma } from '@/generated/prisma/client'
import { unactivatedReminderWhere, unconfirmedReminderWhere } from './eligibility'

/**
 * The outreach worker.
 *
 * Same discipline as the import worker — jobs claimed with FOR UPDATE SKIP
 * LOCKED, bounded slices, nothing inside a browser request — plus one rule the
 * old invitation pipeline lacked: every recipient's eligibility is re-checked
 * at the moment of sending. A person who activated, confirmed, declined or was
 * emailed elsewhere since the run was approved is SKIPPED with the reason
 * recorded, so a stale approved count can only ever shrink, never over-send.
 */

/** SENDING rows older than this are a crashed worker's; sweep them back. */
const STALE_SENDING_MINUTES = 15

type ClaimedOutreachJob = {
  id: string
  runId: string
  seq: number
  size: number
  attempts: number
  maxAttempts: number
}

async function claimOutreachJob(): Promise<ClaimedOutreachJob | null> {
  const rows = await db.$queryRaw<ClaimedOutreachJob[]>`
    UPDATE outreach_jobs
    SET status = 'RUNNING', "claimedAt" = now(), attempts = attempts + 1, "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM outreach_jobs
      WHERE status = 'PENDING'
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, "runId", seq, size, attempts, "maxAttempts"
  `
  return rows[0] ?? null
}

async function finishOutreachJob(job: ClaimedOutreachJob, error?: unknown) {
  if (!error) {
    await db.outreachJob.update({
      where: { id: job.id },
      data: { status: 'COMPLETED', completedAt: new Date(), lastError: null },
    })
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  const exhausted = job.attempts >= job.maxAttempts
  await db.outreachJob.update({
    where: { id: job.id },
    data: {
      status: exhausted ? 'FAILED' : 'PENDING',
      lastError: message.slice(0, 500),
      completedAt: exhausted ? new Date() : null,
    },
  })
}

/** Advance pending outreach jobs until none remain or the budget is spent. */
export async function runOutreachQueue({ maxJobs = 20 }: { maxJobs?: number } = {}): Promise<{
  processed: number
}> {
  let processed = 0

  for (let i = 0; i < maxJobs; i += 1) {
    const job = await claimOutreachJob()
    if (!job) break

    try {
      await processOutreachJob(job)
      await finishOutreachJob(job)
    } catch (error) {
      console.error('[outreach] job failed', job.id, error)
      await finishOutreachJob(job, error)
    }

    processed += 1
    await finaliseRunIfDone(job.runId)
  }

  return { processed }
}

async function processOutreachJob(job: ClaimedOutreachJob) {
  const run = await db.outreachRun.findUnique({ where: { id: job.runId } })
  if (!run || run.status === 'CANCELLED') return

  // First worker to touch the run marks it started.
  await db.outreachRun.updateMany({
    where: { id: run.id, startedAt: null },
    data: { status: 'RUNNING', startedAt: new Date() },
  })

  // Sweep a crashed worker's leavings back into the queue — bounded delay,
  // never a duplicate (the dedupe key and, for invitations, the sent key).
  await db.outreachAttempt.updateMany({
    where: {
      runId: run.id,
      status: 'SENDING',
      claimedAt: { lt: new Date(Date.now() - STALE_SENDING_MINUTES * 60_000) },
    },
    data: { status: 'QUEUED', claimedAt: null },
  })

  // Claim a slice of attempts the same way jobs are claimed.
  const claimed = await db.$queryRaw<{ id: string }[]>`
    UPDATE outreach_attempts
    SET status = 'SENDING', "claimedAt" = now()
    WHERE id IN (
      SELECT id FROM outreach_attempts
      WHERE "runId" = ${run.id} AND status = 'QUEUED'
      ORDER BY "queuedAt", id
      FOR UPDATE SKIP LOCKED
      LIMIT ${job.size}
    )
    RETURNING id
  `
  if (claimed.length === 0) return

  const attempts = await db.outreachAttempt.findMany({
    where: { id: { in: claimed.map((row) => row.id) } },
    include: ATTEMPT_INCLUDE,
    orderBy: { queuedAt: 'asc' },
  })

  for (const attempt of attempts) {
    if (run.kind === 'INVITATION') await processInvitationAttempt(run, attempt)
    else await processReminderAttempt(run, attempt)
  }
}

const ATTEMPT_INCLUDE = {
  user: { select: { id: true, email: true, profile: { select: { firstName: true } } } },
  record: {
    select: {
      id: true,
      batchId: true,
      rowNumber: true,
      firstName: true,
      normalisedEmail: true,
      excludedFromInvites: true,
      activatedAt: true,
      invitationSentKey: true,
    },
  },
} satisfies Prisma.OutreachAttemptInclude

type LoadedAttempt = Prisma.OutreachAttemptGetPayload<{ include: typeof ATTEMPT_INCLUDE }>

async function skip(attemptId: string, reason: string) {
  await db.outreachAttempt.update({
    where: { id: attemptId },
    data: { status: 'SKIPPED', error: reason },
  })
}

async function processInvitationAttempt(run: OutreachRun, attempt: LoadedAttempt) {
  const record = attempt.record
  if (!record) return skip(attempt.id, 'Migration record no longer exists.')
  if (record.excludedFromInvites) return skip(attempt.id, 'Excluded by an administrator.')
  if (record.activatedAt) return skip(attempt.id, 'Already activated.')

  // The one-send guarantee, unchanged: claim the key before sending. A zero
  // count means another pass (or an earlier run) already sent to this person.
  const sendKey = `${record.batchId}:${record.rowNumber}`
  const keyClaimed = await db.migratedUserRecord.updateMany({
    where: { id: record.id, invitationSentKey: null },
    data: { invitationSentKey: sendKey },
  })
  if (keyClaimed.count === 0) return skip(attempt.id, 'An invitation was already sent.')

  const message = migrationInvitationEmail({
    name: record.firstName ?? 'there',
    edition: run.edition,
    loginUrl: `${env.APP_URL}/login`,
    resetUrl: `${env.APP_URL}/forgot-password`,
    supportEmail: env.SUPPORT_EMAIL,
  })
  const result = await sendMailTracked({ ...message, to: record.normalisedEmail })

  await db.$transaction([
    db.outreachAttempt.update({
      where: { id: attempt.id },
      data: {
        status: result.accepted ? 'SENT' : 'FAILED',
        sentAt: result.accepted ? new Date() : null,
        mailerMode: result.mode,
        error: result.accepted ? null : (result.error ?? 'Mail transport error.'),
        email: record.normalisedEmail,
      },
    }),
    db.migratedUserRecord.update({
      where: { id: record.id },
      data: {
        // SENT means the transport accepted it; delivery is a different fact
        // nobody here knows (no provider webhook).
        invitationStatus: result.accepted ? 'SENT' : 'FAILED',
        invitedAt: result.accepted ? new Date() : null,
        invitationError: result.accepted
          ? null
          : (result.error ?? 'Mail provider did not accept the message.'),
        // Released on failure so a later run may retry.
        invitationSentKey: result.accepted ? sendKey : null,
      },
    }),
  ])
}

async function processReminderAttempt(run: OutreachRun, attempt: LoadedAttempt) {
  if (!attempt.userId || !attempt.user) {
    return skip(attempt.id, 'Account no longer exists.')
  }

  // Re-check eligibility now, with the run's own cooldown. The predicate is
  // the same builder the preview counted with — one definition, three uses.
  const cutoff = new Date(Date.now() - run.cooldownDays * 86_400_000)
  const where =
    run.kind === 'REMINDER_UNACTIVATED'
      ? unactivatedReminderWhere(cutoff)
      : unconfirmedReminderWhere(cutoff, run.edition)
  const stillEligible = await db.user.count({ where: { AND: [{ id: attempt.userId }, where] } })
  if (stillEligible === 0) {
    return skip(attempt.id, 'No longer eligible (responded, excluded or inside the cooldown).')
  }

  const name = attempt.user.profile?.firstName ?? 'there'
  const message =
    run.kind === 'REMINDER_UNACTIVATED'
      ? reminderUnactivatedEmail({
          name,
          edition: run.edition,
          resetUrl: `${env.APP_URL}/forgot-password`,
          supportEmail: env.SUPPORT_EMAIL,
        })
      : reminderUnconfirmedEmail({
          name,
          edition: run.edition,
          applyUrl: `${env.APP_URL}/apply`,
          supportEmail: env.SUPPORT_EMAIL,
        })

  // The account's current address, not the snapshot — people change emails.
  const result = await sendMailTracked({ ...message, to: attempt.user.email })

  await db.outreachAttempt.update({
    where: { id: attempt.id },
    data: {
      status: result.accepted ? 'SENT' : 'FAILED',
      sentAt: result.accepted ? new Date() : null,
      mailerMode: result.mode,
      error: result.accepted ? null : (result.error ?? 'Mail transport error.'),
      email: attempt.user.email,
    },
  })
}

/**
 * The last job out closes the run: recount, set the final status, audit once.
 * The `updateMany` transition from RUNNING is the exactly-once guard — two
 * workers racing here both recount, but only one wins the transition and
 * writes the audit row.
 */
async function finaliseRunIfDone(runId: string) {
  const [open, pendingJobs] = await Promise.all([
    db.outreachAttempt.count({ where: { runId, status: { in: ['QUEUED', 'SENDING'] } } }),
    db.outreachJob.count({ where: { runId, status: { in: ['PENDING', 'RUNNING'] } } }),
  ])
  if (open > 0 || pendingJobs > 0) return

  const byStatus = await db.outreachAttempt.groupBy({
    by: ['status'],
    where: { runId },
    _count: { _all: true },
  })
  const count = (status: string) => byStatus.find((row) => row.status === status)?._count._all ?? 0
  const sent = count('SENT')
  const failed = count('FAILED')
  const skipped = count('SKIPPED')

  const closed = await db.outreachRun.updateMany({
    where: { id: runId, status: { in: ['QUEUED', 'RUNNING'] } },
    data: {
      status: failed > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      sentCount: sent,
      failedCount: failed,
      skippedCount: skipped,
      completedAt: new Date(),
    },
  })
  if (closed.count === 0) return

  const run = await db.outreachRun.findUnique({ where: { id: runId }, select: { kind: true } })
  await audit({
    action: 'migration.outreach_completed',
    entityType: 'OutreachRun',
    entityId: runId,
    metadata: { kind: run?.kind, sent, failed, skipped },
  })
}
