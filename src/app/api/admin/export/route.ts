import { NextResponse } from 'next/server'
import { eventConfig } from '@/config/site'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { getSessionUser } from '@/lib/auth/session'
import { can } from '@/lib/auth/rbac'
import { buildWhere } from '@/lib/admin/queries'
import {
  csvResponse,
  exportFilename,
  filtersFromParams,
  xlsxResponse,
} from '@/lib/admin/export'
import { getLookupOptions } from '@/lib/reference'
import { STATUS_LABELS } from '@/lib/applications/service'
import { applicationProgress } from '@/lib/admin/progress'
import { formatDate } from '@/lib/utils'
import { AGE_RANGES, DENOMINATIONS } from '@/lib/validation/registration'

/**
 * Filtered export of volunteer applications as CSV or Excel.
 *
 * Applies the same scope filter as the on-screen list, so an export can never
 * widen what an administrator can see. Health information is deliberately
 * omitted from both formats — it is only ever viewed one record at a time,
 * through an audited action.
 *
 * Every export is recorded in the audit log with the filters used and the row count.
 */
const MAX_ROWS = 20_000

const COLUMNS = [
  // The volunteer's permanent number leads, because it is the one they quote
  // and the one that joins this export to any other record of them.
  'MMP number',
  'Registration ID',
  'Status',
  // For follow-up: where a draft stopped, and when the person last touched it.
  'Progress',
  'Submitted',
  'Last activity',
  'Account created',
  'First name',
  'Last name',
  'Gender',
  'Age range',
  'Email',
  'Phone',
  'Country',
  'State/Province',
  'City',
  'Occupation',
  'Education',
  'Denomination',
  'RCCG region',
  'RCCG province',
  'Parish',
  'Department',
  'Available overnight',
  'Emergency contact',
  'Emergency phone',
  'How they heard about us',
] as const

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return new NextResponse('Unauthorised', { status: 401 })
  if (!can(user, 'application:export')) return new NextResponse('Forbidden', { status: 403 })

  const url = new URL(request.url)
  const format = url.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv'

  const filters = filtersFromParams(url)
  const where = buildWhere(user, filters)

  const applications = await db.volunteerApplication.findMany({
    where,
    // Submitted newest first; drafts (no submission date) by latest activity.
    orderBy: [{ submittedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
    take: MAX_ROWS,
    include: {
      participations: {
        where: { edition: eventConfig.edition },
        select: {
          availableOvernight: true,
          status: true,
          department: { select: { name: true } },
        },
      },
      emergency: true,
      user: {
        select: {
          email: true,
          phone: true,
          mmpCode: true,
          createdAt: true,
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
    },
  })

  // Export human-readable labels, not internal lookup values.
  const [occupations, educations, discoveries] = await Promise.all([
    getLookupOptions('OCCUPATION'),
    getLookupOptions('EDUCATION'),
    getLookupOptions('DISCOVERY_SOURCE'),
  ])
  const labelFor = (options: { value: string; label: string }[], value: string | null | undefined) =>
    options.find((o) => o.value === value)?.label ?? value ?? ''

  const rows = applications.map((application) => {
    const profile = application.user.profile
    // At most one row: `(applicationId, edition)` is unique.
    const participation = application.participations[0]
    return [
      application.user.mmpCode ?? '',
      application.registrationId,
      STATUS_LABELS[application.status],
      applicationProgress(application.status, application.currentStep),
      application.submittedAt ? formatDate(application.submittedAt) : '',
      formatDate(application.updatedAt, true),
      formatDate(application.user.createdAt),
      profile?.firstName ?? '',
      profile?.lastName ?? '',
      profile?.gender ?? '',
      AGE_RANGES.find((a) => a.value === profile?.ageRange)?.label ?? '',
      application.user.email,
      application.user.phone ?? '',
      profile?.country?.name ?? '',
      profile?.state?.name ?? profile?.stateNameOther ?? '',
      profile?.city ?? '',
      profile?.occupation === 'other'
        ? (profile.occupationOther ?? 'Other')
        : labelFor(occupations, profile?.occupation),
      profile?.education === 'other'
        ? (profile.educationOther ?? 'Other')
        : labelFor(educations, profile?.education),
      DENOMINATIONS.find((d) => d.value === profile?.denomination)?.label ?? '',
      profile?.region?.name ?? '',
      profile?.province?.name ?? '',
      profile?.parish?.name ?? profile?.parishNameOther ?? profile?.churchName ?? '',
      participation?.department?.name ?? '',
      participation?.availableOvernight == null
        ? ''
        : participation.availableOvernight
          ? 'Yes'
          : 'No',
      application.emergency ? `${application.emergency.name} (${application.emergency.relationship})` : '',
      application.emergency?.phone ?? '',
      application.discoverySource === 'other'
        ? (application.discoveryOther ?? 'Other')
        : labelFor(discoveries, application.discoverySource),
    ]
  })

  await audit({
    action: 'application.exported',
    entityType: 'VolunteerApplication',
    actorId: user.id,
    metadata: { format, rows: rows.length, filters },
  })

  const filename = exportFilename('mmpraise-volunteers', format)

  return format === 'csv'
    ? csvResponse(COLUMNS, rows, filename)
    : xlsxResponse(COLUMNS, rows, filename, 'Volunteers')
}
