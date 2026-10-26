import 'server-only'
import { db } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import type { ContactOutcome, InvitationStatus } from '@/generated/prisma/client'
import { UNUSABLE_PASSWORD } from '@/lib/migration/import'

/**
 * Previous participants, person-first.
 *
 * The entity here is always the **User** — the authoritative identity. A
 * person imported in 2024's file and matched again in 2026's file is one
 * person, however many `MigratedUserRecord` rows mention them; anything
 * counted off rows is labelled "rows" in the UI, never "people".
 *
 * `stageWhere` is a precedence ladder. Each stage's predicate subtracts every
 * stage above it, so the six stages partition the population: every previous
 * participant lands in exactly one, and the stage counts always sum to the
 * total. That is what lets a dashboard card, its drill-down list, the stacked
 * chart and the export all show the same number — they all call this module.
 */

/**
 * Profile reviews only exist from the day the recording hook shipped; the
 * dashboard says so instead of presenting earlier history as zeros.
 */
export const PROFILE_REVIEW_TRACKED_SINCE = new Date('2026-10-13T00:00:00+01:00')

/** A previous participant: anyone with recorded history from an earlier edition. */
export function previousParticipantWhere(): Prisma.UserWhereInput {
  return { previousParticipations: { some: {} } }
}

export const RESPONSE_STAGES = [
  'excluded',
  'confirmed',
  'started',
  'activated',
  'invited',
  'not_invited',
] as const
export type ResponseStage = (typeof RESPONSE_STAGES)[number]

export const STAGE_LABELS: Record<ResponseStage, string> = {
  excluded: 'Excluded from contact',
  confirmed: 'Confirmed this edition',
  started: 'Started, not confirmed',
  activated: 'Activated, not started',
  invited: 'Invited, not activated',
  not_invited: 'Not yet invited',
}

/** The bare condition for each stage, without precedence subtraction. */
function stageCondition(stage: ResponseStage, edition: string): Prisma.UserWhereInput {
  switch (stage) {
    case 'excluded':
      return { migratedRecords: { some: { excludedFromInvites: true } } }
    case 'confirmed':
      return {
        applications: {
          some: { participations: { some: { edition, confirmedAt: { not: null } } } },
        },
      }
    case 'started':
      // An application of any status — a DRAFT is somebody mid-wizard.
      return { applications: { some: {} } }
    case 'activated':
      // Account usable: the migrated sentinel is gone (MATCH_EXISTING accounts
      // never had it, which is correct — they could always sign in).
      return { passwordHash: { not: UNUSABLE_PASSWORD } }
    case 'invited':
      // A successful send survives activation: the sent key is never released
      // after success, so it is the durable "was invited" artefact.
      return { migratedRecords: { some: { invitationSentKey: { not: null } } } }
    case 'not_invited':
      return {}
  }
}

/** The stage's predicate with every higher stage subtracted — a partition. */
export function stageWhere(stage: ResponseStage, edition: string): Prisma.UserWhereInput {
  const ladder = RESPONSE_STAGES.slice(0, RESPONSE_STAGES.indexOf(stage))
  return {
    AND: [
      previousParticipantWhere(),
      stageCondition(stage, edition),
      ...ladder.map((higher) => ({ NOT: stageCondition(higher, edition) })),
    ],
  }
}

/**
 * The same precedence ladder as `stageWhere`, over already-fetched facts —
 * used to label each row of a page without six extra queries. The unit test
 * walks every combination of these flags and asserts the two never disagree.
 */
export function deriveStage(facts: {
  excluded: boolean
  confirmed: boolean
  started: boolean
  activated: boolean
  invited: boolean
}): ResponseStage {
  if (facts.excluded) return 'excluded'
  if (facts.confirmed) return 'confirmed'
  if (facts.started) return 'started'
  if (facts.activated) return 'activated'
  if (facts.invited) return 'invited'
  return 'not_invited'
}

