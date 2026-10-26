import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, Phone, UserRound } from 'lucide-react'
import { ContactLogDialog } from '@/components/admin/participants/contact-log-dialog'
import { Badge, buttonClass, Card, CardBody, CardHeader } from '@/components/ui/primitives'
import { eventConfig } from '@/config/site'
import { can, requirePermission } from '@/lib/auth/rbac'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Previous participant' }

const OUTCOME_LABELS: Record<string, string> = {
  AWAITING_RESPONSE: 'Awaiting response',
  NEEDS_ASSISTANCE: 'Needs assistance',
  DECLINED: 'Declined',
  UNREACHABLE: 'Unreachable',
  RESOLVED: 'Resolved',
}
const CHANNEL_LABELS: Record<string, string> = {
  PHONE: 'Phone call',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'Email',
  IN_PERSON: 'In person',
  OTHER: 'Other',
}

/**
 * One previous participant: who they are, every edition they served, every
 * email the system sent them, and every conversation staff have had — the
 * page a phone call is made from.
 */
export default async function PreviousPersonPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const user = await requirePermission('migration:view')
  const { userId } = await params
  const edition = eventConfig.edition

  const person = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phone: true,
      mmpCode: true,
      createdAt: true,
      lastLoginAt: true,
      emailVerifiedAt: true,
      profileReviewedAt: true,
      profile: { select: { firstName: true, lastName: true, city: true, country: { select: { name: true } } } },
      previousParticipations: {
        orderBy: { edition: 'desc' },
        select: { edition: true, year: true, previousDepartment: true, previousRegistrationId: true },
      },
      applications: {
        select: {
          id: true,
          status: true,
          participations: {
            where: { edition },
            select: { confirmedAt: true, status: true, department: { select: { name: true } } },
          },
        },
      },
      migratedRecords: {
        select: {
          id: true,
          batchId: true,
          invitationStatus: true,
          invitedAt: true,
          invitationError: true,
          excludedFromInvites: true,
          activatedAt: true,
          batch: { select: { reference: true } },
        },
      },
      outreachAttempts: {
        orderBy: { queuedAt: 'desc' },
        take: 25,
        select: {
          id: true,
          kind: true,
          status: true,
          error: true,
          mailerMode: true,
          sentAt: true,
          queuedAt: true,
          run: { select: { templateKey: true } },
        },
      },
      contactLogs: {
        orderBy: { contactedAt: 'desc' },
        select: {
          id: true,
          channel: true,
          outcome: true,
          notes: true,
          contactedAt: true,
          nextFollowUpAt: true,
          admin: { select: { username: true } },
        },
      },
    },
  })
  if (!person || person.previousParticipations.length === 0) notFound()

  const name =
    [person.profile?.firstName, person.profile?.lastName].filter(Boolean).join(' ') || person.email
  const application = person.applications[0] ?? null
  const participation = application?.participations[0] ?? null
  const confirmed = Boolean(participation?.confirmedAt)
  const canFollowUp = can(user, 'migration:followup')

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/previous-participants/people"
          className={buttonClass({ variant: 'ghost', size: 'sm' })}
        >
          <ArrowLeft aria-hidden className="size-4" />
          All people
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 flex-1 truncate text-3xl">{name}</h1>
        {confirmed ? (
          <Badge tone="success">Confirmed for {edition}</Badge>
        ) : person.emailVerifiedAt ? (
          <Badge tone="brand">Activated</Badge>
        ) : (
          <Badge tone="warning">Not activated</Badge>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Contact" />
            <CardBody className="space-y-2 text-sm">
              <p className="flex items-center gap-2 text-body">
                <UserRound aria-hidden className="size-4 shrink-0 text-muted" />
                {person.mmpCode ?? 'No MMP number'}
              </p>
              <p className="flex items-center gap-2 text-body">
                <Mail aria-hidden className="size-4 shrink-0 text-muted" />
                <span className="break-all">{person.email}</span>
              </p>
              {person.phone && (
                <p className="flex items-center gap-2 text-body">
                  <Phone aria-hidden className="size-4 shrink-0 text-muted" />
                  {person.phone}
                </p>
              )}
              <p className="text-xs text-muted">
                {person.profile?.city ? `${person.profile.city}, ` : ''}
                {person.profile?.country?.name ?? ''}
                {person.lastLoginAt
                  ? ` · last signed in ${formatDate(person.lastLoginAt)}`
                  : ' · has never signed in'}
                {person.profileReviewedAt
                  ? ` · profile reviewed ${formatDate(person.profileReviewedAt)}`
                  : ''}
              </p>
              {application && (
                <p className="pt-1">
                  <Link
                    href={`/admin/applications/${application.id}`}
                    className={buttonClass({ variant: 'outline', size: 'sm' })}
                  >
                    Open their {edition} application
                  </Link>
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Editions served" />
            <CardBody>
              <ul className="space-y-2">
                {person.previousParticipations.map((row) => (
                  <li key={row.edition} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium text-ink">{row.edition}</span>
                    <span className="text-muted">
                      {row.previousDepartment ?? 'Department not recorded'}
                      {row.previousRegistrationId ? ` · ${row.previousRegistrationId}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Emails sent"
              description="Every invitation and reminder attempt, newest first. “Sent” means the mail transport accepted it — delivery is not tracked."
            />
            <CardBody>
              {person.outreachAttempts.length === 0 ? (
                <p className="text-sm text-muted">No emails have been sent to this person.</p>
              ) : (
                <ul className="space-y-2">
                  {person.outreachAttempts.map((attempt) => (
                    <li key={attempt.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge
                        tone={
                          attempt.status === 'SENT'
                            ? 'success'
                            : attempt.status === 'FAILED'
                              ? 'danger'
                              : 'neutral'
                        }
                      >
                        {attempt.status.toLowerCase()}
                      </Badge>
                      <span className="text-body">
                        {attempt.kind === 'INVITATION'
                          ? 'Invitation'
                          : attempt.kind === 'REMINDER_UNACTIVATED'
                            ? 'Activation reminder'
                            : 'Confirmation reminder'}
                      </span>
                      <span className="ml-auto text-xs text-muted">
                        {formatDate(attempt.sentAt ?? attempt.queuedAt, true)}
                        {attempt.mailerMode === 'file' && ' · written to file (dev)'}
                      </span>
                      {attempt.error && (
                        <span className="w-full text-xs text-danger">{attempt.error}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader
              title="Contact history"
              description="Staff conversations, newest first. Append-only — corrections are new entries."
              action={
                canFollowUp ? (
                  <ContactLogDialog
                    selection={{ mode: 'single', userId: person.id, name }}
                    triggerVariant="secondary"
                  />
                ) : undefined
              }
            />
            <CardBody>
              {person.contactLogs.length === 0 ? (
                <p className="text-sm text-muted">Nobody has logged contact with this person yet.</p>
              ) : (
                <ol className="space-y-3">
                  {person.contactLogs.map((log) => (
                    <li key={log.id} className="rounded-field bg-surface-sunken px-4 py-3">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge
                          tone={
                            log.outcome === 'RESOLVED'
                              ? 'success'
                              : log.outcome === 'DECLINED' || log.outcome === 'UNREACHABLE'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {OUTCOME_LABELS[log.outcome]}
                        </Badge>
                        <span className="text-body">{CHANNEL_LABELS[log.channel]}</span>
                        <span className="ml-auto text-xs text-muted">
                          {formatDate(log.contactedAt, true)}
                        </span>
                      </p>
                      {log.notes && <p className="mt-1.5 text-sm text-body">{log.notes}</p>}
                      <p className="mt-1 text-xs text-muted">
                        {log.admin?.username ?? 'Unknown'}
                        {log.nextFollowUpAt &&
                          ` · follow up ${formatDate(log.nextFollowUpAt, true)}`}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Invitation record" description="Per import file, for troubleshooting." />
            <CardBody>
              <ul className="space-y-2">
                {person.migratedRecords.length === 0 && (
                  <p className="text-sm text-muted">
                    No import rows — this account predates the migration and was matched by history.
                  </p>
                )}
                {person.migratedRecords.map((record) => (
                  <li key={record.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Link
                      href={`/admin/previous-participants/${record.batchId}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {record.batch.reference}
                    </Link>
                    <Badge tone={record.invitationStatus === 'SENT' ? 'success' : 'neutral'}>
                      {record.invitationStatus.toLowerCase().replace('_', ' ')}
                    </Badge>
                    {record.excludedFromInvites && <Badge tone="danger">Excluded</Badge>}
                    <span className="ml-auto text-xs text-muted">
                      {record.invitedAt ? `invited ${formatDate(record.invitedAt)}` : 'never invited'}
                      {record.activatedAt ? ` · activated ${formatDate(record.activatedAt)}` : ''}
                    </span>
                    {record.invitationError && (
                      <span className="w-full text-xs text-danger">{record.invitationError}</span>
                    )}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
