import type { Metadata } from 'next'
import Link from 'next/link'
import { Download, Globe } from 'lucide-react'
import { Badge, buttonClass, Card, CardBody, EmptyState } from '@/components/ui/primitives'
import { requirePermission } from '@/lib/auth/rbac'
import { db } from '@/lib/db'
import { diasporaFacets, diasporaWhere, repeatCounts } from '@/lib/diaspora/service'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Diaspora responses' }

const PER_PAGE = 25

const FIELD_LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-muted'
const FIELD_CONTROL =
  'min-h-11 rounded-field border border-line-strong bg-surface px-3 py-2 text-sm text-body hover:border-muted focus:border-primary'

/**
 * Responses to the public diaspora participation form.
 *
 * Read-only by design: a response is a centre's own statement, so correcting it
 * means the centre submitting again, which the "Repeat" flag then makes
 * visible. Search, filters and the download share one definition of "matching"
 * (diasporaWhere), so the CSV always contains what is on screen.
 */
export default async function DiasporaResponsesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; edition?: string; country?: string; page?: string }>
}) {
  await requirePermission('diaspora:view')
  const params = await searchParams

  const q = params.q?.trim() ?? ''
  const edition = params.edition ?? ''
  const country = params.country ?? ''
  const page = Math.max(1, Number(params.page ?? 1) || 1)
  const where = diasporaWhere({ q, edition: edition || undefined, country: country || undefined })

  const [items, total, facets] = await Promise.all([
    db.diasporaSubmission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        reference: true,
        country: true,
        centreNameAndLocation: true,
        centreOfficialEmail: true,
        centreEmailKey: true,
        repName: true,
        repPhone: true,
        edition: true,
        createdAt: true,
      },
    }),
    db.diasporaSubmission.count({ where }),
    diasporaFacets(),
  ])
  const repeats = await repeatCounts(
    items.map((item) => item.centreEmailKey),
    edition || undefined,
  )
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))

  const query = (overrides: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = { q, edition, country, ...overrides }
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value)
    return next.toString()
  }
  const link = (overrides: Record<string, string | undefined>) => {
    const qs = query(overrides)
    return `/admin/diaspora${qs ? `?${qs}` : ''}`
  }
  const filtered = Boolean(q || edition || country)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Diaspora responses</h1>
          <p className="mt-1 text-body">
            Centres abroad affirming their participation through diaspora.mmpraise.org.
          </p>
        </div>
        {total > 0 && (
          <a
            href={`/api/admin/export/diaspora?${query({ page: undefined, format: 'csv' })}`}
            className={buttonClass({ variant: 'primary', size: 'sm' })}
          >
            <Download aria-hidden className="size-4" />
            Download CSV ({total})
          </a>
        )}
      </div>

      <form action="/admin/diaspora" className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="diaspora-q" className={FIELD_LABEL}>
            Search
          </label>
          <input
            id="diaspora-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Reference, centre, email, pastor or representative"
            className={`${FIELD_CONTROL} w-full px-4 placeholder:text-muted/70`}
          />
        </div>
        <div>
          <label htmlFor="diaspora-country" className={FIELD_LABEL}>
            Country
          </label>
          <select id="diaspora-country" name="country" defaultValue={country} className={FIELD_CONTROL}>
            <option value="">All countries</option>
            {facets.countries.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        {facets.editions.length > 1 && (
          <div>
            <label htmlFor="diaspora-edition" className={FIELD_LABEL}>
              Edition
            </label>
            <select id="diaspora-edition" name="edition" defaultValue={edition} className={FIELD_CONTROL}>
              <option value="">All editions</option>
              {facets.editions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          Apply
        </button>
        {filtered && (
          <Link href="/admin/diaspora" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
            Clear
          </Link>
        )}
      </form>

      {items.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<Globe className="size-8" />}
              title={filtered ? 'No matching responses' : 'No responses yet'}
              description={
                filtered
                  ? 'Nothing matches those filters. Try fewer words or another country.'
                  : 'Responses from diaspora.mmpraise.org will appear here as centres submit them.'
              }
            />
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* `relative` so the scroll box clips its absolute (sr-only) descendants. */}
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                Diaspora responses, page {page} of {pages}
              </caption>
              <thead>
                <tr className="border-b border-line bg-surface-sunken">
                  <Th>Centre</Th>
                  <Th>Country</Th>
                  <Th>Representative</Th>
                  <Th>Submitted</Th>
                  <Th>Reference</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const count = repeats.get(item.centreEmailKey) ?? 1
                  return (
                    <tr key={item.id} className="border-b border-line last:border-0 hover:bg-surface-sunken">
                      <td className="max-w-80 px-4 py-3">
                        <Link
                          href={`/admin/diaspora/${item.id}`}
                          className="block truncate font-semibold text-primary underline underline-offset-4"
                        >
                          {item.centreNameAndLocation}
                        </Link>
                        <span className="flex items-center gap-2 text-xs text-muted">
                          <span className="truncate">{item.centreOfficialEmail}</span>
                          {count > 1 && (
                            <Link href={link({ q: item.centreOfficialEmail, page: undefined })}>
                              <Badge tone="warning">Repeat ×{count}</Badge>
                            </Link>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-body">{item.country}</td>
                      <td className="px-4 py-3 text-body">
                        <span className="block">{item.repName}</span>
                        <span className="block text-xs text-muted">{item.repPhone}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-body">{formatDate(item.createdAt, true)}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-body">{item.reference}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Page {page} of {pages} · {total} {total === 1 ? 'response' : 'responses'}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={link({ page: String(page - 1) })} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={link({ page: String(page + 1) })} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="px-4 py-3 font-display text-xs font-bold uppercase tracking-wide text-ink">
      {children}
    </th>
  )
}
