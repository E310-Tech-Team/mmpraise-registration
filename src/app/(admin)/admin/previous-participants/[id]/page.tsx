import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowLeft, FileWarning, Info } from 'lucide-react'
import { BatchActions } from '@/components/admin/migration/batch-actions'
import { ColumnMapping } from '@/components/admin/migration/column-mapping'
import { RowTable, isRowFilter } from '@/components/admin/migration/row-table'
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
} from '@/components/ui/primitives'
import { Progress } from '@/components/ui/progress'
import { can, requirePermission } from '@/lib/auth/rbac'
import { db } from '@/lib/db'
import { inviteEligibleWhere } from '@/lib/outreach/eligibility'
import type { MigrationField } from '@/lib/migration/csv'
import {
  BATCH_NEXT_STEP,
  BATCH_STATUS_LABELS,
  BATCH_STATUS_TONES,
} from '@/lib/migration/labels'
import { readBatchCsv } from '@/lib/migration/service'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Import' }

/**
 * One import, from upload to invitations.
 *
 * Deliberately a single page rather than a multi-step wizard with its own
 * routes. An import is not a form to be filled in once: it is a thing that is
 * returned to — validated on Monday, confirmed on Tuesday, chased for the rest
 * of the week — and every one of those visits wants the same evidence in the
 * same place. The stage is carried by which cards are actionable, not by
 * hiding the others.
 */