export async function stageCounts(edition: string): Promise<Record<ResponseStage, number>> {
  const counts = await Promise.all(
    RESPONSE_STAGES.map((stage) => db.user.count({ where: stageWhere(stage, edition) })),
  )
  return Object.fromEntries(RESPONSE_STAGES.map((stage, i) => [stage, counts[i]])) as Record<
    ResponseStage,
    number
  >
}

/**
 * Compound figures the dashboard reports beside the stages. Numerators and
 * denominators are returned together so the UI can never show a percentage
 * without being able to say "of what".
 */
export async function participantSummary(edition: string) {
  const [total, excluded, invitedEver, invitable, activatedPlus, confirmed, reviewed] =
    await Promise.all([
      db.user.count({ where: previousParticipantWhere() }),
      db.user.count({
        where: { AND: [previousParticipantWhere(), stageCondition('excluded', edition)] },
      }),
      // People ever successfully sent an invitation (survives activation).
      db.user.count({
        where: { AND: [previousParticipantWhere(), stageCondition('invited', edition)] },
      }),
      // People an invitation could reach: imported accounts, not excluded.
      db.user.count({
        where: {
          AND: [
            previousParticipantWhere(),
            { isPreviousEditionUser: true },
            { NOT: stageCondition('excluded', edition) },
          ],
        },
      }),
      // Usable account, whatever happened after.
      db.user.count({
        where: { AND: [previousParticipantWhere(), stageCondition('activated', edition)] },
      }),
      db.user.count({
        where: { AND: [previousParticipantWhere(), stageCondition('confirmed', edition)] },
      }),
      db.user.count({
        where: { AND: [previousParticipantWhere(), { profileReviewedAt: { not: null } }] },
      }),
    ])

  return {
    total,
    excluded,
    invitedEver,
    invitable,
    activated: activatedPlus,
    confirmed,
    reviewed,
    /** Everyone still being chased: not excluded, not yet confirmed. */
    unresponded: total - excluded - confirmed,
  }
}

// ---------------------------------------------------------------------------
// The person-level list (previous-participants → People)
// ---------------------------------------------------------------------------

export type ParticipantFilters = {
  /** Name, email, phone or MMP number. */
  q?: string
  stage?: string
  /** A previous edition they served in, e.g. '2025'. */
  edition?: string
  /** Import batch id. */
  batch?: string
  /** Previous department, verbatim legacy text. */
  department?: string
  invitation?: string
  invited?: string
  activated?: string
  reviewed?: string
  responded?: string
  followup?: string
  outcome?: string
}

const INVITATION_STATUSES: readonly string[] = [
  'NOT_QUEUED',
  'QUEUED',
  'SENT',
  'DELIVERED',
  'BOUNCED',
  'FAILED',
  'SUPPRESSED',
]
const CONTACT_OUTCOMES: readonly string[] = [
  'AWAITING_RESPONSE',
  'NEEDS_ASSISTANCE',
  'DECLINED',
  'UNREACHABLE',
  'RESOLVED',
]

/**
 * Users whose follow-up queue state matches, in next-follow-up order.
 *
 * Raw SQL because "the latest log per person" is a lateral join Prisma cannot
 * express. "Due" excludes people with a qualifying response since the contact
 * — confirmation this edition, or activation after the call — so a response
 * clears the queue without anybody editing the log.
 */
