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
import { STATUS_LABELS } from '@/lib/applications/service'
import { applicationProgress } from '@/lib/admin/progress'
import { formatDate } from '@/lib/utils'

/**
 * The contact list: who to write to, and what they agreed to.
 *
 * The full applicant export answers "tell me everything about these people".
 * This answers the narrower question an administrator actually has when
 * sending a follow-up — who is in this segment, what address reaches them, and
 * am I entitled to use it. Pasting a 24-column sheet of church details,
 * occupations and emergency contacts into a mail tool to get at the email
 * column spreads personal data further than the job needs.
 *
 * **On consent.** `consentCommunication` is compulsory to submit a
 * participation (`z.literal(true)`) and its wording is *registration and
 * volunteer-related communication*. It is therefore evidence of agreement to
 * service email, and it is NOT a marketing opt-in: nobody was offered the
 * choice to decline, so it cannot identify who would have. The columns carry
 * the consent and the date it was taken so the basis travels with the
 * addresses rather than being assumed by whoever opens the file. A genuine
 * marketing segment needs a separate optional opt-in, which does not exist yet.
 *
 * Same filters, same scope and the same department restriction as the list, so
 * this can never reach further than the administrator can already see.
 */
const MAX_ROWS = 20_000

const COLUMNS = [
  'MMP number',
  'First name',
  'Last name',
  'Email',
  'Phone',
  'Status',
  'Progress',
  'Last activity',
  'Department',
  'Country',
  'Consented to volunteer communication',
  'Consent taken',
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
    orderBy: [{ submittedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
    take: MAX_ROWS,
    select: {
      status: true,
      currentStep: true,
      updatedAt: true,
      participations: {
        where: { edition: eventConfig.edition },
        select: {
          consentCommunication: true,
          consentedAt: true,
          department: { select: { name: true } },
        },
      },
      user: {
        select: {
          email: true,
          phone: true,
          mmpCode: true,
          profile: {
            select: {
              firstName: true,
              lastName: true,
              country: { select: { name: true } },
            },
          },
        },
      },
    },
  })

  const rows = applications.map((application) => {
    const profile = application.user.profile
    // At most one row: `(applicationId, edition)` is unique.
    const participation = application.participations[0]
    return [
      application.user.mmpCode ?? '',
      profile?.firstName ?? '',
      profile?.lastName ?? '',
      application.user.email,
      application.user.phone ?? '',
      STATUS_LABELS[application.status],
      applicationProgress(application.status, application.currentStep),
      formatDate(application.updatedAt, true),
      participation?.department?.name ?? '',
      profile?.country?.name ?? '',
      /*
       * Three states, not two. "No" and "has not confirmed this edition yet"
       * are different facts about a person, and collapsing them into a blank
       * would make an unconfirmed volunteer look like a refusal.
       */
      participation ? (participation.consentCommunication ? 'Yes' : 'No') : 'Not yet confirmed',
      participation?.consentedAt ? formatDate(participation.consentedAt) : '',
    ]
  })

  await audit({
    action: 'application.contacts_exported',
    entityType: 'VolunteerApplication',
    actorId: user.id,
    metadata: { format, rows: rows.length, filters },
  })

  const filename = exportFilename('mmpraise-contacts', format)

  return format === 'csv'
    ? csvResponse(COLUMNS, rows, filename)
    : xlsxResponse(COLUMNS, rows, filename, 'Contacts')
}
