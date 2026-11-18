import { NextResponse } from 'next/server'
import { audit } from '@/lib/audit'
import { getSessionUser } from '@/lib/auth/session'
import { can } from '@/lib/auth/rbac'
import { csvResponse, exportFilename, xlsxResponse } from '@/lib/admin/export'
import { db } from '@/lib/db'
import { diasporaWhere, repeatCounts } from '@/lib/diaspora/service'
import { formatDate } from '@/lib/utils'

/**
 * Diaspora participation responses as a spreadsheet.
 *
 * Same filters as the admin list (search, edition, country), read from the
 * query string, so the download is exactly what the administrator was looking
 * at. Columns follow the form's question order, then the receipt details.
 */
const MAX_ROWS = 20_000

const COLUMNS = [
  'Reference',
  'Submitted',
  'Edition',
  'Country',
  'Country pastor',
  'Country pastor email',
  'Country pastor phone',
  'Continental overseer',
  'Participating centre (name and location)',
  'Centre official email',
  'Pastor in charge (PIC)',
  'PIC email',
  'PIC phone',
  'MMPraise representative',
  'Representative email',
  'Representative phone',
  'Responses from this centre email',
] as const

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return new NextResponse('Unauthorised', { status: 401 })
  if (!can(user, 'diaspora:view')) return new NextResponse('Forbidden', { status: 403 })

  const url = new URL(request.url)
  const format = url.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv'
  const filters = {
    q: url.searchParams.get('q') ?? undefined,
    edition: url.searchParams.get('edition') ?? undefined,
    country: url.searchParams.get('country') ?? undefined,
  }

  const submissions = await db.diasporaSubmission.findMany({
    where: diasporaWhere(filters),
    orderBy: { createdAt: 'desc' },
    take: MAX_ROWS,
  })
  const repeats = await repeatCounts(
    submissions.map((s) => s.centreEmailKey),
    filters.edition,
  )

  const rows = submissions.map((s) => [
    s.reference,
    formatDate(s.createdAt, true),
    s.edition,
    s.country,
    s.countryPastorName,
    s.countryPastorEmail,
    s.countryPastorPhone ?? '',
    s.continentalOverseer,
    s.centreNameAndLocation,
    s.centreOfficialEmail,
    s.picName ?? '',
    s.picEmail ?? '',
    s.picPhone ?? '',
    s.repName,
    s.repEmail,
    s.repPhone,
    repeats.get(s.centreEmailKey) ?? 1,
  ])

  await audit({
    action: 'diaspora.exported',
    entityType: 'DiasporaSubmission',
    actorId: user.id,
    metadata: { format, rows: rows.length, filters },
  })

  const filename = exportFilename('mmpraise-diaspora-responses', format)
  return format === 'xlsx'
    ? xlsxResponse(COLUMNS, rows, filename, 'Diaspora responses')
    : csvResponse(COLUMNS, rows, filename)
}
