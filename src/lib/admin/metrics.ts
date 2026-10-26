import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import type { ApplicationStatus } from '@/generated/prisma/client'
import { db } from '@/lib/db'

/**
 * The metric dictionary, as code.
 *
 * Every named figure on the admin dashboard gets its predicate from here, and
 * so do the list pages and exports it links to — one definition per number, so
 * a card saying 771 can only ever open a list of 771. The companion
 * person-level taxonomy lives in src/lib/admin/participants.ts.
 *
 * Timezone: all reporting buckets and day boundaries are Africa/Lagos (WAT,
 * UTC+1, no DST), the event's own clock. Timestamps are stored as UTC
 * instants; the SQL below converts before truncating.
 */

export const REPORTING_TIMEZONE = 'Africa/Lagos'

/** Application statuses that count as "registered" — everything but a draft. */
export const REGISTERED_STATUSES: ApplicationStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'WAITLISTED',
  'REJECTED',
  // Legacy statuses from before the registration/participation split; kept in
  // the total (they are real people) and surfaced as a labelled footnote.
  'ASSIGNED',
  'CHECKED_IN',
  'COMPLETED',
]

export const LEGACY_APPLICATION_STATUSES: ApplicationStatus[] = [
  'ASSIGNED',
  'CHECKED_IN',
  'COMPLETED',
]

export const AWAITING_REVIEW_STATUSES: ApplicationStatus[] = ['SUBMITTED', 'UNDER_REVIEW']

/** Statuses from which somebody can still confirm for an edition. */
export const CONFIRMABLE_STATUSES: ApplicationStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'WAITLISTED',
]

/**
 * A confirmed volunteer for the edition — decided 2026-10-13: said "I am
 * coming" (confirmedAt), has not withdrawn, and their application was not
 * rejected. Waitlisted people who confirmed DO count: they are standing by.
 */
export function confirmedParticipationWhere(edition: string): Prisma.EditionParticipationWhereInput {
  return {
    edition,
    confirmedAt: { not: null },
    status: { not: 'WITHDRAWN' },
    application: { status: { not: 'REJECTED' } },
  }
}

/** Registered (confirmable statuses) with no confirmed participation. */
export function registeredUnconfirmedWhere(edition: string): Prisma.VolunteerApplicationWhereInput {
  return {
    status: { in: CONFIRMABLE_STATUSES },
    participations: { none: { edition, confirmedAt: { not: null } } },
  }
}

/** The inboxes hide test and spam rows by default; their counts must too. */
export function newMessagesWhere(): Prisma.ContactMessageWhereInput {
  return { status: 'NEW', isTestData: false, isSpam: false }
}

export function pendingTestimoniesWhere(): Prisma.TestimonySubmissionWhereInput {
  return { status: 'PENDING', isTestData: false, isSpam: false }
}

/** Numerator over denominator in whole percent, or null when undefined. */
export function percent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 100)
}

export type TrendBucket = {
  /** Monday 00:00 of the week, Lagos time, as yyyy-mm-dd. */
  weekStart: string
  count: number
}

/**
 * Weekly submissions, Lagos weeks, zero-filled.
 *
 * `generate_series` supplies the empty weeks: a quiet fortnight must render as
 * two zero bars, not silently vanish and make the neighbouring weeks look
 * adjacent. The first bucket is the week containing `weeks-1` weeks ago, so
 * the newest bucket is the current (partial) week — labelled as such by the UI.
 */
export async function submissionTrend(params: {
  weeks?: number
  edition: string
  /** Department ids a scoped admin may see; null = unscoped. */
  scope: string[] | null
}): Promise<TrendBucket[]> {
  const weeks = params.weeks ?? 12
  /*
   * A scoped administrator's trend is the trend of *their* departments —
   * matching every other figure they see — so the join below mirrors
   * buildWhere's "department through this edition's participation" rule.
   * An empty scope matches nothing, exactly as the list does.
   */
  const scopeJoin =
    params.scope === null
      ? Prisma.empty
      : Prisma.sql`
        AND EXISTS (
          SELECT 1 FROM edition_participations ep
          WHERE ep."applicationId" = a."id"
            AND ep."edition" = ${params.edition}
            AND ep."departmentId" = ANY(${params.scope})
        )`

  const rows = await db.$queryRaw<{ week: Date; count: bigint }[]>`
    WITH buckets AS (
      SELECT generate_series(
        date_trunc('week', (now() AT TIME ZONE 'Africa/Lagos')) - (${weeks - 1} || ' weeks')::interval,
        date_trunc('week', (now() AT TIME ZONE 'Africa/Lagos')),
        '1 week'::interval
      ) AS week
    )
    SELECT b.week AS week, count(a."id") AS count
    FROM buckets b
    LEFT JOIN volunteer_applications a
      ON a."submittedAt" IS NOT NULL
     AND date_trunc('week', (a."submittedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Lagos') = b.week
     ${scopeJoin}
    GROUP BY b.week
    ORDER BY b.week
  `
  return rows.map((row) => ({
    weekStart: row.week.toISOString().slice(0, 10),
    count: Number(row.count),
  }))
}

/**
 * Day boundaries for a Lagos calendar date, as UTC instants — what a stored
 * timestamp must be compared against for "on or after the 5th" to mean the
 * 5th as the organisation experiences it. WAT is UTC+1 with no DST, so the
 * offset is constant.
 */
export function lagosDayStart(date: string): Date {
  return new Date(`${date}T00:00:00+01:00`)
}

export function lagosDayEnd(date: string): Date {
  return new Date(`${date}T23:59:59.999+01:00`)
}
