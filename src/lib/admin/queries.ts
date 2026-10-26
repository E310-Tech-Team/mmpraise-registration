import 'server-only'
import { eventConfig } from '@/config/site'
import { db } from '@/lib/db'
import type { ApplicationStatus, ParticipationStatus, Prisma } from '@/generated/prisma/client'
import { departmentScope } from '@/lib/auth/rbac'
import type { SessionUser } from '@/lib/auth/session'
import { confirmedParticipationWhere, lagosDayEnd, lagosDayStart } from '@/lib/admin/metrics'

/**
 * Administrative queries over volunteer applications.
 *
 * Every list is built through `buildWhere`, which folds the caller's department
 * scope into the filter. A department head therefore cannot see another team's
 * applications even by crafting query parameters — the restriction is applied
 * server-side to the SQL, not to the rendered output.
 *
 * Health information is never selected here; it has its own gated accessor.
 */
export type ApplicationFilters = {
  q?: string
  /** One status, or several comma-separated — validated against the enum. */
  status?: string
  departmentId?: string
  countryId?: string
  stateId?: string
  churchRegionId?: string
  churchProvinceId?: string
  ageRange?: string
  /** '1' = confirmed for the current edition, '0' = not confirmed. */
  confirmed?: string
  /** A ParticipationStatus for the current edition's participation. */
  participation?: string
  /** Lagos calendar dates (yyyy-mm-dd) bounding submittedAt, inclusive. */
  submittedFrom?: string
  submittedTo?: string
  /** '1' = only accounts the previous-edition import created. */
  imported?: string
  page?: number
  perPage?: number
  sort?: 'newest' | 'oldest' | 'name'
}

export const PER_PAGE_DEFAULT = 25

/** `?status=everyone` — every application, drafts included (the dashboard's Total). */
export const EVERYONE = 'everyone'

const APPLICATION_STATUSES: readonly string[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'WAITLISTED',
  'REJECTED',
  'ASSIGNED',
  'CHECKED_IN',
  'COMPLETED',
]

const PARTICIPATION_STATUSES: readonly string[] = [
  'SIGNED_UP',
  'ASSIGNED',
  'CHECKED_IN',
  'COMPLETED',
  'WITHDRAWN',
]

/**
 * Parse `?status=` into real enum values, dropping anything else.
 *
 * The URL is user input: the old code cast it straight into the query, so
 * `?status=GARBAGE` reached Prisma and crashed the page. Unknown values are
 * ignored rather than erroring — a stale bookmark should degrade to a wider
 * list, not a broken one.
 */
export function parseStatusFilter(value: string | undefined): ApplicationStatus[] {
  if (!value || value === 'all') return []
  return value
    .split(',')
    .map((part) => part.trim().toUpperCase())
    .filter((part): part is ApplicationStatus => APPLICATION_STATUSES.includes(part))
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function buildWhere(user: SessionUser, filters: ApplicationFilters): Prisma.VolunteerApplicationWhereInput {
  const scope = departmentScope(user)
  const edition = eventConfig.edition

  /*
   * Drafts stay out of review lists by default — a draft is somebody
   * mid-wizard, not something to decide on. They come in when asked for:
   * `status=DRAFT` for exactly the drafts (the follow-up list), or
   * `status=everyone` for every application including drafts — the
   * dashboard's Total. Without that second form, Total opened a list that
   * silently dropped the drafts and showed the same people as Approved.
   */
  const where: Prisma.VolunteerApplicationWhereInput =
    filters.status === EVERYONE ? {} : { status: { not: 'DRAFT' } }

  /*
   * Department now belongs to an edition, not to the application.
   *
   * A volunteer may serve in Media one edition and Medical the next, so
   * "applications in the Media department" is only meaningful once you say
   * *when*. Every department condition below therefore reaches through the
   * current edition's participation.
   */
  const participation: Prisma.EditionParticipationWhereInput = { edition }
  let scopedByDepartment = false

  if (scope !== null) {
    // An empty scope must match nothing, not everything.
    participation.departmentId = scope.length > 0 ? { in: scope } : '__none__'
    scopedByDepartment = true
  }

  const statuses = parseStatusFilter(filters.status)
  if (statuses.length === 1) where.status = statuses[0]
  else if (statuses.length > 1) where.status = { in: statuses }

  if (filters.departmentId && filters.departmentId !== 'all') {
    if (filters.departmentId === 'none') {
      // The "No department yet" bucket: a current-edition participation exists
      // but no department has been chosen. Scoped admins never see it — their
      // scope is a department list, and "none" is not on it.
      participation.departmentId = scope === null ? null : '__none__'
    } else {
      // Intersect with the scope rather than replacing it.
      participation.departmentId =
        scope === null || scope.includes(filters.departmentId) ? filters.departmentId : '__none__'
    }
    scopedByDepartment = true
  }

  if (scopedByDepartment) {
    where.participations = { some: participation }
  }

  // Confirmation and participation-status filters, from the same definition
  // the dashboard counts with (src/lib/admin/metrics.ts).
  const confirmedWhere = confirmedParticipationWhere(edition)
  if (filters.confirmed === '1') {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { participations: { some: confirmedWhere } },
      { status: { not: 'REJECTED' } },
    ]
  } else if (filters.confirmed === '0') {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { participations: { none: { edition, confirmedAt: { not: null } } } },
    ]
  }

  if (filters.participation && PARTICIPATION_STATUSES.includes(filters.participation)) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      {
        participations: {
          some: { edition, status: filters.participation as ParticipationStatus },
        },
      },
    ]
  }

  if (filters.submittedFrom && DATE_ONLY.test(filters.submittedFrom)) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { submittedAt: { gte: lagosDayStart(filters.submittedFrom) } },
    ]
  }
  if (filters.submittedTo && DATE_ONLY.test(filters.submittedTo)) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { submittedAt: { lte: lagosDayEnd(filters.submittedTo) } },
    ]
  }

  const userFilter: Prisma.UserWhereInput = {}
  if (filters.imported === '1') {
    userFilter.isPreviousEditionUser = true
  }

  const profileFilter: Prisma.VolunteerProfileWhereInput = {}
  if (filters.countryId && filters.countryId !== 'all') profileFilter.countryId = filters.countryId
  if (filters.stateId && filters.stateId !== 'all') profileFilter.stateId = filters.stateId
  if (filters.churchRegionId && filters.churchRegionId !== 'all') profileFilter.churchRegionId = filters.churchRegionId
  if (filters.churchProvinceId && filters.churchProvinceId !== 'all') {
    profileFilter.churchProvinceId = filters.churchProvinceId
  }
  if (filters.ageRange && filters.ageRange !== 'all') {
    profileFilter.ageRange = filters.ageRange as Prisma.VolunteerProfileWhereInput['ageRange']
  }

  if (Object.keys(profileFilter).length > 0) {
    userFilter.profile = profileFilter
  }
  if (Object.keys(userFilter).length > 0) {
    where.user = userFilter
  }

  const q = filters.q?.trim()
  if (q) {
    const contains = { contains: q, mode: 'insensitive' as const }
    where.OR = [
      { registrationId: contains },
      // The number a volunteer actually quotes at a desk or down a phone.
      { user: { mmpCode: contains } },
      { user: { email: contains } },
      { user: { phone: contains } },
      { user: { username: contains } },
      { user: { profile: { firstName: contains } } },
      { user: { profile: { lastName: contains } } },
    ]
  }

  return where
}

