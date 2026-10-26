import type { Metadata } from 'next'
import Link from 'next/link'
import { ApplicationFilters } from '@/components/admin/application-filters'
import { BulkApprove } from '@/components/admin/bulk-approve'
import { ExportConfirm } from '@/components/admin/export-confirm'
import { Badge, buttonClass, Card, CardBody, EmptyState } from '@/components/ui/primitives'
import { can, requirePermission } from '@/lib/auth/rbac'
import { countReviewable, listApplications, type ApplicationFilters as Filters } from '@/lib/admin/queries'
import { STATUS_LABELS, STATUS_TONES } from '@/lib/applications/status'
import {
  getChurchProvinces,
  getChurchRegions,
  getCountries,
  getDepartments,
  getStates,
} from '@/lib/reference'
import { applicationProgress } from '@/lib/admin/progress'
import { formatDate, initials } from '@/lib/utils'
import { AGE_RANGES } from '@/lib/validation/registration'

export const metadata: Metadata = { title: 'Applicants' }

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission('application:review')
  const params = await searchParams

  const filters: Filters = {
    q: params.q,
    status: params.status,
    departmentId: params.departmentId,
    countryId: params.countryId,
    stateId: params.stateId,
    churchRegionId: params.churchRegionId,
    churchProvinceId: params.churchProvinceId,
    ageRange: params.ageRange,
    confirmed: params.confirmed,
    participation: params.participation,
    submittedFrom: params.submittedFrom,
    submittedTo: params.submittedTo,
    imported: params.imported,
    page: params.page ? Number(params.page) : 1,
    sort: (params.sort as Filters['sort']) ?? 'newest',
  }

  const [result, reviewable, departments, countries, regions, states, provinces] =
    await Promise.all([
      listApplications(user, filters),
      can(user, 'application:decide') ? countReviewable(user, filters) : Promise.resolve(0),
      getDepartments(),
      getCountries(),
      getChurchRegions(),
      // Fetched only for the chosen parent: the full lists are thousands of
      // rows, and a dropdown of every state on earth is not a filter.
      params.countryId ? getStates(params.countryId) : Promise.resolve([]),
      params.churchRegionId ? getChurchProvinces(params.churchRegionId) : Promise.resolve([]),
    ])

  // Read once for the whole page, so the compiler's purity rule holds and
  // every row ages against the same instant.
  const now = new Date().getTime()

  const exportQuery = new URLSearchParams(
    Object.entries(params).filter(([, value]) => Boolean(value)) as [string, string][],
  ).toString()

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Applicants</h1>
          <p className="mt-1 text-body">
            {result.total} application{result.total === 1 ? '' : 's'} match your filters.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {can(user, 'application:decide') && (
            <BulkApprove reviewableCount={reviewable} filters={params} />
          )}
          {can(user, 'application:export') && result.total > 0 && (
            <ExportConfirm total={result.total} exportQuery={exportQuery} />
          )}
        </div>
      </div>

      <ApplicationFilters
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        countries={countries.map((c) => ({ id: c.id, name: c.name }))}
        regions={regions}
        states={states}
        provinces={provinces}
      />

      {result.items.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="No applicants found"
              description="Try widening your filters, or clear them to see every application you can access."
            />
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/*
            Horizontal scroll is confined to the table so the page never scrolls
            sideways. `relative` is load-bearing: the sr-only annotations in the
            table (`position: absolute`) are only clipped by this scroll box if
            it is their containing block. Without it, a "waiting more than a
            week" note sitting ~785px into the table widened the document and
            made phone browsers zoom the whole page out — the same escape the
            admin nav's headings had.
          */}
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                Volunteer applications, page {result.page} of {result.pages}
              </caption>
              <thead>
                <tr className="border-b border-line bg-surface-sunken">
                  <Th>Volunteer</Th>
                  <Th>MMP number</Th>
                  <Th>Department</Th>
                  <Th>Location</Th>
                  <Th>Age</Th>
                  <Th>Submitted</Th>
                  <Th>Waiting</Th>
                  <Th>Notes</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => {
                  const profile = item.user.profile
                  return (
                    <tr key={item.id} className="border-b border-line last:border-0 hover:bg-surface-sunken">
                      <td className="px-4 py-3">
                        {/*
                          Drafts are not reviewable, so the review page refuses
                          them; they get no link, just who they are and how to
                          reach them — which is what a follow-up needs.
                        */}
                        {item.status === 'DRAFT' ? (
                          <div className="flex items-center gap-3 font-semibold text-ink">
                          {profile?.photoDocumentId ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/api/files/${profile.photoDocumentId}`}
                              alt=""
                              className="size-9 shrink-0 rounded-full border border-line object-cover"
                            />
                          ) : (
                            <span
                              aria-hidden
                              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white"
                            >
                              {initials(profile?.firstName, profile?.lastName)}
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="block truncate">
                              {profile?.firstName} {profile?.lastName}
                            </span>
                            <span className="block truncate text-xs font-normal text-muted">{item.user.email}</span>
                          </span>
                                                  </div>
                        ) : (
                          <Link
                            href={`/admin/applications/${item.id}`}
                            className="flex items-center gap-3 font-semibold text-primary underline underline-offset-4"
                          >
                          {profile?.photoDocumentId ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/api/files/${profile.photoDocumentId}`}
                              alt=""
                              className="size-9 shrink-0 rounded-full border border-line object-cover"
                            />
                          ) : (
                            <span
                              aria-hidden
                              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white"
                            >
                              {initials(profile?.firstName, profile?.lastName)}
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="block truncate">
                              {profile?.firstName} {profile?.lastName}
                            </span>
                            <span className="block truncate text-xs font-normal text-muted">{item.user.email}</span>
                          </span>
                                                  </Link>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-body">
                        {item.user.mmpCode ?? item.registrationId}
                      </td>
                      {/* The department chosen for the current edition. */}
                      <td className="px-4 py-3 text-body">
                        {item.participations[0]?.department?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-body">
                        {[profile?.city, profile?.state?.name, profile?.country?.name].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3 text-body">
                        {AGE_RANGES.find((a) => a.value === profile?.ageRange)?.label ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-body">
                        {item.status === 'DRAFT' ? (
                          <>
                            <span className="block text-xs">
                              {applicationProgress(item.status, item.currentStep)}
                            </span>
                            <span className="block text-xs text-muted">
                              last saved {formatDate(item.updatedAt)}
                              {item.user.phone ? ` · ${item.user.phone}` : ''}
                            </span>
                          </>
                        ) : (
                          formatDate(item.submittedAt)
                        )}
                      </td>
                      {/*
                        Review age, for reviewable rows only. A decided
                        application is not "waiting" however old it is.
                      */}
                      <td className="px-4 py-3">
                        <ReviewAge submittedAt={item.submittedAt} status={item.status} now={now} />
                      </td>
                      <td className="px-4 py-3 text-body tabular-nums">
                        {item._count.notes > 0 ? (
                          <>
                            {item._count.notes}
                            <span className="sr-only">
                              {' '}
                              note{item._count.notes === 1 ? '' : 's'}
                            </span>
                          </>
                        ) : (
                          <span aria-hidden className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONES[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {result.pages > 1 && <Pagination page={result.page} pages={result.pages} params={params} />}
    </div>
  )
}

/**
 * How long a reviewable application has waited, worded as a duration.
 *
 * Ages beyond a week turn amber: with no published review SLA, seven days is
 * the point at which "in the queue" starts reading as "forgotten" to the
 * volunteer on the other end.
 */
function ReviewAge({
  submittedAt,
  status,
  now,
}: {
  submittedAt: Date | null
  status: string
  now: number
}) {
  if (!submittedAt || (status !== 'SUBMITTED' && status !== 'UNDER_REVIEW')) {
    return <span aria-hidden className="text-muted">—</span>
  }
  const days = Math.floor((now - submittedAt.getTime()) / 86_400_000)
  const label = days === 0 ? 'today' : days === 1 ? '1 day' : `${days} days`
  return (
    <span className={days >= 7 ? 'font-semibold text-warning' : 'text-body'}>
      {label}
      {days >= 7 && <span className="sr-only"> — waiting more than a week</span>}
    </span>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="px-4 py-3 font-display text-xs font-bold uppercase tracking-wide text-ink">
      {children}
    </th>
  )
}

function Pagination({
  page,
  pages,
  params,
}: {
  page: number
  pages: number
  params: Record<string, string | undefined>
}) {
  const link = (target: number) => {
    const next = new URLSearchParams(
      Object.entries(params).filter(([key, value]) => Boolean(value) && key !== 'page') as [string, string][],
    )
    next.set('page', String(target))
    return `/admin/applications?${next.toString()}`
  }

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted">
        Page {page} of {pages}
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={link(page - 1)} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            Previous
          </Link>
        )}
        {page < pages && (
          <Link href={link(page + 1)} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            Next
          </Link>
        )}
      </div>
    </nav>
  )
}
