import 'server-only'
import { eventConfig } from '@/config/site'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { getMailerMode } from '@/lib/mail/mailer'
import { getSetting } from '@/lib/settings'
import type { OutreachKind, Prisma } from '@/generated/prisma/client'
import {
  inviteEligibleWhere,
  unactivatedReminderWhere,
  unconfirmedReminderWhere,
} from './eligibility'

/**
 * Outreach runs: every bulk email leaves as a run of per-recipient attempts.
 *
 * A run is created in one transaction — run, attempts, jobs — with the
 * audience it was approved for snapshotted onto it. Jobs are keyed by a
 * per-run sequence, so a second run can never collide with the first's jobs:
 * the failure mode where "re-queue created nothing because those job keys
 * already existed" is structurally gone, not patched.
 */

export const OUTREACH_JOB_SIZE = 50

export type ReminderKind = 'REMINDER_UNACTIVATED' | 'REMINDER_UNCONFIRMED'

export async function reminderDefaults() {
  const [cooldownDays, maxRecipients] = await Promise.all([
    getSetting('reminder_cooldown_days'),
    getSetting('reminder_max_per_run'),
  ])
  return { cooldownDays, maxRecipients }
}

function reminderWhere(kind: ReminderKind, cooldownDays: number, edition: string) {
  const cutoff = new Date(Date.now() - cooldownDays * 86_400_000)
  return kind === 'REMINDER_UNACTIVATED'
    ? unactivatedReminderWhere(cutoff)
    : unconfirmedReminderWhere(cutoff, edition)
}

/** The number and a glimpse of who, for the confirmation dialog. */
export async function previewReminderRun(params: {
  kind: ReminderKind
  cooldownDays: number
}): Promise<{ count: number; sample: { email: string; firstName: string | null }[] }> {
  const where = reminderWhere(params.kind, params.cooldownDays, eventConfig.edition)
  const [count, sample] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      take: 5,
      orderBy: { createdAt: 'asc' },
      select: { email: true, profile: { select: { firstName: true } } },
    }),
  ])
  return {
    count,
    sample: sample.map((user) => ({ email: user.email, firstName: user.profile?.firstName ?? null })),
  }
}

/**
 * Create a reminder run under the counted-bulk contract: the server re-counts
 * with the same predicate the preview used and refuses if the audience has
 * changed since the administrator read the number. Eligibility is re-checked
 * again per attempt at send time, so even an accepted count can only shrink.
 */
export async function createReminderRun(params: {
  kind: ReminderKind
  cooldownDays: number
  maxRecipients: number
  expectedCount: number
  actorId: string
}): Promise<{ ok: true; runId: string; planned: number } | { ok: false; error: string }> {
  const edition = eventConfig.edition
  const where = reminderWhere(params.kind, params.cooldownDays, edition)

  const count = await db.user.count({ where })
  if (count !== params.expectedCount) {
    return {
      ok: false,
      error: `The audience changed while you were reading: it is now ${count}, not ${params.expectedCount}. Review the new number and try again.`,
    }
  }
  if (count === 0) return { ok: false, error: 'Nobody currently matches this reminder.' }

  const recipients = await db.user.findMany({
    where,
    take: params.maxRecipients,
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  })

  const run = await db.$transaction(async (tx) => {
    const created = await tx.outreachRun.create({
      data: {
        kind: params.kind,
        edition,
        templateKey:
          params.kind === 'REMINDER_UNACTIVATED' ? 'reminder_unactivated' : 'reminder_unconfirmed',
        filtersJson: {
          kind: params.kind,
          cooldownDays: params.cooldownDays,
          edition,
          approvedCount: count,
          capped: count > params.maxRecipients,
        } as Prisma.InputJsonValue,
        cooldownDays: params.cooldownDays,
        maxRecipients: params.maxRecipients,
        plannedCount: recipients.length,
        mailerMode: getMailerMode(),
        createdById: params.actorId,
      },
    })
    await tx.outreachAttempt.createMany({
      data: recipients.map((recipient) => ({
        runId: created.id,
        userId: recipient.id,
        email: recipient.email,
        kind: params.kind,
        dedupeKey: `${created.id}:${recipient.id}`,
      })),
    })
    const jobs = Math.ceil(recipients.length / OUTREACH_JOB_SIZE)
    await tx.outreachJob.createMany({
      data: Array.from({ length: jobs }, (_, seq) => ({
        runId: created.id,
        seq,
        size: OUTREACH_JOB_SIZE,
      })),
    })
    return created
  })

  await audit({
    action: 'migration.reminder_run_created',
    entityType: 'OutreachRun',
    entityId: run.id,
    actorId: params.actorId,
    metadata: {
      kind: params.kind,
      planned: recipients.length,
      approvedCount: count,
      cooldownDays: params.cooldownDays,
    },
  })

  return { ok: true, runId: run.id, planned: recipients.length }
}