async function followUpUserIds(
  kind: 'due' | 'overdue' | 'upcoming',
  edition: string,
): Promise<string[]> {
  const bound =
    kind === 'overdue'
      ? Prisma.sql`l."nextFollowUpAt" < now() - interval '1 day'`
      : kind === 'due'
        ? Prisma.sql`l."nextFollowUpAt" <= now()`
        : Prisma.sql`l."nextFollowUpAt" > now()`
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT u."id"
    FROM users u
    JOIN LATERAL (
      SELECT * FROM participant_contact_logs pl
      WHERE pl."userId" = u."id"
      ORDER BY pl."contactedAt" DESC
      LIMIT 1
    ) l ON true
    WHERE l."nextFollowUpAt" IS NOT NULL
      AND ${bound}
      AND l."outcome" IN ('AWAITING_RESPONSE', 'NEEDS_ASSISTANCE', 'UNREACHABLE')
      AND NOT EXISTS (
        SELECT 1 FROM edition_participations ep
        JOIN volunteer_applications va ON va."id" = ep."applicationId"
        WHERE va."userId" = u."id" AND ep."edition" = ${edition} AND ep."confirmedAt" IS NOT NULL
      )
      AND NOT (u."emailVerifiedAt" IS NOT NULL AND u."emailVerifiedAt" > l."contactedAt")
    ORDER BY l."nextFollowUpAt" ASC
  `
  return rows.map((row) => row.id)
}

/** Users whose most recent contact ended with this staff outcome. */
async function latestOutcomeUserIds(outcome: ContactOutcome): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT u."id"
    FROM users u
    JOIN LATERAL (
      SELECT pl."outcome" FROM participant_contact_logs pl
      WHERE pl."userId" = u."id"
      ORDER BY pl."contactedAt" DESC
      LIMIT 1
    ) l ON true
    WHERE l."outcome" = ${outcome}::"ContactOutcome"
  `
  return rows.map((row) => row.id)
}

/** Compose the person-level where from URL-ish filters. Unknown values drop. */
export async function participantsWhere(
  filters: ParticipantFilters,
  edition: string,
): Promise<Prisma.UserWhereInput> {
  const and: Prisma.UserWhereInput[] = [previousParticipantWhere()]

  const stage = RESPONSE_STAGES.find((value) => value === filters.stage)
  if (stage) and.push(stageWhere(stage, edition))

  if (filters.q?.trim()) {
    const contains = { contains: filters.q.trim(), mode: 'insensitive' as const }
    and.push({
      OR: [
        { email: contains },
        { phone: contains },
        { mmpCode: contains },
        { profile: { firstName: contains } },
        { profile: { lastName: contains } },
      ],
    })
  }

  if (filters.edition) {
    and.push({ previousParticipations: { some: { edition: filters.edition } } })
  }
  if (filters.batch) {
    and.push({ migratedRecords: { some: { batchId: filters.batch } } })
  }
  if (filters.department) {
    and.push({
      previousParticipations: { some: { previousDepartment: filters.department } },
    })
  }
  if (filters.invitation && INVITATION_STATUSES.includes(filters.invitation)) {
    and.push({
      migratedRecords: { some: { invitationStatus: filters.invitation as InvitationStatus } },
    })
  }

  if (filters.invited === '1') {
    and.push({ migratedRecords: { some: { invitationSentKey: { not: null } } } })
  } else if (filters.invited === '0') {
    and.push({
      isPreviousEditionUser: true,
      migratedRecords: { none: { invitationSentKey: { not: null } } },
    })
  }
  if (filters.activated === '1') {
    and.push({ passwordHash: { not: UNUSABLE_PASSWORD } })
  } else if (filters.activated === '0') {
    and.push({ passwordHash: UNUSABLE_PASSWORD })
  }
  if (filters.reviewed === '1') {
    and.push({ profileReviewedAt: { not: null } })
  } else if (filters.reviewed === '0') {
    and.push({ profileReviewedAt: null })
  }
  if (filters.responded === '0') {
    and.push(
      { NOT: stageCondition('excluded', edition) },
      { NOT: stageCondition('confirmed', edition) },
    )
  }

  if (filters.followup === 'due' || filters.followup === 'overdue' || filters.followup === 'upcoming') {
    const ids = await followUpUserIds(filters.followup, edition)
    and.push({ id: { in: ids } })
  }
  if (filters.outcome && CONTACT_OUTCOMES.includes(filters.outcome)) {
    const ids = await latestOutcomeUserIds(filters.outcome as ContactOutcome)
    and.push({ id: { in: ids } })
  }

  return { AND: and }
}

export type ParticipantSort = 'name' | 'email' | 'mmpCode' | 'createdAt'