export default async function MigrationBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ rows?: string }>
}) {
  const user = await requirePermission('migration:view')
  const { id } = await params
  const { rows: rowFilter } = await searchParams

  const batch = await db.migrationBatch.findUnique({
    where: { id },
    include: { createdBy: { select: { username: true, email: true } } },
  })
  if (!batch) notFound()

  const [rowCounts, actionCounts, invitationCounts, activatedCount, reviewedCount, jobCounts] =
    await Promise.all([
    db.migratedUserRecord.groupBy({
      by: ['status'],
      where: { batchId: batch.id },
      _count: { _all: true },
    }),
    /*
     * Grouped by action as well as status.
     *
     * "How many already have an account?" is answerable straight after
     * validation, but `batch.matchedRows` is only written once the import has
     * actually run — so reading that counter showed a confident zero on the
     * very screen an administrator uses to decide whether to import at all.
     */
    db.migratedUserRecord.groupBy({
      by: ['action'],
      where: { batchId: batch.id },
      _count: { _all: true },
    }),
    /*
     * Invitation figures cover only the rows that could ever receive one.
     *
     * Counting every row put the invalid line, the in-file duplicate and three
     * people who already had accounts into "not yet invited" — five, on a batch
     * where nobody was ever going to be emailed. Only an account this import
     * created is invitable, so that is what these totals describe.
     */
    db.migratedUserRecord.groupBy({
      by: ['invitationStatus'],
      where: { batchId: batch.id, action: 'CREATE', status: 'IMPORTED' },
      _count: { _all: true },
    }),
    db.migratedUserRecord.count({ where: { batchId: batch.id, activatedAt: { not: null } } }),
    db.migratedUserRecord.count({ where: { batchId: batch.id, profileReviewedAt: { not: null } } }),
    db.importJob.groupBy({
      by: ['status'],
      where: { batchId: batch.id },
      _count: { _all: true },
    }),
  ])

  const rows = (status: string) =>
    rowCounts.find((row) => row.status === status)?._count._all ?? 0
  const byAction = (action: string) =>
    actionCounts.find((row) => row.action === action)?._count._all ?? 0
  const invitations = (status: string) =>
    invitationCounts.find((row) => row.invitationStatus === status)?._count._all ?? 0
  const jobs = (status: string) => jobCounts.find((row) => row.status === status)?._count._all ?? 0

  const importable = rows('VALID') + rows('WARNING')
  const imported = rows('IMPORTED')
  const failed = rows('FAILED')
  const totalRows = rowCounts.reduce((sum, row) => sum + row._count._all, 0) || batch.totalRows

  /*
   * The same predicate the Invite button will claim with — imported from the
   * outreach module rather than restated, so the button's number and what it
   * does can never drift apart again. (The old hand-rolled copy had no
   * invitationStatus filter and kept advertising rows the queue could not
   * reach.)
   */
  const [invitable, sendingInvitations] = await Promise.all([
    db.migratedUserRecord.count({ where: inviteEligibleWhere(batch.id) }),
    // Keeps the screen's 5s pulse alive while an invitation run still has
    // queued sends, since sending only advances while someone is watching.
    db.outreachAttempt.count({
      where: { run: { batchId: batch.id }, status: { in: ['QUEUED', 'SENDING'] } },
    }),
  ])

  // Only needed while the mapping can still change; once queued the file may
  // also have been purged, and re-reading it would be wasted work.
  const parsed =
    batch.status === 'DRAFT' || batch.status === 'VALIDATED' ? await readBatchCsv(batch.id) : null

  const mapping = batch.columnMapping as Record<string, MigrationField | ''>
  const canExecute = can(user, 'migration:execute')

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/previous-participants"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary-active underline underline-offset-4"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Back to imports
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl">{batch.reference}</h1>
            <p className="mt-1 text-body">{batch.name}</p>
            <p className="mt-1 text-sm text-muted">
              {batch.sourceEdition}
              {batch.sourceYear ? ` · ${batch.sourceYear}` : ''} · {batch.originalFilename} ·
              uploaded {formatDate(batch.createdAt)}
              {batch.createdBy ? ` by ${batch.createdBy.username}` : ''}
            </p>
          </div>
          <Badge tone={BATCH_STATUS_TONES[batch.status]}>{BATCH_STATUS_LABELS[batch.status]}</Badge>
        </div>
      </div>

      <Alert tone="info" icon={<Info className="size-5" />}>
        {BATCH_NEXT_STEP[batch.status]}
      </Alert>

      {batch.fileDeletedAt && (
        <Alert tone="warning" title="The uploaded file has been deleted" icon={<FileWarning className="size-5" />}>
          Uploads are removed 30 days after an import finishes. The imported records and this report
          remain; the original spreadsheet does not.
        </Alert>
      )}

      {batch.sourceNote && (
        <Card>
          <CardHeader title="Notes" />
          <CardBody className="text-sm text-body">{batch.sourceNote}</CardBody>
        </Card>
      )}

      {/* --------------------------------------------------------- actions */}
      <Card>
        <CardHeader title="Actions" />
        <CardBody>
          <BatchActions
            batchId={batch.id}
            status={batch.status}
            importableRows={importable}
            invitableRows={invitable}
            failedRows={failed}
            sendingInvitations={sendingInvitations > 0}
            can={{
              execute: canExecute,
              invite: can(user, 'migration:invite'),
              export: can(user, 'migration:export'),
            }}
          />
          {!canExecute && (
            <p className="mt-4 text-sm text-muted">
              You can view this import but not run it. Running an import and sending invitations are
              granted separately.
            </p>
          )}
        </CardBody>
      </Card>

      {/* ---------------------------------------------------------- report */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="What this file contains"
            description={batch.status === 'DRAFT' ? 'Validate to fill this in.' : undefined}
          />
          <CardBody>
            {batch.status === 'DRAFT' ? (
              <EmptyState
                icon={<AlertTriangle className="size-8" />}
                title="Not validated yet"
                description="Confirm the column mapping below, then validate. Validating reads the file and checks every row without writing anything to volunteer records."
              />
            ) : (
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <Figure label="Rows in file" value={totalRows} />
                {/*
                  Before the import this counts what is *waiting*; afterwards
                  those same rows are IMPORTED and the figure drops to zero. A
                  card headed "Ready to import 0" on a finished batch reads as
                  "nothing was importable", so the label follows the lifecycle.
                */}
                {imported > 0 ? (
                  <Figure label="Imported" value={imported} tone="success" />
                ) : (
                  <Figure label="Ready to import" value={importable} tone="success" />
                )}
                <Figure label="New accounts" value={byAction('CREATE')} />
                <Figure label="Already have an account" value={byAction('MATCH_EXISTING')} />
                <Figure label="Duplicates in file" value={rows('SKIPPED')} />
                <Figure
                  label="Cannot import"
                  value={rows('INVALID')}
                  tone={rows('INVALID') > 0 ? 'danger' : undefined}
                />
              </dl>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Import progress" />
          <CardBody className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-muted">Rows processed</span>
                <span className="tabular-nums text-ink">
                  {imported + failed} of {totalRows}
                </span>
              </div>
              <Progress
                className="mt-2 h-2"
                value={imported + failed}
                max={Math.max(1, totalRows)}
                label={`Import progress: ${imported + failed} of ${totalRows} rows processed`}
              />
            </div>

            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Figure label="Accounts created" value={batch.createdRows} tone="success" />
              <Figure label="Linked to existing" value={batch.matchedRows} />
              <Figure label="Failed" value={failed} tone={failed > 0 ? 'danger' : undefined} />
              <Figure label="Jobs waiting" value={jobs('PENDING') + jobs('RUNNING')} />
            </dl>

            {/*
              A live region, so an administrator who is not watching the screen
              still hears when a long import finishes.
            */}
            <p className="sr-only" aria-live="polite">
              {imported + failed} of {totalRows} rows processed.{' '}
              {jobs('PENDING') + jobs('RUNNING') === 0 ? 'No work remaining.' : 'Still running.'}
            </p>
          </CardBody>
        </Card>
      </div>

      {/* ----------------------------------------------------- invitations */}
      {(batch.status === 'COMPLETED' || batch.status === 'COMPLETED_WITH_WARNINGS') && (
        <Card>
          <CardHeader
            title="Invitations and activation"
            description={`Of the ${byAction('CREATE')} ${byAction('CREATE') === 1 ? 'account' : 'accounts'} this import created — people who already had one are never invited.`}
          />
          <CardBody>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
              <Figure label="Not yet invited" value={invitations('NOT_QUEUED')} />
              <Figure label="Queued" value={invitations('QUEUED')} />
              <Figure label="Sent" value={invitations('SENT')} tone="success" />
              <Figure
                label="Failed"
                value={invitations('FAILED') + invitations('BOUNCED')}
                tone={invitations('FAILED') + invitations('BOUNCED') > 0 ? 'danger' : undefined}
              />
              <Figure label="Excluded" value={invitations('SUPPRESSED')} />
            </dl>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Figure label="Accounts activated" value={activatedCount} tone="success" />
              <Figure label="Profiles reviewed" value={reviewedCount} />
            </div>

            <p className="mt-4 text-xs text-muted">
              “Sent” means the mail provider accepted the message. Delivery is only reported when a
              provider confirms it, so the two are never treated as the same thing.
            </p>
          </CardBody>
        </Card>
      )}

      {/* --------------------------------------------------------- mapping */}
      <Card>
        <CardHeader
          title="Column mapping"
          description={
            batch.status === 'DRAFT' || batch.status === 'VALIDATED'
              ? 'Say what each column in your file means. Unmapped columns are ignored.'
              : 'Fixed once the import has been queued.'
          }
        />
        <CardBody>
          {parsed ? (
            <ColumnMapping
              batchId={batch.id}
              headers={parsed.headers}
              sample={parsed.rows.slice(0, 5)}
              initialMapping={mapping}
              editable={
                (batch.status === 'DRAFT' || batch.status === 'VALIDATED') &&
                can(user, 'migration:create')
              }
            />
          ) : (
            <ul className="space-y-2 text-sm">
              {Object.entries(mapping).map(([header, field]) => (
                <li key={header} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2 last:border-0">
                  <span className="font-medium text-ink">{header}</span>
                  <span className="text-muted">{field || 'not imported'}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ------------------------------------------------------------ rows */}
      <RowTable
        batchId={batch.id}
        filter={isRowFilter(rowFilter) ? rowFilter : 'problems'}
        canInvite={can(user, 'migration:invite')}
      />
    </div>
  )
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'success' | 'warning' | 'danger'
}) {
  const colour =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'danger'
          ? 'text-danger'
          : 'text-ink'

  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`mt-0.5 font-display text-2xl font-bold tabular-nums ${colour}`}>{value}</dd>
    </div>
  )
}
