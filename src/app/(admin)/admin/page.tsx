import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Inbox,
  MapPin,
  Megaphone,
  UploadCloud,
  UserPlus,
  Users,
} from 'lucide-react'
import { AdminCountdown } from '@/components/admin/admin-countdown'
import { DistributionRow, Metric } from '@/components/admin/overview/metric'
import { RefreshButton } from '@/components/admin/overview/refresh-button'
import { ParticipationChart } from '@/components/admin/overview/charts/participation-chart'
import { ResponseStagesChart } from '@/components/admin/overview/charts/response-stages-chart'
import { SubmissionsTrendChart } from '@/components/admin/overview/charts/submissions-trend-chart'
import { Badge, Card, CardBody, CardHeader, buttonClass } from '@/components/ui/primitives'
import { eventConfig, eventEndsAt, eventStartsAt, formatEventDateTime } from '@/config/site'
import { can, requirePermission } from '@/lib/auth/rbac'
import { getOverview } from '@/lib/admin/overview'
import { EVERYONE } from '@/lib/admin/queries'
import { percent } from '@/lib/admin/metrics'
import { PROFILE_REVIEW_TRACKED_SINCE, STAGE_LABELS } from '@/lib/admin/participants'
import { describeAction } from '@/lib/audit/labels'
import { AGE_RANGES } from '@/lib/validation/registration'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Administration overview' }

/**
 * The operational command centre.
 *
 * Ordered by the question it answers, top to bottom: *is anything on fire?* →
 * *where does the event stand?* → *how is the volunteer base moving?* → detail.
 * Two invariants hold everywhere: every figure is a link to the records behind
 * it (asserted by e2e), and every percentage names its denominator. Charts are
 * client islands over server-computed data; the accessible, keyboard path is
 * each chart's own data table.
 */
