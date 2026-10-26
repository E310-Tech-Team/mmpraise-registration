import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, FileWarning } from 'lucide-react'
import { ParticipantsTabs } from '@/components/admin/participants/participants-tabs'
import { Badge, buttonClass, Card, CardBody, EmptyState } from '@/components/ui/primitives'
import { requirePermission } from '@/lib/auth/rbac'
import { db } from '@/lib/db'
import {
  INVITATION_LABELS,
  INVITATION_TONES,
  ROW_STATUS_LABELS,
  ROW_STATUS_TONES,
} from '@/lib/migration/labels'
import type { InvitationStatus, MigrationRowStatus, Prisma } from '@/generated/prisma/client'

export const metadata: Metadata = { title: 'Import rows' }

const PER_PAGE = 50

const ROW_STATUSES: readonly string[] = [
  'PENDING',
  'VALID',
  'WARNING',
  'INVALID',
  'IMPORTED',
  'FAILED',
  'SKIPPED',
]
const INVITATION_STATUSES: readonly string[] = [
  'NOT_QUEUED',
  'QUEUED',
  'SENT',
  'DELIVERED',
  'BOUNCED',
  'FAILED',
  'SUPPRESSED',
]

/**
 * Every import row across every batch — the troubleshooting view.
 *
 * The dashboard's "import rows failed" and "invitation emails failed" land
 * here with the matching filter, so the number clicked is the number shown.
 * This is deliberately row-level (one CSV line, not one person): fixing a file
 * is row work. The person-level view lives next door under People.
 */
export default async function MigrationRowsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; invitation?: string; q?: string; batch?: string; page?: string }>
}) {
  await requirePermission('migration:view')
  const params = await searchParams

  const statuses = (params.status ?? '')
    .split(',')
    .map((part) => part.trim().toUpperCase())
    .filter((part): part is MigrationRowStatus => ROW_STATUSES.includes(part))
  const invitation = INVITATION_STATUSES.includes(params.invitation ?? '')
    ? (params.invitation as InvitationStatus)
    : undefined
  const q = params.q?.trim() ?? ''
  const page = Math.max(1, Number(params.page ?? 1) || 1)

  const where: Prisma.MigratedUserRecordWhereInput = {
    ...(statuses.length === 1 ? { status: statuses[0] } : {}),
    ...(statuses.length > 1 ? { status: { in: statuses } } : {}),
    ...(invitation ? { invitationStatus: invitation } : {}),
    ...(params.batch ? { batchId: params.batch } : {}),
    ...(q
      ? {
          OR: [
            { normalisedEmail: { contains: q.toLowerCase() } },
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    db.migratedUserRecord.count({ where }),
    db.migratedUserRecord.findMany({
      where,
      orderBy: [{ batchId: 'asc' }, { rowNumber: 'asc' }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        rowNumber: true,
        normalisedEmail: true,
        firstName: true,
        lastName: true,
        status: true,
        invitationStatus: true,
        invitationError: true,
        validationMessages: true,
        batch: { select: { id: true, reference: true, name: true } },
      },
    }),
  ])
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))

  const link = (overrides: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      status: params.status,
      invitation: params.invitation,
      q,
      batch: params.batch,
      ...overrides,
    }
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value)
    }
    const qs = next.toString()
    return `/admin/previous-participants/rows${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/previous-participants"
          className={buttonClass({ variant: 'ghost', size: 'sm' })}
        >
          <ArrowLeft aria-hidden className="size-4" />
          Imports
        </Link>
        <h1 className="mt-4 text-3xl">Import rows</h1>
        <p className="mt-1 text-body">
          {total.toLocaleString()} row{total === 1 ? '' : 's'} match — CSV lines across every batch,
          not unique people. A person mentioned in two files appears twice here, once per file.
        </p>
      </div>

      <ParticipantsTabs active="rows" />

      <form action="/admin/previous-participants/rows" className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label
            htmlFor="rows-q"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Search
          </label>
          <input
            id="rows-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Name or email"
            className="min-h-11 w-full rounded-field border border-line-strong bg-surface px-4 py-2 text-sm text-body placeholder:text-muted/70 hover:border-muted focus:border-primary"
          />
        </div>
        <div>
          <label
            htmlFor="rows-status"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Row outcome
          </label>
          <select
            id="rows-status"
            name="status"
            defaultValue={params.status ?? ''}
            className="min-h-11 rounded-field border border-line-strong bg-surface px-3 py-2 text-sm text-body"
          >
            <option value="">All outcomes</option>
            <option value="FAILED">Failed</option>
            <option value="INVALID">Cannot import</option>
            <option value="FAILED,INVALID">Needs attention (both)</option>
            <option value="SKIPPED">Skipped</option>
            <option value="IMPORTED">Imported</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="rows-invitation"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Invitation
          </label>
          <select
            id="rows-invitation"
            name="invitation"
            defaultValue={params.invitation ?? ''}
            className="min-h-11 rounded-field border border-line-strong bg-surface px-3 py-2 text-sm text-body"
          >
            <option value="">Any</option>
            <option value="FAILED">Failed</option>
            <option value="SENT">Sent</option>
            <option value="QUEUED">Queued</option>
            <option value="NOT_QUEUED">Not invited</option>
          </select>
        </div>
        <button type="submit" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          Apply
        </button>
      </form>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<FileWarning className="size-8" />}
              title="No rows match"
              description="Try widening the filters — or there is genuinely nothing to fix here."
            />
          </CardBody>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                Import rows, page {page} of {pages}
              </caption>
              <thead>
                <tr className="border-b border-line bg-surface-sunken">
                  <Th>Person</Th>
                  <Th>Batch</Th>
                  <Th>Row outcome</Th>
                  <Th>Invitation</Th>
                  <Th>Problem</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const messages = (row.validationMessages ?? []) as {
                    field: string
                    level: string
                    message: string
                  }[]
                  const firstError =
                    messages.find((m) => m.level === 'error')?.message ?? row.invitationError
                  return (
                    <tr key={row.id} className="border-b border-line last:border-0 hover:bg-surface-sunken">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">
                          {[row.firstName, row.lastName].filter(Boolean).join(' ') || '—'}
                        </p>
                        <p className="text-xs text-muted">{row.normalisedEmail}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/previous-participants/${row.batch.id}`}
                          className="text-sm underline-offset-2 hover:underline"
                        >
                          {row.batch.reference}
                        </Link>
                        <p className="text-xs text-muted">row {row.rowNumber}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={ROW_STATUS_TONES[row.status]}>
                          {ROW_STATUS_LABELS[row.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={INVITATION_TONES[row.invitationStatus]}>
                          {INVITATION_LABELS[row.invitationStatus]}
                        </Badge>
                      </td>
                      <td className="max-w-sm px-4 py-3 text-xs text-muted">{firstError ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
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
                <Link href={link({ page: String(page - 1) })} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                  Previous
                </Link>
              )}
              {page < pages && (
                <Link href={link({ page: String(page + 1) })} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="px-4 py-3 font-display text-xs font-bold uppercase tracking-wide text-ink">
      {children}
    </th>
  )
}
