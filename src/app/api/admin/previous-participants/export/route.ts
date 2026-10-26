import { NextResponse, type NextRequest } from 'next/server'
import { eventConfig } from '@/config/site'
import { audit } from '@/lib/audit'
import { getSessionUser } from '@/lib/auth/session'
import { can } from '@/lib/auth/rbac'
import {
  listPreviousParticipants,
  STAGE_LABELS,
  type ParticipantFilters,
  type ParticipantSort,
} from '@/lib/admin/participants'
import { csvResponse, type ExportRow } from '@/lib/admin/export'
import { formatDate } from '@/lib/utils'

/**
 * The person-level previous-participants export — the complete filtered set,
 * fetched page by page server-side so memory stays flat whatever the filters
 * match. Same predicate module as the screen, so the file is "this list, as a
 * file" and never a third definition of the population.
 */
const COLUMNS = [
  'Name',
  'MMP number',
  'Email',
  'Phone',
  'Previous editions',
  'Previous departments',
  'Response stage',
  'Invited at',
  'Activated',
  'Profile reviewed',
  'Confirmed this edition',
  'Last contact outcome',
  'Last contacted',
  'Next follow-up',
] as const

const PAGE_SIZE = 1000

export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user || !can(user, 'migration:export')) {
    return NextResponse.json({ error: 'Not permitted' }, { status: 403 })
  }

  const url = new URL(request.url)
  const filters: ParticipantFilters = Object.fromEntries(
    ['q', 'stage', 'edition', 'batch', 'department', 'invitation', 'invited', 'activated', 'reviewed', 'responded', 'followup', 'outcome']
      .map((key) => [key, url.searchParams.get(key) ?? undefined])
      .filter(([, value]) => value !== undefined),
  )
  const sort = (url.searchParams.get('sort') ?? 'name') as ParticipantSort

  const rows: ExportRow[] = []
  let page = 1
  for (;;) {
    const result = await listPreviousParticipants({
      filters,
      edition: eventConfig.edition,
      page,
      perPage: PAGE_SIZE,
      sort,
    })
    for (const person of result.rows) {
      rows.push([
        person.name,
        person.mmpCode,
        person.email,
        person.phone,
        person.editions.join(', '),
        person.previousDepartments.join(', '),
        STAGE_LABELS[person.stage],
        person.invitedAt ? formatDate(person.invitedAt, true) : '',
        person.activated ? 'Yes' : 'No',
        person.profileReviewedAt ? formatDate(person.profileReviewedAt, true) : 'Not recorded',
        person.confirmedThisEdition ? 'Yes' : 'No',
        person.lastContact?.outcome ?? '',
        person.lastContact ? formatDate(person.lastContact.contactedAt, true) : '',
        person.lastContact?.nextFollowUpAt
          ? formatDate(person.lastContact.nextFollowUpAt, true)
          : '',
      ])
    }
    if (page >= result.pages) break
    page += 1
  }

  await audit({
    action: 'migration.exported',
    entityType: 'User',
    actorId: user.id,
    metadata: { kind: 'previous_participants', rows: rows.length, filters },
  })

  return csvResponse(COLUMNS, rows, `previous-participants-${new Date().toISOString().slice(0, 10)}.csv`)
}