export default async function AdminOverviewPage() {
  const user = await requirePermission('application:review')
  const overview = await getOverview(user)

  const startsAt = eventStartsAt()
  const endsAt = eventEndsAt()

  const maxDepartment = Math.max(1, ...overview.distributions.byDepartment.map((d) => d.count))
  const maxCountry = Math.max(1, ...overview.distributions.byCountry.map((c) => c.count))
  const people = overview.migration?.people ?? null
  const stages = overview.migration?.stages ?? null
  const canExport = can(user, 'application:export')
  /** A per-tile CSV link, or nothing for viewers without export permission. */
  const exportFor = (query: string) =>
    canExport ? `/api/admin/export?format=csv${query ? `&${query}` : ''}` : undefined

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Overview</h1>
          <p className="mt-1 text-body">
            The operational state of the {eventConfig.editionLabel}.
            {overview.departmentScoped && ' Figures are limited to your departments.'}
          </p>
          <p className="mt-1 text-xs text-muted">
            Updated {formatDate(overview.generatedAt, true)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          {can(user, 'migration:create') && (
            <Link
              href="/admin/previous-participants/new"
              className={buttonClass({ variant: 'outline', size: 'sm' })}
            >
              <UploadCloud aria-hidden className="size-4" />
              New import
            </Link>
          )}
          {can(user, 'announcement:manage') && (
            <Link href="/admin/announcements" className={buttonClass({ variant: 'outline', size: 'sm' })}>
              <Megaphone aria-hidden className="size-4" />
              Announce
            </Link>
          )}
        </div>
      </div>

      {/* ------------------------------------------------- needs attention */}
      <Card>
        <CardHeader
          title="Needs attention"
          description={
            overview.needsAttention.length === 0
              ? undefined
              : 'Most urgent first. Each line opens the queue it counts.'
          }
        />
        <CardBody>
          {overview.needsAttention.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-body">
              <CheckCircle2 aria-hidden className="size-5 text-success" />
              Nothing is waiting on you. Every queue is clear.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {overview.needsAttention.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex min-h-11 items-center justify-between gap-4 py-2.5 hover:bg-surface-sunken"
                  >
                    <span className="flex items-center gap-3 text-sm font-medium text-ink">
                      <AlertTriangle
                        aria-hidden
                        className={`size-4 shrink-0 ${
                          item.tone === 'danger'
                            ? 'text-danger'
                            : item.tone === 'warning'
                              ? 'text-warning'
                              : 'text-info'
                        }`}
                      />
                      <span>
                        <span className="font-display text-lg font-bold tabular-nums">
                          {item.count}
                        </span>{' '}
                        {item.label}
                      </span>
                    </span>
                    <ArrowRight aria-hidden className="size-4 shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ----------------------------------------------------- event status */}
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="font-display text-sm font-bold uppercase tracking-wide text-primary-active">
              {eventConfig.editionName} {eventConfig.edition}
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm text-body">
              <CalendarClock aria-hidden className="size-4 shrink-0 text-muted" />
              {startsAt ? formatEventDateTime(startsAt) : 'Date to be announced'}
            </p>
            <p className="mt-0.5 flex items-center gap-2 text-sm text-muted">
              <MapPin aria-hidden className="size-4 shrink-0" />
              {eventConfig.venue.fullAddress}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <AdminCountdown
              startsAtIso={startsAt?.toISOString() ?? null}
              endsAtIso={endsAt?.toISOString() ?? null}
            />
            <Badge tone={overview.event.registrationOpen ? 'success' : 'danger'}>
              Registration {overview.event.registrationOpen ? 'open' : 'closed'}
            </Badge>
          </div>
        </CardBody>
      </Card>

      {/* --------------------------------------------- the three populations */}
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="min-w-0">
          <CardHeader
            title="Registrations"
            description="One-time standing: a person applies once and is approved once. Edition-independent."
          />
          <CardBody>
            {/*
              Total = Submitted + Draft, shown first and side by side so the
              arithmetic is visible. Every tile opens its list and, for anyone
              allowed to export, downloads exactly that list as CSV — the same
              filter, so the file holds the number on the tile.
            */}
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Metric
                label="Total"
                value={overview.applications.total}
                href={`/admin/applications?status=${EVERYONE}`}
                exportHref={exportFor(`status=${EVERYONE}`)}
              />
              <Metric
                label="Submitted"
                value={overview.applications.registered}
                href="/admin/applications"
                exportHref={exportFor('')}
                percent={percent(overview.applications.registered, overview.applications.total)}
                percentOfLabel="of total"
              />
              <Metric
                label="Draft"
                value={overview.applications.draft}
                href="/admin/applications?status=DRAFT"
                exportHref={exportFor('status=DRAFT')}
                tone={overview.applications.draft > 0 ? 'warning' : undefined}
                percent={percent(overview.applications.draft, overview.applications.total)}
                percentOfLabel="of total"
              />
              <Metric
                label="Awaiting review"
                value={overview.applications.awaitingReview}
                href="/admin/applications?status=SUBMITTED,UNDER_REVIEW"
                exportHref={exportFor('status=SUBMITTED,UNDER_REVIEW')}
                tone={overview.applications.awaitingReview > 0 ? 'warning' : undefined}
                percent={percent(overview.applications.awaitingReview, overview.applications.registered)}
                percentOfLabel="of submitted"
              />
              <Metric
                label="Approved"
                value={overview.applications.approved}
                href="/admin/applications?status=APPROVED"
                exportHref={exportFor('status=APPROVED')}
                tone="success"
                percent={percent(overview.applications.approved, overview.applications.registered)}
                percentOfLabel="of submitted"
              />
              <Metric
                label="Waitlisted"
                value={overview.applications.waitlisted}
                href="/admin/applications?status=WAITLISTED"
                exportHref={exportFor('status=WAITLISTED')}
              />
              <Metric
                label="Not accepted"
                value={overview.applications.rejected}
                href="/admin/applications?status=REJECTED"
                exportHref={exportFor('status=REJECTED')}
              />
            </ul>
            <p className="mt-4 text-xs text-muted">
              {overview.applications.submittedLast7Days} submitted in the last seven days
              {overview.applications.legacyStatuses > 0 &&
                ` · submitted includes ${overview.applications.legacyStatuses} in legacy statuses from before the registration/participation split`}
              . Draft exports include how far each person got and when they last saved, for follow-up
              .
            </p>
          </CardBody>
        </Card>

        <Card className="min-w-0">
          <CardHeader
            title={`This edition (${overview.edition})`}
            description="Who has said “I am coming”, and where they stand."
          />
          <CardBody>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Metric
                label="Confirmed"
                value={overview.participations.confirmed}
                href="/admin/applications?confirmed=1"
                tone="success"
              />
              <Metric
                label="Registered, not confirmed"
                value={overview.participations.unconfirmed}
                href="/admin/applications?status=SUBMITTED,UNDER_REVIEW,APPROVED,WAITLISTED&confirmed=0"
                tone={overview.participations.unconfirmed > 0 ? 'warning' : undefined}
              />
              <Metric
                label="Assigned to shifts"
                value={overview.participations.assigned}
                href="/admin/applications?confirmed=1&participation=ASSIGNED"
                percent={percent(overview.participations.assigned, overview.participations.confirmed)}
                percentOfLabel="of confirmed"
              />
              <Metric
                label="Checked in"
                value={overview.participations.checkedIn}
                href="/admin/applications?confirmed=1&participation=CHECKED_IN"
                percent={percent(overview.participations.checkedIn, overview.participations.confirmed)}
                percentOfLabel="of confirmed"
              />
              <Metric
                label="Completed"
                value={overview.participations.completed}
                href="/admin/applications?confirmed=1&participation=COMPLETED"
              />
              <Metric
                label="Withdrawn"
                value={overview.participations.withdrawn}
                href="/admin/applications?participation=WITHDRAWN"
                percent={percent(
                  overview.participations.withdrawn,
                  overview.participations.confirmed + overview.participations.withdrawn,
                )}
                percentOfLabel="of ever-confirmed"
              />
            </ul>
            <p className="mt-4 text-xs text-muted">
              Confirmed = said they are coming, not withdrawn, application not rejected. “Registered,
              not confirmed” counts registered volunteers only — previous participants who have not
              responded are in the next card, and the two overlap once a migrated person registers.
            </p>
          </CardBody>
        </Card>

        {overview.migration && people && (
          <Card className="min-w-0 lg:col-span-2 xl:col-span-1">
            <CardHeader
              title="Previous participants"
              description="People, not import rows — one figure per person however many files mention them."
              action={
                <Link
                  href="/admin/previous-participants"
                  className={buttonClass({ variant: 'ghost', size: 'sm' })}
                >
                  Imports
                </Link>
              }
            />
            <CardBody>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Metric
                  label="People"
                  value={people.total}
                  href="/admin/previous-participants/people"
                />
                <Metric
                  label="Invited"
                  value={people.invitedEver}
                  href="/admin/previous-participants/people?invited=1"
                  percent={percent(people.invitedEver, people.invitable)}
                  percentOfLabel="of invitable"
                />
                <Metric
                  label="Activated"
                  value={people.activated}
                  href="/admin/previous-participants/people?activated=1"
                  tone="success"
                  percent={percent(people.activated, people.total - people.excluded)}
                  percentOfLabel="of contactable"
                />
                <Metric
                  label="Profiles reviewed"
                  value={people.reviewed}
                  href="/admin/previous-participants/people?reviewed=1"
                  percent={percent(people.reviewed, people.activated)}
                  percentOfLabel="of activated"
                />
                <Metric
                  label="Confirmed this edition"
                  value={people.confirmed}
                  href="/admin/previous-participants/people?stage=confirmed"
                  tone="success"
                  percent={percent(people.confirmed, people.total - people.excluded)}
                  percentOfLabel="response rate"
                />
                <Metric
                  label="Not yet responded"
                  value={people.unresponded}
                  href="/admin/previous-participants/people?responded=0"
                  tone={people.unresponded > 0 ? 'warning' : undefined}
                  percent={percent(people.unresponded, people.total - people.excluded)}
                  percentOfLabel="of contactable"
                />
              </ul>
              <p className="mt-4 text-xs text-muted">
                Contactable = all previous participants minus the {people.excluded} excluded from
                contact. Profile reviews are tracked from{' '}
                {formatDate(PROFILE_REVIEW_TRACKED_SINCE)} — earlier history was never recorded.
                {overview.migration.runningBatches > 0 && (
                  <span aria-live="polite">
                    {' '}
                    {overview.migration.runningBatches}{' '}
                    {overview.migration.runningBatches === 1 ? 'import is' : 'imports are'} running
                    now.
                  </span>
                )}
                {overview.migration.sendsInFlight > 0 &&
                  ` ${overview.migration.sendsInFlight} emails are queued to send.`}
              </p>
            </CardBody>
          </Card>
        )}
      </div>

      {/* --------------------------------------------------------- charts */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="min-w-0">
          <CardHeader
            title="Submissions over time"
            description={`Applications submitted per week, last 12 weeks, Lagos time (WAT)${
              overview.departmentScoped ? ', your departments only' : ''
            }. The newest bar is the current, partial week.`}
          />
          <CardBody>
            <SubmissionsTrendChart data={overview.trend} />
          </CardBody>
        </Card>

        {stages && people && (
          <Card className="min-w-0">
            <CardHeader
              title="Previous-participant response"
              description={`Where all ${people.total} previous participants stand — one stage per person.`}
            />
            <CardBody>
              <ResponseStagesChart
                total={people.total}
                slices={[
                  {
                    key: 'confirmed',
                    label: STAGE_LABELS.confirmed,
                    count: stages.confirmed,
                    tone: 'success',
                    href: '/admin/previous-participants/people?stage=confirmed',
                  },
                  {
                    key: 'started',
                    label: STAGE_LABELS.started,
                    count: stages.started,
                    tone: 'info',
                    href: '/admin/previous-participants/people?stage=started',
                  },
                  {
                    key: 'activated',
                    label: STAGE_LABELS.activated,
                    count: stages.activated,
                    tone: 'brand',
                    href: '/admin/previous-participants/people?stage=activated',
                  },
                  {
                    key: 'invited',
                    label: STAGE_LABELS.invited,
                    count: stages.invited,
                    tone: 'primary',
                    href: '/admin/previous-participants/people?stage=invited',
                  },
                  {
                    key: 'not_invited',
                    label: STAGE_LABELS.not_invited,
                    count: stages.not_invited,
                    tone: 'muted',
                    href: '/admin/previous-participants/people?stage=not_invited',
                  },
                  {
                    key: 'excluded',
                    label: STAGE_LABELS.excluded,
                    count: stages.excluded,
                    tone: 'line',
                    href: '/admin/previous-participants/people?stage=excluded',
                  },
                ]}
              />
            </CardBody>
          </Card>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader
            title="Participation status"
            description={`Confirmed ${overview.edition} volunteers by where they stand; withdrawn shown beside them.`}
          />
          <CardBody>
            <ParticipationChart
              rows={[
                {
                  key: 'signedUp',
                  label: 'Signed up',
                  count: overview.participations.signedUp,
                  tone: 'info',
                  href: '/admin/applications?confirmed=1&participation=SIGNED_UP',
                },
                {
                  key: 'assigned',
                  label: 'Assigned to shifts',
                  count: overview.participations.assigned,
                  tone: 'primary',
                  href: '/admin/applications?confirmed=1&participation=ASSIGNED',
                },
                {
                  key: 'checkedIn',
                  label: 'Checked in',
                  count: overview.participations.checkedIn,
                  tone: 'brand',
                  href: '/admin/applications?confirmed=1&participation=CHECKED_IN',
                },
                {
                  key: 'completed',
                  label: 'Completed',
                  count: overview.participations.completed,
                  tone: 'success',
                  href: '/admin/applications?confirmed=1&participation=COMPLETED',
                },
                {
                  key: 'withdrawn',
                  label: 'Withdrawn',
                  count: overview.participations.withdrawn,
                  tone: 'danger',
                  href: '/admin/applications?participation=WITHDRAWN',
                },
              ]}
            />
          </CardBody>
        </Card>

        <Card className="min-w-0">
          <CardHeader
            title="By department"
            description={`Where confirmed ${overview.edition} volunteers are serving. Distribution only — departments have no cap.`}
          />
          <CardBody>
            <ul className="space-y-3">
              {overview.distributions.byDepartment.length === 0 && (
                <li className="text-sm text-muted">Nobody has confirmed a department yet.</li>
              )}
              {overview.distributions.byDepartment.map((row) => (
                <DistributionRow
                  key={row.id ?? 'none'}
                  label={row.name}
                  count={row.count}
                  max={maxDepartment}
                  href={`/admin/applications?confirmed=1&departmentId=${row.id ?? 'none'}`}
                />
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader title="Top countries" description="Registered volunteers by country of residence." />
          <CardBody>
            <ul className="space-y-3">
              {overview.distributions.byCountry.length === 0 && (
                <li className="text-sm text-muted">No applications yet.</li>
              )}
              {overview.distributions.byCountry.map((row) => (
                <DistributionRow
                  key={row.id ?? 'unknown'}
                  label={row.name}
                  count={row.count}
                  max={maxCountry}
                  tone="brand"
                  href={row.id ? `/admin/applications?countryId=${row.id}` : null}
                />
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card className="min-w-0">
          <CardHeader title="Age ranges" description="Registered volunteers by age range." />
          <CardBody>
            <ul className="space-y-3">
              {overview.distributions.byAgeRange.length === 0 && (
                <li className="text-sm text-muted">No applications yet.</li>
              )}
              {overview.distributions.byAgeRange.map((row) => (
                <DistributionRow
                  key={row.ageRange ?? 'unknown'}
                  label={
                    AGE_RANGES.find((range) => range.value === row.ageRange)?.label ??
                    row.ageRange ??
                    'Not given'
                  }
                  count={row.count}
                  max={Math.max(1, ...overview.distributions.byAgeRange.map((r) => r.count))}
                  href={row.ageRange ? `/admin/applications?ageRange=${row.ageRange}` : null}
                />
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      {/* ---------------------------------------------------- communications */}
      {overview.comms && (
        <Card>
          <CardHeader title="Communications" description="What the public has sent." />
          <CardBody>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {overview.comms.newMessages !== null && (
                <Metric
                  label="New messages"
                  value={overview.comms.newMessages}
                  href="/admin/messages"
                  tone={overview.comms.newMessages > 0 ? 'warning' : undefined}
                />
              )}
              {overview.comms.pendingTestimonies !== null && (
                <Metric
                  label="Pending testimonies"
                  value={overview.comms.pendingTestimonies}
                  href="/admin/testimonies"
                  tone={overview.comms.pendingTestimonies > 0 ? 'warning' : undefined}
                />
              )}
              {overview.migration && (
                <Metric
                  label="Failed invitation emails"
                  value={overview.migration.failedInvitationRows}
                  href="/admin/previous-participants/rows?invitation=FAILED"
                  tone={overview.migration.failedInvitationRows > 0 ? 'danger' : undefined}
                />
              )}
            </ul>
            <p className="mt-4 text-xs text-muted">
              Message and testimony counts match their inboxes’ default view (test data and spam
              hidden). “Failed invitation emails” covers invitation sends only — other mail is not
              centrally tracked yet.
            </p>
          </CardBody>
        </Card>
      )}

      {/* ------------------------------------------------ recent activity */}
      {overview.recentActivity.length > 0 && (
        <Card>
          <CardHeader
            title="Recent activity"
            description="The last few recorded actions, newest first."
            action={
              <Link href="/admin/audit" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                Activity log
              </Link>
            }
          />
          <CardBody>
            <ul className="divide-y divide-line">
              {overview.recentActivity.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm"
                >
                  <span className="text-body">
                    <span className="font-medium text-ink">
                      {entry.actor?.username ?? 'The system'}
                    </span>{' '}
                    {describeAction(entry.action).label}
                  </span>
                  <span className="text-xs tabular-nums text-muted">
                    {formatDate(entry.createdAt, true)}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* -------------------------------------------------- quick actions */}
      <Card>
        <CardHeader title="Quick actions" />
        <CardBody className="flex flex-wrap gap-3">
          <Link href="/admin/applications" className={buttonClass({ variant: 'outline', size: 'sm' })}>
            <Users aria-hidden className="size-4" />
            Review applications
          </Link>
          {can(user, 'migration:view') && (
            <Link
              href="/admin/previous-participants/people"
              className={buttonClass({ variant: 'outline', size: 'sm' })}
            >
              <UserPlus aria-hidden className="size-4" />
              Previous participants
            </Link>
          )}
          {can(user, 'contact:manage') && (
            <Link href="/admin/messages" className={buttonClass({ variant: 'outline', size: 'sm' })}>
              <Inbox aria-hidden className="size-4" />
              Messages
            </Link>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
