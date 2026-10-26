import type { Metadata } from 'next'
import Link from 'next/link'
import { ScrollText } from 'lucide-react'
import {
  Badge,
  buttonClass,
  Card,
  CardBody,
  EmptyState,
} from '@/components/ui/primitives'
import {
  actionsInCategory,
  CATEGORY_LABELS,
  describeAction,
  describeMetadata,
  securityActions,
  type AuditCategory,
} from '@/lib/audit/labels'
import { requirePermission } from '@/lib/auth/rbac'
import { lagosDayEnd, lagosDayStart } from '@/lib/admin/metrics'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'
import type { Prisma } from '@/generated/prisma/client'

export const metadata: Metadata = { title: 'Activity log' }

const PER_PAGE = 50

const VIEWS = [
  { value: 'all', label: 'All activity' },
  { value: 'security', label: 'Security and compliance' },
  { value: 'system', label: 'System events' },
] as const
type View = (typeof VIEWS)[number]['value']

/**
 * What has been done, in words.
 *
 * Three views because three different questions get asked of this page: what
 * happened, who touched personal data, and what ran without a person behind
 * it. Every row reads as a sentence; the raw record stays one disclosure away
 * for the times that is genuinely what you need.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    action?: string
    view?: string
    category?: string
    actor?: string
    from?: string
    to?: string
  }>
}) {
  await requirePermission('audit:view')
  const params = await searchParams

  const page = Math.max(1, Number(params.page ?? 1) || 1)
  const view = (VIEWS.find((v) => v.value === params.view)?.value ?? 'all') as View
  const category = (Object.keys(CATEGORY_LABELS) as AuditCategory[]).find(
    (value) => value === params.category,
  )
  const actor = params.actor?.trim() ?? ''

  /*
   * Day bounds in Lagos time — "to the 5th" means the 5th as the organisation
   * experiences it, inclusively. This used to use the server's local midnight,
   * which silently shifted the window whenever the host's timezone differed.
   */
  const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
  const from = params.from && DATE_ONLY.test(params.from) ? lagosDayStart(params.from) : null
  const to = params.to && DATE_ONLY.test(params.to) ? lagosDayEnd(params.to) : null

  const where: Prisma.AuditLogWhereInput = {
    ...(params.action ? { action: params.action } : {}),
    ...(view === 'security' ? { action: { in: securityActions() } } : {}),
    // Anything with no actor ran on the system's behalf: scheduled work,
    // migrations advancing, expiry. That is its own question.
    ...(view === 'system' ? { actorId: null } : {}),
    ...(category ? { action: { in: actionsInCategory(category) } } : {}),
    ...(actor
      ? {
          actor: {
            OR: [
              { username: { contains: actor, mode: 'insensitive' } },
              { email: { contains: actor, mode: 'insensitive' } },
            ],
          },
        }
      : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  }

  const [total, entries] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { actor: { select: { username: true, email: true } } },
    }),
  ])

  const pages = Math.max(1, Math.ceil(total / PER_PAGE))

  const link = (overrides: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      view,
      category,
      actor,
      from: params.from,
      to: params.to,
      action: params.action,
      ...overrides,
    }
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries(merged)) {
      if (!value || (key === 'view' && value === 'all')) continue
      next.set(key, value)
    }
    const qs = next.toString()
    return `/admin/audit${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl">Activity log</h1>
        <p className="mt-1 text-body">
          Every privileged action, in the order it happened — including each time restricted
          information was read.
        </p>
      </div>

      <nav aria-label="Choose a view" className="flex flex-wrap gap-2">
        {VIEWS.map((option) => (
          <Link
            key={option.value}
            href={link({ view: option.value, page: undefined, action: undefined })}
            aria-current={view === option.value ? 'page' : undefined}
            className={buttonClass({
              variant: view === option.value ? 'primary' : 'ghost',
              size: 'sm',
            })}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      <form action="/admin/audit" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="view" value={view} />
        <div className="min-w-44 flex-1">
          <label
            htmlFor="audit-actor"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Who
          </label>
          <input
            id="audit-actor"
            name="actor"
            type="search"
            defaultValue={actor}
            placeholder="Username or email"
            className="min-h-11 w-full rounded-field border border-line-strong bg-surface px-4 py-2 text-sm text-body placeholder:text-muted/70 hover:border-muted focus:border-primary"
          />
        </div>
        <div>
          <label
            htmlFor="audit-category"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Area
          </label>
          <select
            id="audit-category"
            name="category"
            defaultValue={category ?? ''}
            className="min-h-11 rounded-field border border-line-strong bg-surface px-3 py-2 text-sm text-body"
          >
            <option value="">Everything</option>
            {(Object.entries(CATEGORY_LABELS) as [AuditCategory, string][]).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="audit-from"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted"
          >
            From
          </label>
          <input
            id="audit-from"
            name="from"
            type="date"
            defaultValue={params.from ?? ''}
            className="min-h-11 rounded-field border border-line-strong bg-surface px-3 py-2 text-sm text-body"
          />
        </div>
        <div>
          <label
            htmlFor="audit-to"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted"
          >
            To
          </label>
          <input
            id="audit-to"
            name="to"
            type="date"
            defaultValue={params.to ?? ''}
            className="min-h-11 rounded-field border border-line-strong bg-surface px-3 py-2 text-sm text-body"
          />
        </div>
        <button type="submit" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          Apply
        </button>
        {(actor || category || params.from || params.to || params.action) && (
          <Link
            href={link({
              actor: undefined,
              category: undefined,
              from: undefined,
              to: undefined,
              action: undefined,
            })}
            className={buttonClass({ variant: 'ghost', size: 'sm' })}
          >
            Clear
          </Link>
        )}
      </form>

      <p className="text-sm text-muted">
        {total.toLocaleString()} entr{total === 1 ? 'y' : 'ies'}
        {view === 'security'
          ? ' — reading personal data, changing who can do what, and anything touching many records at once.'
          : view === 'system'
            ? ' — actions with no person behind them.'
            : ''}
      </p>

      <Card className="overflow-hidden">
        {entries.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<ScrollText className="size-8" />}
              title="Nothing here"
              description="No activity matches these filters."
            />
          </CardBody>
        ) : (
          <ul aria-label="Activity entries" className="divide-y divide-line">
            {entries.map((entry) => {
              const descriptor = describeAction(entry.action)
              const detail = describeMetadata(entry.metadata)
              const who = entry.actor?.username ?? 'The system'
              return (
                <li key={entry.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="min-w-0 text-sm text-body">
                      <span className="font-semibold text-ink">{who}</span> {descriptor.label}
                      {detail ? <span className="text-muted"> — {detail}</span> : null}
                    </p>
                    <p className="shrink-0 text-xs tabular-nums text-muted">
                      {formatDate(entry.createdAt, true)}
                    </p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone="neutral">{CATEGORY_LABELS[descriptor.category]}</Badge>
                    {descriptor.security && <Badge tone="warning">Security</Badge>}
                    <span className="text-xs text-muted">
                      {entry.entityType}
                      {entry.entityId ? ` · ${entry.entityId.slice(-8)}` : ''}
                    </span>
                    <details className="w-full">
                      <summary className="cursor-pointer text-xs text-muted hover:text-body">
                        Technical details
                      </summary>
                      <dl className="mt-2 space-y-1 rounded-field bg-surface-sunken px-3 py-2 text-xs">
                        <div className="flex gap-2">
                          <dt className="font-semibold text-ink">Action</dt>
                          <dd>
                            <code>{entry.action}</code>
                          </dd>
                        </div>
                        {entry.actor && (
                          <div className="flex gap-2">
                            <dt className="font-semibold text-ink">Account</dt>
                            <dd className="break-all">{entry.actor.email}</dd>
                          </div>
                        )}
                        {entry.ip && (
                          <div className="flex gap-2">
                            <dt className="font-semibold text-ink">IP</dt>
                            <dd>{entry.ip}</dd>
                          </div>
                        )}
                        {entry.metadata != null && (
                          <div>
                            <dt className="font-semibold text-ink">Metadata</dt>
                            <dd>
                              <pre className="relative mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[11px]">
                                {JSON.stringify(entry.metadata, null, 2)}
                              </pre>
                            </dd>
                          </div>
                        )}
                      </dl>
                    </details>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {pages > 1 && (
          <nav
            aria-label="Pagination"
            className="flex items-center justify-between gap-3 border-t border-line px-4 py-3"
          >
            <p className="text-xs text-muted">
              Page {page} of {pages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={link({ page: String(page - 1) })}
                  className={buttonClass({ variant: 'ghost', size: 'sm' })}
                >
                  Previous
                </Link>
              )}
              {page < pages && (
                <Link
                  href={link({ page: String(page + 1) })}
                  className={buttonClass({ variant: 'ghost', size: 'sm' })}
                >
                  Next
                </Link>
              )}
            </div>
          </nav>
        )}
      </Card>
    </div>
  )
}
