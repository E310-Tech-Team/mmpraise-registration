import 'server-only'
import { eventConfig } from '@/config/site'
import { db } from '@/lib/db'
import { can, departmentScope } from '@/lib/auth/rbac'
import type { SessionUser } from '@/lib/auth/session'
import { getSettings } from '@/lib/settings'
import type { Prisma } from '@/generated/prisma/client'
import {
  AWAITING_REVIEW_STATUSES,
  confirmedParticipationWhere,
  LEGACY_APPLICATION_STATUSES,
  newMessagesWhere,
  pendingTestimoniesWhere,
  registeredUnconfirmedWhere,
  REGISTERED_STATUSES,
  submissionTrend,
} from '@/lib/admin/metrics'
import { participantSummary, stageCounts } from '@/lib/admin/participants'

/**
 * Everything the admin overview shows, in one shape.
 *
 * Two rules hold for every figure here, and the e2e suite asserts them:
 *
 *  1. **Same predicate as the destination.** Each count's where-clause comes
 *     from src/lib/admin/metrics.ts or src/lib/admin/participants.ts — the
 *     same modules the list pages and exports use — so a card saying 771
 *     opens a list saying 771.
 *  2. **Same scope as the viewer.** A department head's numbers are their
 *     departments' numbers; the old overview showed platform-wide totals that
 *     shrank mysteriously on click-through.
 */

export type AttentionTone = 'danger' | 'warning' | 'info'
export type AttentionItem = {
  id: string
  label: string
  count: number
  href: string
  tone: AttentionTone
}

export type OverviewData = Awaited<ReturnType<typeof getOverview>>

