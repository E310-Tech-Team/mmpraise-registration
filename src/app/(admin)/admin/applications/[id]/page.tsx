import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileText, Paperclip } from 'lucide-react'
import { HealthPanel, NotesPanel, StatusPanel } from '@/components/admin/review-panel'
import { Badge, buttonClass, Card, CardBody, CardHeader } from '@/components/ui/primitives'
import { eventConfig } from '@/config/site'
import { can, requireApplicantViewer } from '@/lib/auth/rbac'
import { getApplicationForReview } from '@/lib/admin/queries'
import { STATUS_LABELS, STATUS_TONES } from '@/lib/applications/status'
import { formatDate, humanise, initials } from '@/lib/utils'
import { AGE_RANGES, DENOMINATIONS, SHIFT_PERIODS } from '@/lib/validation/registration'

export const metadata: Metadata = { title: 'Application review' }

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireApplicantViewer()
  const { id } = await params
  const application = await getApplicationForReview(user, id)

  if (!application) notFound()

  const profile = application.user.profile

  /*
   * The review reads the *current* edition's participation — department,
   * answers, availability, shifts are all per-edition facts now. The query
   * orders participations newest-edition-first, so [0] is the one under
   * review; earlier editions remain in the array as history.
   */
  const participation =
    application.participations.find((row) => row.edition === eventConfig.edition) ??
    application.participations[0] ??
    null

  const answers = [...(participation?.answers ?? [])].sort(
    (a, b) => a.question.sortOrder - b.question.sortOrder,
  )
  const availability = participation?.availability ?? []
  const dates = [...new Set(availability.map((a) => a.date.toISOString().slice(0, 10)))].sort()
  const periods = [...new Set(availability.map((a) => a.period))]

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/applications" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft aria-hidden className="size-4" />
          Back to applicants
        </Link>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-center gap-4">
            {profile?.photoDocumentId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/files/${profile.photoDocumentId}`}
                alt={`${profile.firstName} ${profile.lastName}`}
                className="size-16 rounded-full border border-line object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="flex size-16 items-center justify-center rounded-full bg-ink text-lg font-bold text-white"
              >
                {initials(profile?.firstName, profile?.lastName)}
              </span>
            )}
            <div>
              <h1 className="text-2xl">
                {profile?.firstName} {profile?.lastName}
              </h1>
              <p className="text-sm text-muted">
                {application.user.mmpCode ?? application.registrationId} ·{' '}
                {participation?.department?.name ?? 'No department'}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Badge tone={STATUS_TONES[application.status]}>{STATUS_LABELS[application.status]}</Badge>
            <p className="text-sm text-muted">Submitted {formatDate(application.submittedAt, true)}</p>
            {can(user, 'volunteer:message') && (
              <Link
                href={`/admin/volunteer-messages/new?to=${application.user.id}`}
                className={buttonClass({ variant: 'secondary', size: 'sm' })}
              >
                Message volunteer
              </Link>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Contact and personal" />
            <CardBody>
              <Details
                items={[
                  { label: 'Email', value: application.user.email },
                  {
                    label: 'Email confirmed',
                    value: application.user.emailVerifiedAt ? formatDate(application.user.emailVerifiedAt) : 'Not confirmed',
                  },
                  { label: 'Phone', value: application.user.phone ?? '—' },
                  { label: 'Username', value: application.user.username },
                  { label: 'Gender', value: humanise(profile?.gender) },
                  {
                    label: 'Age range',
                    value: AGE_RANGES.find((a) => a.value === profile?.ageRange)?.label ?? '—',
                  },
                  ...(profile?.isMinor
                    ? [
                        { label: 'Parent or guardian', value: profile.guardianName ?? '—' },
                        { label: 'Guardian phone', value: profile.guardianPhone ?? '—' },
                        { label: 'Guardian consent', value: profile.guardianConsent ? 'Given' : 'Not given' },
                      ]
                    : []),
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Location, work and church" />
            <CardBody>
              <Details
                items={[
                  { label: 'Country', value: profile?.country?.name ?? '—' },
                  { label: 'State or province', value: profile?.state?.name ?? profile?.stateNameOther ?? '—' },
                  { label: 'City', value: profile?.city ?? '—' },
                  { label: 'Address', value: profile?.addressLine ?? '—' },
                  {
                    label: 'Occupation',
                    value: profile?.occupation === 'other' ? (profile.occupationOther ?? 'Other') : humanise(profile?.occupation),
                  },
                  {
                    label: 'Education',
                    value: profile?.education === 'other' ? (profile.educationOther ?? 'Other') : humanise(profile?.education),
                  },
                  {
                    label: 'Denomination',
                    value: DENOMINATIONS.find((d) => d.value === profile?.denomination)?.label ?? '—',
                  },
                  { label: 'RCCG region', value: profile?.region?.name ?? '—' },
                  { label: 'RCCG province', value: profile?.province?.name ?? '—' },
                  { label: 'Parish', value: profile?.parish?.name ?? profile?.parishNameOther ?? profile?.churchName ?? '—' },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Department answers"
              description={participation?.department?.name ?? 'No department selected'}
            />
            <CardBody>
              {answers.length === 0 ? (
                <p className="text-sm text-muted">No department answers recorded.</p>
              ) : (
                <dl className="space-y-4">
                  {answers.map((answer) => (
                    <div key={answer.id}>
                      <dt className="text-sm text-muted">{answer.question.label}</dt>
                      <dd className="font-medium text-ink">
                        {answer.options.length > 0
                          ? answer.options
                              .map((o) => (o.otherText ? `${o.option.label}: ${o.otherText}` : o.option.label))
                              .join(', ')
                          : answer.document
                            ? (
                                <a
                                  href={`/api/files/${answer.document.id}`}
                                  className="inline-flex items-center gap-1.5 text-primary underline underline-offset-4"
                                >
                                  <Paperclip aria-hidden className="size-4" />
                                  {answer.document.originalName}
                                </a>
                              )
                            : (answer.valueText ??
                              (answer.valueNumber !== null ? String(answer.valueNumber) : null) ??
                              (answer.valueDate ? formatDate(answer.valueDate) : null) ??
                              '—')}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Availability, motivation and emergency contact" />
            <CardBody>
              <Details
                items={[
                  { label: 'Available dates', value: dates.length ? dates.map((d) => formatDate(d)).join(', ') : '—' },
                  {
                    label: 'Preferred shifts',
                    value: periods.map((p) => SHIFT_PERIODS.find((s) => s.value === p)?.label ?? p).join(', ') || '—',
                  },
                  {
                    label: 'Overnight',
                    value:
                      participation?.availableOvernight == null
                        ? '—'
                        : participation.availableOvernight
                          ? 'Yes'
                          : 'No',
                  },
                  {
                    label: 'Emergency contact',
                    value: application.emergency
                      ? `${application.emergency.name} (${application.emergency.relationship}) — ${application.emergency.phone}`
                      : '—',
                  },
                  { label: 'How they heard about us', value: humanise(application.discoverySource) },
                ]}
              />

              <div className="mt-5 space-y-4 border-t border-line pt-4">
                <Longform label="Why they want to volunteer" value={application.whyVolunteer} />
                <Longform label="Skills and experience" value={application.skillsExperience} />
                <Longform label="Additional information" value={application.additionalInfo} />
              </div>
            </CardBody>
          </Card>

          {application.documents.length > 0 && (
            <Card>
              <CardHeader title="Uploaded documents" />
              <CardBody>
                <ul className="space-y-2">
                  {application.documents.map((document) => (
                    <li key={document.id}>
                      <a
                        href={`/api/files/${document.id}`}
                        className="inline-flex items-center gap-2 text-sm text-primary underline underline-offset-4"
                      >
                        <FileText aria-hidden className="size-4" />
                        {document.originalName}
                        <span className="text-muted">({Math.round(document.sizeBytes / 1024)} KB)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {can(user, 'application:review') ? (
            <StatusPanel
              applicationId={application.id}
              currentStatus={application.status}
              canDecide={can(user, 'application:decide')}
            />
          ) : (
            // View-only access (e.g. Communication Officers): the status is in
            // the header; changing it needs application:review, which the
            // server action enforces regardless of what is shown here.
            <Card>
              <CardHeader title="Status" description="You can view this application but not change its status." />
            </Card>
          )}

          <HealthPanel applicationId={application.id} canView={can(user, 'health:view')} />

          {can(user, 'application:note') && (
            <NotesPanel
              applicationId={application.id}
              notes={application.notes.map((note) => ({
                id: note.id,
                body: note.body,
                createdAt: formatDate(note.createdAt, true),
                author: note.author?.username ?? 'Unknown',
              }))}
            />
          )}

          <Card>
            <CardHeader title="Status history" />
            <CardBody>
              <ol className="space-y-3">
                {application.statusHistory.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3">
                    <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">
                        {STATUS_LABELS[entry.toStatus]}
                      </span>
                      <span className="block text-xs text-muted">
                        {formatDate(entry.createdAt, true)}
                        {entry.changedBy ? ` · ${entry.changedBy.username}` : ''}
                      </span>
                      {entry.reason && <span className="mt-1 block text-sm text-body">{entry.reason}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Details({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-sm text-muted">{item.label}</dt>
          <dd className="break-words font-medium text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Longform({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-0.5 whitespace-pre-line text-body">{value?.trim() || '—'}</p>
    </div>
  )
}