/**
 * Queue this batch's initial invitations as an outreach run.
 *
 * Claims eligible rows first (the atomic `updateMany` is what makes two
 * concurrent clicks safe — the second claims nothing), then snapshots the
 * claimed rows into attempts. The per-record `invitationSentKey` remains the
 * one-send guarantee at send time, exactly as before.
 */
export async function createInvitationRun(params: {
  batchId: string
  actorId: string | null
}): Promise<{ ok: true; runId: string; queued: number } | { ok: false; error: string }> {
  const batch = await db.migrationBatch.findUnique({ where: { id: params.batchId } })
  if (!batch) return { ok: false, error: 'That batch no longer exists.' }
  if (batch.status !== 'COMPLETED' && batch.status !== 'COMPLETED_WITH_WARNINGS') {
    return { ok: false, error: 'Wait until the import has finished before sending invitations.' }
  }

  const eligible = await db.migratedUserRecord.updateMany({
    where: inviteEligibleWhere(batch.id),
    data: { invitationStatus: 'QUEUED', invitationError: null },
  })
  if (eligible.count === 0) {
    return { ok: false, error: 'There is nobody left to invite in this batch.' }
  }

  const claimed = await db.migratedUserRecord.findMany({
    where: {
      batchId: batch.id,
      invitationStatus: 'QUEUED',
      invitationSentKey: null,
      excludedFromInvites: false,
      activatedAt: null,
    },
    orderBy: { rowNumber: 'asc' },
    select: { id: true, matchedUserId: true, normalisedEmail: true },
  })

  const run = await db.$transaction(async (tx) => {
    const created = await tx.outreachRun.create({
      data: {
        kind: 'INVITATION',
        edition: batch.sourceEdition,
        templateKey: 'migration_invitation',
        batchId: batch.id,
        filtersJson: { batchId: batch.id, claimed: claimed.length } as Prisma.InputJsonValue,
        plannedCount: claimed.length,
        mailerMode: getMailerMode(),
        createdById: params.actorId,
      },
    })
    await tx.outreachAttempt.createMany({
      data: claimed.map((record) => ({
        runId: created.id,
        userId: record.matchedUserId,
        recordId: record.id,
        email: record.normalisedEmail,
        kind: 'INVITATION' as OutreachKind,
        dedupeKey: `${created.id}:${record.id}`,
      })),
      // A concurrent click that claimed an overlapping set loses here quietly;
      // the per-record sentKey makes a double SEND impossible regardless.
      skipDuplicates: true,
    })
    const jobs = Math.ceil(claimed.length / OUTREACH_JOB_SIZE)
    await tx.outreachJob.createMany({
      data: Array.from({ length: jobs }, (_, seq) => ({
        runId: created.id,
        seq,
        size: OUTREACH_JOB_SIZE,
      })),
    })
    return created
  })

  await audit({
    action: 'migration.invitations_queued',
    entityType: 'MigrationBatch',
    entityId: batch.id,
    actorId: params.actorId,
    metadata: { queued: claimed.length, runId: run.id },
  })

  return { ok: true, runId: run.id, queued: claimed.length }
}

export async function cancelOutreachRun(params: {
  runId: string
  actorId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const flipped = await db.outreachRun.updateMany({
    where: { id: params.runId, status: { in: ['QUEUED', 'RUNNING'] } },
    data: { status: 'CANCELLED', completedAt: new Date() },
  })
  if (flipped.count === 0) {
    return { ok: false, error: 'This run has already finished or was cancelled.' }
  }
  await db.$transaction([
    db.outreachJob.updateMany({
      where: { runId: params.runId, status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'CANCELLED', completedAt: new Date() },
    }),
    db.outreachAttempt.updateMany({
      where: { runId: params.runId, status: 'QUEUED' },
      data: { status: 'SKIPPED', error: 'Run cancelled before this attempt was processed.' },
    }),
  ])
  await audit({
    action: 'migration.reminder_run_cancelled',
    entityType: 'OutreachRun',
    entityId: params.runId,
    actorId: params.actorId,
  })
  return { ok: true }
}

export async function getOutreachRunProgress(runId: string) {
  const [run, byStatus, pendingJobs] = await Promise.all([
    db.outreachRun.findUnique({ where: { id: runId } }),
    db.outreachAttempt.groupBy({ by: ['status'], where: { runId }, _count: { _all: true } }),
    db.outreachJob.count({ where: { runId, status: { in: ['PENDING', 'RUNNING'] } } }),
  ])
  if (!run) return null
  const count = (status: string) =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0
  return {
    run,
    pendingJobs,
    queued: count('QUEUED') + count('SENDING'),
    sent: count('SENT'),
    failed: count('FAILED'),
    skipped: count('SKIPPED'),
  }
}