export type ParticipantRow = {
  id: string
  name: string
  email: string
  phone: string | null
  mmpCode: string | null
  editions: string[]
  previousDepartments: string[]
  stage: ResponseStage
  invitedAt: Date | null
  activated: boolean
  profileReviewedAt: Date | null
  confirmedThisEdition: boolean
  lastContact: {
    channel: string
    outcome: ContactOutcome
    contactedAt: Date
    nextFollowUpAt: Date | null
  } | null
}

/**
 * One page of previous participants, deduplicated by account — never by name —
 * with everything hydrated only for the page's own rows. 14k people never
 * travel to the browser.
 */
export async function listPreviousParticipants(params: {
  filters: ParticipantFilters
  edition: string
  page: number
  perPage?: number
  sort?: ParticipantSort
  dir?: 'asc' | 'desc'
}): Promise<{ rows: ParticipantRow[]; total: number; page: number; pages: number; perPage: number }> {
  const perPage = Math.min(100, Math.max(10, params.perPage ?? 25))
  const page = Math.max(1, params.page)
  const where = await participantsWhere(params.filters, params.edition)

  const dir = params.dir === 'desc' ? ('desc' as const) : ('asc' as const)
  const orderBy: Prisma.UserOrderByWithRelationInput =
    params.sort === 'email'
      ? { email: dir }
      : params.sort === 'mmpCode'
        ? { mmpCode: dir }
        : params.sort === 'createdAt'
          ? { createdAt: dir }
          : { profile: { lastName: dir } }

  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        email: true,
        phone: true,
        mmpCode: true,
        // Mapped to a boolean below; the hash itself never leaves this module.
        passwordHash: true,
        profileReviewedAt: true,
        profile: { select: { firstName: true, lastName: true } },
        previousParticipations: {
          select: { edition: true, previousDepartment: true },
          orderBy: { edition: 'desc' },
        },
        migratedRecords: {
          select: { excludedFromInvites: true, invitationSentKey: true, invitedAt: true },
        },
        applications: {
          select: {
            id: true,
            participations: {
              where: { edition: params.edition, confirmedAt: { not: null } },
              select: { id: true },
            },
          },
        },
      },
    }),
  ])

  const logs = await db.participantContactLog.findMany({
    where: { userId: { in: users.map((user) => user.id) } },
    orderBy: { contactedAt: 'desc' },
    select: {
      userId: true,
      channel: true,
      outcome: true,
      contactedAt: true,
      nextFollowUpAt: true,
    },
  })
  const latestLog = new Map<string, (typeof logs)[number]>()
  for (const log of logs) {
    if (!latestLog.has(log.userId)) latestLog.set(log.userId, log)
  }

  const rows: ParticipantRow[] = users.map((user) => {
    const excluded = user.migratedRecords.some((record) => record.excludedFromInvites)
    const confirmed = user.applications.some((app) => app.participations.length > 0)
    const started = user.applications.length > 0
    const activated = user.passwordHash !== UNUSABLE_PASSWORD
    const invited = user.migratedRecords.some((record) => record.invitationSentKey !== null)

    const stage = deriveStage({ excluded, confirmed, started, activated, invited })

    const log = latestLog.get(user.id) ?? null
    return {
      id: user.id,
      name:
        [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(' ') || user.email,
      email: user.email,
      phone: user.phone,
      mmpCode: user.mmpCode,
      editions: [...new Set(user.previousParticipations.map((p) => p.edition))],
      previousDepartments: [
        ...new Set(
          user.previousParticipations
            .map((p) => p.previousDepartment)
            .filter((d): d is string => Boolean(d)),
        ),
      ],
      stage,
      invitedAt:
        user.migratedRecords
          .map((record) => record.invitedAt)
          .filter((d): d is Date => Boolean(d))
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
      activated,
      profileReviewedAt: user.profileReviewedAt,
      confirmedThisEdition: confirmed,
      lastContact: log
        ? {
            channel: log.channel,
            outcome: log.outcome,
            contactedAt: log.contactedAt,
            nextFollowUpAt: log.nextFollowUpAt,
          }
        : null,
    }
  })

  return { rows, total, page, pages: Math.max(1, Math.ceil(total / perPage)), perPage }
}
