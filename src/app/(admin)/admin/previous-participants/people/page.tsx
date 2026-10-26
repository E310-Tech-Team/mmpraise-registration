import type { Metadata } from 'next'
import Link from 'next/link'
import { Download, Users } from 'lucide-react'
import { PeopleTable, type PersonRow } from '@/components/admin/participants/people-table'
import { ParticipantsTabs } from '@/components/admin/participants/participants-tabs'
import { ReminderComposer } from '@/components/admin/participants/reminder-composer'
import { Badge, buttonClass, Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives'
import { eventConfig } from '@/config/site'
import { can, requirePermission } from '@/lib/auth/rbac'
import { db } from '@/lib/db'
import {
  listPreviousParticipants,
  RESPONSE_STAGES,
  STAGE_LABELS,
  type ParticipantFilters,
  type ParticipantSort,
  type ResponseStage,
} from '@/lib/admin/participants'

export const metadata: Metadata = { title: 'Previous participants' }

const STAGE_TONES: Record<ResponseStage, PersonRow['stageTone']> = {
  excluded: 'neutral',
  confirmed: 'success',
  started: 'info',
  activated: 'brand',
  invited: 'warning',
  not_invited: 'neutral',
}

const OUTCOME_LABELS: Record<string, string> = {
  AWAITING_RESPONSE: 'Awaiting response',
  NEEDS_ASSISTANCE: 'Needs assistance',
  DECLINED: 'Declined',
  UNREACHABLE: 'Unreachable',
  RESOLVED: 'Resolved',
}

const FILTER_KEYS = [
  'q',
  'stage',
  'edition',
  'batch',
  'department',
  'invitation',
  'invited',
  'activated',
  'reviewed',
  'responded',
  'followup',
  'outcome',
] as const

/**
 * Every previous participant as a person — one row per account, however many
 * import files mention them. The dashboard's people-level figures land here
 * with the matching filter, and the export downloads exactly this list.
 */
export default async function PreviousPeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission('migration:view')
  const params = await searchParams
  const edition = eventConfig.edition

  const filters: ParticipantFilters = {}
  for (const key of FILTER_KEYS) {
    if (params[key]) filters[key] = params[key]
  }
  const page = Math.max(1, Number(params.page ?? 1) || 1)
  const sort = (['name', 'email', 'mmpCode', 'createdAt'] as const).find(
    (value) => value === params.sort,
  ) as ParticipantSort | undefined

  const canFollowUp = can(user, 'migration:followup')
  const canExport = can(user, 'migration:export')
  const canRemind = can(user, 'migration:invite')

  const [result, batches, editions, recentRuns] = await Promise.all([
    listPreviousParticipants({ filters, edition, page, sort }),
    db.migrationBatch.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, reference: true, name: true },
      take: 50,
    }),
    db.previousEditionParticipation.findMany({
      distinct: ['edition'],
      select: { edition: true },
      orderBy: { edition: 'desc' },
    }),
    canRemind
      ? db.outreachRun.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            kind: true,
            status: true,
            plannedCount: true,
            sentCount: true,
            failedCount: true,
            skippedCount: true,
            mailerMode: true,
            createdAt: true,
            createdBy: { select: { username: true } },
          },
        })
      : Promise.resolve([]),
  ])

  const activeFilters = Object.entries(filters) as [string, string][]
  const exportQuery = new URLSearchParams(activeFilters).toString()

  const link = (overrides: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = { ...filters, sort: params.sort, ...overrides }
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value)
    }
    const qs = next.toString()
    return `/admin/previous-participants/people${qs ? `?${qs}` : ''}`
  }

  const rows: PersonRow[] = result.rows.map((person) => ({
    id: person.id,
    name: person.name,
    email: person.email,
    phone: person.phone,
    mmpCode: person.mmpCode,
    editions: person.editions,
    previousDepartments: person.previousDepartments,
    stage: person.stage,
    stageLabel: STAGE_LABELS[person.stage],
    stageTone: STAGE_TONES[person.stage],
    invitedAt: person.invitedAt?.toISOString() ?? null,
    profileReviewedAt: person.profileReviewedAt?.toISOString() ?? null,
    lastContact: person.lastContact
      ? {
          outcome: person.lastContact.outcome,
          outcomeLabel: OUTCOME_LABELS[person.lastContact.outcome] ?? person.lastContact.outcome,
          contactedAt: person.lastContact.contactedAt.toISOString(),
          nextFollowUpAt: person.lastContact.nextFollowUpAt?.toISOString() ?? null,
        }
      : null,
  }))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Previous participants</h1>
          <p className="mt-1 text-body">
            {result.total.toLocaleString()} {result.total === 1 ? 'person' : 'people'} match — one
            row per person, however many import files mention them.
          </p>
        </div>
        {canExport && result.total > 0 && (
          <a
            href={`/api/admin/previous-participants/export${exportQuery ? `?${exportQuery}` : ''}`}
            className={buttonClass({ variant: 'outline', size: 'sm' })}
          >
            <Download aria-hidden className="size-4" />
            Export {result.total.toLocaleString()} as CSV
          </a>
        )}
      </div>

      <ParticipantsTabs active="people" />

      {canRemind && (
        <Card>
          <CardHeader
            title="Email reminders"
            description="Each campaign previews its exact audience before anything sends, re-checks every person at send time, and respects the cooldown and exclusions."
          />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <ReminderComposer kind="REMINDER_UNACTIVATED" />
              <ReminderComposer kind="REMINDER_UNCONFIRMED" />
            </div>
            {recentRuns.length > 0 && (
              <ul className="divide-y divide-line text-sm">
                {recentRuns.map((run) => (
                  <li key={run.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="text-body">
                      {run.kind === 'INVITATION'
                        ? 'Invitations'
                        : run.kind === 'REMINDER_UNACTIVATED'
                          ? 'Activation reminders'
                          : 'Confirmation reminders'}
                    </span>
                    <Badge
                      tone={
                        run.status === 'COMPLETED'
                          ? 'success'
                          : run.status === 'COMPLETED_WITH_ERRORS'
                            ? 'warning'
                            : run.status === 'CANCELLED'
                              ? 'neutral'
                              : 'info'
                      }
                    >
                      {run.status.toLowerCase().replaceAll('_', ' ')}
                    </Badge>
                    {run.mailerMode === 'file' && <Badge tone="neutral">dev — files only</Badge>}
                    <span className="ml-auto text-xs tabular-nums text-muted">
                      {run.sentCount}/{run.plannedCount} sent
                      {run.failedCount > 0 && ` · ${run.failedCount} failed`}
                      {run.skippedCount > 0 && ` · ${run.skippedCount} skipped`}
                      {run.createdBy ? ` · ${run.createdBy.username}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      <form action="/admin/previous-participants/people" className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label
            htmlFor="people-q"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Search
          </label>
          <input
            id="people-q"
            name="q"
            type="search"
            defaultValue={filters.q ?? ''}
            placeholder="Name, email, phone or MMP number"
            className="min-h-11 w-full rounded-field border border-line-strong bg-surface px-4 py-2 text-sm text-body placeholder:text-muted/70 hover:border-muted focus:border-primary"
          />
        </div>
        <FilterSelect
          id="people-stage"
          name="stage"
          label="Stage"
          defaultValue={filters.stage ?? ''}
          options={[
            { value: '', label: 'All stages' },
            ...RESPONSE_STAGES.map((stage) => ({ value: stage, label: STAGE_LABELS[stage] })),
          ]}
        />
        <FilterSelect
          id="people-edition"
          name="edition"
          label="Served in"
          defaultValue={filters.edition ?? ''}
          options={[
            { value: '', label: 'Any edition' },
            ...editions.map((row) => ({ value: row.edition, label: row.edition })),
          ]}
        />
        <FilterSelect
          id="people-batch"
          name="batch"
          label="Import batch"
          defaultValue={filters.batch ?? ''}
          options={[
            { value: '', label: 'Any batch' },
            ...batches.map((batch) => ({ value: batch.id, label: batch.reference })),
          ]}
        />
        <FilterSelect
          id="people-followup"
          name="followup"
          label="Follow-up"
          defaultValue={filters.followup ?? ''}
          options={[
            { value: '', label: 'Any' },
            { value: 'overdue', label: 'Overdue' },
            { value: 'due', label: 'Due' },
            { value: 'upcoming', label: 'Upcoming' },
          ]}
        />
        <FilterSelect
          id="people-outcome"
          name="outcome"
          label="Last outcome"
          defaultValue={filters.outcome ?? ''}
          options={[
            { value: '', label: 'Any' },
            ...Object.entries(OUTCOME_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
        <button type="submit" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          Apply
        </button>
        {activeFilters.length > 0 && (
          <Link
            href="/admin/previous-participants/people"
            className={buttonClass({ variant: 'ghost', size: 'sm' })}
          >
            Clear
          </Link>
        )}
      </form>

      {activeFilters.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          Active filters:
          {activeFilters.map(([key, value]) => (
            <Link
              key={key}
              href={link({ [key]: undefined, page: undefined })}
              className="rounded-pill border border-line px-2 py-0.5 hover:bg-surface-sunken"
              aria-label={`Remove the ${key} filter`}
            >
              {key}: {key === 'stage' ? STAGE_LABELS[value as ResponseStage] : value} ✕
            </Link>
          ))}
        </p>
      )}

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<Users className="size-8" />}
              title="Nobody matches"
              description="Try widening the filters — or import a previous-participants file first."
            />
          </CardBody>
        ) : (
          <CardBody>
            <PeopleTable
              rows={rows}
              total={result.total}
              filters={Object.fromEntries(activeFilters)}
              canFollowUp={canFollowUp}
            />
          </CardBody>
        )}

        {result.pages > 1 && (
          <nav
            aria-label="Pagination"
            className="flex items-center justify-between gap-3 border-t border-line px-4 py-3"
          >
            <p className="text-xs text-muted">
              Page {result.page} of {result.pages}
            </p>
            <div className="flex gap-2">
              {result.page > 1 && (
                <Link
                  href={link({ page: String(result.page - 1) })}
                  className={buttonClass({ variant: 'ghost', size: 'sm' })}
                >
                  Previous
                </Link>
              )}
              {result.page < result.pages && (
                <Link
                  href={link({ page: String(result.page + 1) })}
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

function FilterSelect({
  id,
  name,
  label,
  defaultValue,
  options,
}: {
  id: string
  name: string
  label: string
  defaultValue: string
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        className="min-h-11 rounded-field border border-line-strong bg-surface px-3 py-2 text-sm text-body"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