export async function listApplications(user: SessionUser, filters: ApplicationFilters) {
  const page = Math.max(1, filters.page ?? 1)
  const perPage = Math.min(100, Math.max(5, filters.perPage ?? PER_PAGE_DEFAULT))
  const where = buildWhere(user, filters)

  const orderBy: Prisma.VolunteerApplicationOrderByWithRelationInput =
    filters.sort === 'oldest'
      ? { submittedAt: 'asc' }
      : filters.sort === 'name'
        ? { user: { profile: { lastName: 'asc' } } }
        : { submittedAt: 'desc' }

  const [total, items] = await Promise.all([
    db.volunteerApplication.count({ where }),
    db.volunteerApplication.findMany({
      where,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        registrationId: true,
        status: true,
        submittedAt: true,
        // How far a draft got, and when — what a follow-up call needs.
        currentStep: true,
        updatedAt: true,
        // Exactly one row, because `(applicationId, edition)` is unique.
        participations: {
          where: { edition: eventConfig.edition },
          select: { id: true, status: true, department: { select: { id: true, name: true } } },
        },
        // How much discussion a record has attracted — a review signal.
        _count: { select: { notes: true } },
        user: {
          select: {
            email: true,
            phone: true,
            mmpCode: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
                ageRange: true,
                gender: true,
                city: true,
                photoDocumentId: true,
                country: { select: { name: true } },
                state: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
  ])

  return { items, total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)) }
}

/**
 * How many applications in this view are still reviewable.
 *
 * Drives the bulk-approve button: the number it shows is the number the action
 * will re-verify before touching anything, so the two must come from the same
 * `buildWhere` or the contract between them is fiction.
 */
export async function countReviewable(user: SessionUser, filters: ApplicationFilters) {
  return db.volunteerApplication.count({
    where: {
      AND: [buildWhere(user, filters), { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } }],
    },
  })
}

/** Full application for the review screen. Excludes health information. */
export async function getApplicationForReview(user: SessionUser, id: string) {
  const scope = departmentScope(user)

  const application = await db.volunteerApplication.findUnique({
    where: { id },
    include: {
      participations: {
        orderBy: { edition: 'desc' },
        include: {
          department: true,
          availability: { orderBy: { date: 'asc' } },
          assignments: { include: { shift: true } },
          answers: {
            include: {
              question: { select: { id: true, key: true, label: true, type: true, sortOrder: true } },
              options: { include: { option: { select: { value: true, label: true } } } },
              document: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          phone: true,
          username: true,
          mmpCode: true,
          emailVerifiedAt: true,
          profile: {
            include: {
              country: { select: { name: true } },
              state: { select: { name: true } },
              region: { select: { name: true } },
              province: { select: { name: true } },
              parish: { select: { name: true } },
            },
          },
        },
      },
      emergency: true,
      documents: { select: { id: true, kind: true, originalName: true, mimeType: true, sizeBytes: true } },
      statusHistory: {
        orderBy: { createdAt: 'desc' },
        include: { changedBy: { select: { username: true } } },
      },
      notes: {
        orderBy: { createdAt: 'desc' },
        include: { author: { select: { username: true } } },
      },
    },
  })

  if (!application) return null
  if (application.status === 'DRAFT') return null

  /*
   * Department scoping now asks "has this volunteer ever served in one of my
   * departments?" rather than reading a single column.
   *
   * Deliberately *any* edition, not just the current one: a department head
   * reviewing somebody who served with them in 2026 and has not yet chosen a
   * department for 2027 must still be able to open the record they already
   * hold history for.
   */
  if (scope !== null) {
    const visible = application.participations.some(
      (participation) =>
        participation.departmentId !== null && scope.includes(participation.departmentId),
    )
    if (!visible) return null
  }

  return application
}