export async function getOverview(user: SessionUser) {
  const edition = eventConfig.edition
  const scope = departmentScope(user)
  const settings = await getSettings()

  /*
   * The viewer's slice of the application table, mirroring buildWhere: scope
   * reaches department through this edition's participation, and an empty
   * scope matches nothing.
   */
  const scopeWhere: Prisma.VolunteerApplicationWhereInput =
    scope === null
      ? {}
      : {
          participations: {
            some: { edition, departmentId: scope.length > 0 ? { in: scope } : '__none__' },
          },
        }
  const scoped = (
    where: Prisma.VolunteerApplicationWhereInput,
  ): Prisma.VolunteerApplicationWhereInput => ({ AND: [scopeWhere, where] })

  const participationScope: Prisma.EditionParticipationWhereInput =
    scope === null ? {} : { departmentId: scope.length > 0 ? { in: scope } : '__none__' }

  // ------------------------------------------------------------ registrations
  const [applicationsByStatus, unconfirmed, submittedLast7Days] = await Promise.all([
    db.volunteerApplication.groupBy({
      by: ['status'],
      where: scopeWhere,
      _count: { _all: true },
    }),
    // Registered volunteers who have not yet said "I am coming this edition"
    // — the number the whole activation campaign exists to drive down.
    db.volunteerApplication.count({ where: scoped(registeredUnconfirmedWhere(edition)) }),
    db.volunteerApplication.count({
      where: scoped({ submittedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }),
    }),
  ])

  const appCount = (status: string) =>
    applicationsByStatus.find((row) => row.status === status)?._count._all ?? 0
  const registered = REGISTERED_STATUSES.reduce((sum, status) => sum + appCount(status), 0)
  const legacyStatuses = LEGACY_APPLICATION_STATUSES.reduce(
    (sum, status) => sum + appCount(status),
    0,
  )
  const awaitingReview = AWAITING_REVIEW_STATUSES.reduce(
    (sum, status) => sum + appCount(status),
    0,
  )

  // ------------------------------------------------------------ participation
  const confirmedWhere: Prisma.EditionParticipationWhereInput = {
    AND: [confirmedParticipationWhere(edition), participationScope],
  }
  const [participationsByStatus, withdrawn] = await Promise.all([
    db.editionParticipation.groupBy({
      by: ['status'],
      where: confirmedWhere,
      _count: { _all: true },
    }),
    db.editionParticipation.count({
      where: { AND: [{ edition, status: 'WITHDRAWN' }, participationScope] },
    }),
  ])
  const partCount = (status: string) =>
    participationsByStatus.find((row) => row.status === status)?._count._all ?? 0
  const confirmed = participationsByStatus.reduce((sum, row) => sum + row._count._all, 0)

  // ------------------------------------------------------------- migration
  const showMigration = can(user, 'migration:view')
  const migration = showMigration
    ? await (async () => {
        const [people, stages, failedRows, invalidRows, failedInvitationRows, runningBatches, sendsInFlight] =
          await Promise.all([
            participantSummary(edition),
            stageCounts(edition),
            db.migratedUserRecord.count({ where: { status: 'FAILED' } }),
            db.migratedUserRecord.count({ where: { status: 'INVALID' } }),
            db.migratedUserRecord.count({ where: { invitationStatus: 'FAILED' } }),
            db.migrationBatch.count({ where: { status: { in: ['QUEUED', 'IMPORTING'] } } }),
            db.outreachAttempt.count({ where: { status: { in: ['QUEUED', 'SENDING'] } } }),
          ])
        return { people, stages, failedRows, invalidRows, failedInvitationRows, runningBatches, sendsInFlight }
      })()
    : null

  // ------------------------------------------------------------ follow-ups
  const showFollowUps = can(user, 'migration:followup')
  const followUpsDue = showFollowUps
    ? await (async () => {
        /*
         * Due = the latest contact for a person sets a follow-up date that has
         * arrived, the staff outcome still wants chasing, and no qualifying
         * response has happened since — the person has not confirmed this
         * edition and has not activated after that contact. Derived, never
         * written: a response clears the queue without anyone editing the log.
         */
        const rows = await db.$queryRaw<{ due: bigint; overdue: bigint }[]>`
          SELECT
            count(*) FILTER (WHERE l."nextFollowUpAt" <= now()) AS due,
            count(*) FILTER (WHERE l."nextFollowUpAt" < now() - interval '1 day') AS overdue
          FROM users u
          JOIN LATERAL (
            SELECT * FROM participant_contact_logs pl
            WHERE pl."userId" = u."id"
            ORDER BY pl."contactedAt" DESC
            LIMIT 1
          ) l ON true
          WHERE l."nextFollowUpAt" IS NOT NULL
            AND l."outcome" IN ('AWAITING_RESPONSE', 'NEEDS_ASSISTANCE', 'UNREACHABLE')
            AND NOT EXISTS (
              SELECT 1 FROM edition_participations ep
              JOIN volunteer_applications va ON va."id" = ep."applicationId"
              WHERE va."userId" = u."id" AND ep."edition" = ${edition} AND ep."confirmedAt" IS NOT NULL
            )
            AND NOT (u."emailVerifiedAt" IS NOT NULL AND u."emailVerifiedAt" > l."contactedAt")
        `
        return { due: Number(rows[0]?.due ?? 0), overdue: Number(rows[0]?.overdue ?? 0) }
      })()
    : null

  // ---------------------------------------------------------- communications
  /*
   * Gated by the destination's own permission, and counting what the inbox
   * actually shows by default (no test data, no spam) — a figure somebody
   * cannot click through to, or that melts on arrival, trains people to
   * distrust the whole dashboard.
   */
  const showMessages = can(user, 'contact:manage')
  const showTestimonies = can(user, 'testimony:moderate')
  const comms =
    showMessages || showTestimonies
      ? {
          newMessages: showMessages
            ? await db.contactMessage.count({ where: newMessagesWhere() })
            : null,
          pendingTestimonies: showTestimonies
            ? await db.testimonySubmission.count({ where: pendingTestimoniesWhere() })
            : null,
        }
      : null

  // ---------------------------------------------------------- needs attention
  /*
   * Only queues that are non-empty appear, most urgent first. An empty list is
   * itself the message — it renders as "nothing is waiting on you", which is
   * the sentence every operational dashboard is trying to earn.
   */
  const needsAttention: AttentionItem[] = []
  if (awaitingReview > 0) {
    needsAttention.push({
      id: 'review',
      label: 'applications awaiting review',
      count: awaitingReview,
      href: '/admin/applications?status=SUBMITTED,UNDER_REVIEW',
      tone: 'warning',
    })
  }
  if (followUpsDue && followUpsDue.overdue > 0) {
    needsAttention.push({
      id: 'followups-overdue',
      label: 'follow-ups overdue',
      count: followUpsDue.overdue,
      href: '/admin/previous-participants/people?followup=overdue',
      tone: 'danger',
    })
  }
  if (followUpsDue && followUpsDue.due - followUpsDue.overdue > 0) {
    needsAttention.push({
      id: 'followups-due',
      label: 'follow-ups due',
      count: followUpsDue.due - followUpsDue.overdue,
      href: '/admin/previous-participants/people?followup=due',
      tone: 'warning',
    })
  }
  if (migration && migration.failedRows > 0) {
    needsAttention.push({
      id: 'failed-rows',
      label: 'import rows failed',
      count: migration.failedRows,
      href: '/admin/previous-participants/rows?status=FAILED',
      tone: 'danger',
    })
  }
  if (migration && migration.failedInvitationRows > 0) {
    needsAttention.push({
      id: 'failed-invites',
      label: 'invitation emails failed',
      count: migration.failedInvitationRows,
      href: '/admin/previous-participants/rows?invitation=FAILED',
      tone: 'danger',
    })
  }
  if (comms?.newMessages) {
    needsAttention.push({
      id: 'messages',
      label: 'unanswered new messages',
      count: comms.newMessages,
      href: '/admin/messages',
      tone: 'warning',
    })
  }
  if (comms?.pendingTestimonies) {
    needsAttention.push({
      id: 'testimonies',
      label: 'testimonies awaiting moderation',
      count: comms.pendingTestimonies,
      href: '/admin/testimonies',
      tone: 'info',
    })
  }
  const toneRank: Record<AttentionTone, number> = { danger: 0, warning: 1, info: 2 }
  needsAttention.sort((a, b) => toneRank[a.tone] - toneRank[b.tone])

  // ------------------------------------------------------------ distributions
  const [byDepartment, byCountry, byAgeRange, departments] = await Promise.all([
    db.editionParticipation.groupBy({
      by: ['departmentId'],
      // The same "Confirmed" definition as the card above and the list the
      // bars open — the wording "confirmed volunteers" is finally true.
      where: confirmedWhere,
      _count: { _all: true },
    }),
    db.volunteerProfile.groupBy({
      by: ['countryId'],
      where: { user: { applications: { some: scoped({ status: { not: 'DRAFT' } }) } } },
      _count: { _all: true },
      orderBy: { _count: { countryId: 'desc' } },
      take: 8,
    }),
    db.volunteerProfile.groupBy({
      by: ['ageRange'],
      where: { user: { applications: { some: scoped({ status: { not: 'DRAFT' } }) } } },
      _count: { _all: true },
    }),
    db.department.findMany({ select: { id: true, name: true } }),
  ])

  const countries = await db.country.findMany({
    where: { id: { in: byCountry.map((c) => c.countryId).filter((id): id is string => Boolean(id)) } },
    select: { id: true, name: true },
  })

  // ----------------------------------------------------------------- trend
  const trend = await submissionTrend({ weeks: 12, edition, scope })

  // --------------------------------------------------------- recent activity
  const showActivity = can(user, 'audit:view')
  const recentActivity = showActivity
    ? await db.auditLog.findMany({
        /*
         * Routine sign-ins are excluded here — an administrator's own logins
         * would otherwise be most of the feed, and "what happened recently?"
         * would answer "you did". The Activity Log itself keeps every event.
         */
        where: { action: { notIn: ['auth.login', 'auth.logout'] } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          action: true,
          createdAt: true,
          actor: { select: { username: true } },
        },
      })
    : []

  return {
    /** When these numbers were computed — the page's "Updated …" line. */
    generatedAt: new Date(),
    edition,
    /** True when every figure is limited to the viewer's departments. */
    departmentScoped: scope !== null,
    event: {
      registrationOpen: settings.registration_open,
    },
    applications: {
      /** Non-draft — the same population as /admin/applications unfiltered. */
      registered,
      draft: appCount('DRAFT'),
      submitted: appCount('SUBMITTED'),
      underReview: appCount('UNDER_REVIEW'),
      approved: appCount('APPROVED'),
      waitlisted: appCount('WAITLISTED'),
      rejected: appCount('REJECTED'),
      legacyStatuses,
      awaitingReview,
      submittedLast7Days,
    },
    participations: {
      confirmed,
      signedUp: partCount('SIGNED_UP'),
      assigned: partCount('ASSIGNED'),
      checkedIn: partCount('CHECKED_IN'),
      completed: partCount('COMPLETED'),
      withdrawn,
      unconfirmed,
    },
    migration,
    followUpsDue,
    comms,
    needsAttention,
    /*
     * Each row carries the id it was grouped by, not just a name, so the
     * overview can link into the filtered applicant list. A bar that reports
     * "Ushering 120" and cannot tell you *which* 120 is a dead end — the
     * number is only useful if you can act on the people behind it.
     */
    distributions: {
      byDepartment: byDepartment
        .map((row) => ({
          id: row.departmentId,
          name: departments.find((d) => d.id === row.departmentId)?.name ?? 'No department yet',
          count: row._count._all,
        }))
        .sort((a, b) => b.count - a.count),
      byCountry: byCountry.map((row) => ({
        id: row.countryId,
        name: countries.find((c) => c.id === row.countryId)?.name ?? 'Unknown',
        count: row._count._all,
      })),
      byAgeRange: byAgeRange
        .map((row) => ({ ageRange: row.ageRange, count: row._count._all }))
        .sort((a, b) => (a.ageRange ?? '').localeCompare(b.ageRange ?? '')),
    },
    trend,
    recentActivity,
  }
}
