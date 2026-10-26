import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { UNUSABLE_PASSWORD } from '@/lib/migration/import'

/**
 * Who may be emailed, as data.
 *
 * Every audience is a named where-builder so the same predicate serves four
 * masters that must never disagree: the preview count an administrator
 * approves, the attempt rows a run creates, the re-check each attempt gets at
 * send time, and the dashboard figures reporting it all afterwards.
 *
 * The sentinel comparison is the authoritative "cannot sign in" test: a
 * migrated account keeps `UNUSABLE_PASSWORD` until the person completes a
 * password reset. If migrated accounts are ever re-hashed, switch these
 * predicates to `emailVerifiedAt: null` — noted here so that change cannot be
 * missed.
 */

/** Nobody who was successfully emailed inside the window, whatever the kind. */
export function cooldownClear(cutoff: Date): Prisma.UserWhereInput {
  return { outreachAttempts: { none: { status: 'SENT', sentAt: { gte: cutoff } } } }
}

/**
 * Exclusions an administrator or the person themselves has expressed:
 * a migration row excluded from invites, or any logged contact where the
 * person declined. DECLINED is read as standing — one recorded "no" keeps a
 * person out of every reminder audience until the log says otherwise is
 * deliberate policy, in which case remove the entry… which append-only logs
 * do not allow: an administrator who believes the person has changed their
 * mind records the new conversation and contacts them manually.
 */
export function notExcluded(): Prisma.UserWhereInput {
  return {
    migratedRecords: { none: { excludedFromInvites: true } },
    contactLogs: { none: { outcome: 'DECLINED' } },
  }
}

/**
 * "Activate your account" audience: imported people who cannot yet sign in.
 */
export function unactivatedReminderWhere(cutoff: Date): Prisma.UserWhereInput {
  return {
    isPreviousEditionUser: true,
    isActive: true,
    passwordHash: UNUSABLE_PASSWORD,
    AND: [notExcluded(), cooldownClear(cutoff)],
  }
}

/**
 * "Confirm your availability" audience — decided 2026-10-13: everyone
 * unconfirmed, not just migrated people. A usable account, no confirmed
 * participation for the edition, and some relationship with volunteering —
 * previous-participant history or an application of any status. Account-only
 * signups that never started anything are deliberately out of scope.
 */
export function unconfirmedReminderWhere(cutoff: Date, edition: string): Prisma.UserWhereInput {
  return {
    isActive: true,
    passwordHash: { not: UNUSABLE_PASSWORD },
    applications: {
      none: { participations: { some: { edition, confirmedAt: { not: null } } } },
    },
    OR: [{ isPreviousEditionUser: true }, { applications: { some: {} } }],
    AND: [notExcluded(), cooldownClear(cutoff)],
  }
}

/**
 * Migration rows an "Invite" click may claim — the single definition shared by
 * the batch page's count, the claim itself, and the send-time re-check.
 * `QUEUED` is included deliberately: the retired invite-job pipeline stranded
 * rows in that state, and including it makes the next click self-healing.
 */
export function inviteEligibleWhere(batchId: string): Prisma.MigratedUserRecordWhereInput {
  return {
    batchId,
    status: 'IMPORTED',
    action: 'CREATE',
    excludedFromInvites: false,
    activatedAt: null,
    invitationStatus: { in: ['NOT_QUEUED', 'FAILED', 'QUEUED'] },
    invitationSentKey: null,
  }
}
