import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Alert, Badge, buttonClass, Card, CardBody, CardHeader } from '@/components/ui/primitives'
import { requirePermission } from '@/lib/auth/rbac'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Direct message' }

const PER_PAGE = 50

/** One sent message: what it said, whether the email notice went, and who has read it. */
export default async function VolunteerMessagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string; sent?: string }>
}) {
  await requirePermission('volunteer:message')
  const { id } = await params
  const query = await searchParams
  const page = Math.max(1, Number(query.page ?? 1) || 1)

  const message = await db.volunteerMessage.findUnique({
    where: { id },
    include: { sender: { select: { username: true } } },
  })
  if (!message) notFound()

  const [recipients, readCount] = await Promise.all([
    db.volunteerMessageRecipient.findMany({
      where: { messageId: id },
      // Unread first: they are who a follow-up would be for.
      orderBy: [{ readAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        readAt: true,
        user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    }),
    db.volunteerMessageRecipient.count({ where: { messageId: id, readAt: { not: null } } }),
  ])
  const pages = Math.max(1, Math.ceil(message.recipientCount / PER_PAGE))

  return (
    <div className="space-y-5">
      <Link
        href="/admin/volunteer-messages"
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" /> Direct messages
      </Link>

      {query.sent === '1' && (
        <Alert tone="success" title="Message sent">
          It is in {message.recipientCount.toLocaleString()} {message.recipientCount === 1 ? 'inbox' : 'inboxes'} now.
        </Alert>
      )}

      <div>
        <h1 className="text-3xl">{message.subject}</h1>
        <p className="mt-1 text-body">
          Sent {formatDate(message.createdAt, true)} by {message.sender?.username ?? 'a former administrator'} to{' '}
          {message.recipientCount.toLocaleString()} {message.recipientCount === 1 ? 'volunteer' : 'volunteers'} · read
          by {readCount.toLocaleString()}
        </p>
      </div>

      <Card>
        <CardHeader title="Message" />
        <CardBody>
          <p className="whitespace-pre-line text-body">{message.body}</p>
        </CardBody>
      </Card>

      {message.emailRequested && (
        <Alert tone={message.emailFailed > 0 ? 'warning' : 'info'} title="Email notice">
          {message.emailCompletedAt
            ? `${message.emailSucceeded.toLocaleString()} sent${message.emailFailed > 0 ? `, ${message.emailFailed} failed` : ''}.`
            : 'Did not finish sending.'}
          {Array.isArray(message.emailFailures) && message.emailFailures.length > 0 && (
            <span className="mt-1 block break-words text-sm">Failed: {message.emailFailures.join(', ')}</span>
          )}
        </Alert>
      )}

      <Card className="overflow-hidden">
        <CardHeader title="Recipients" description="Unread first." />
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <caption className="sr-only">Recipients and whether they have read the message</caption>
            <thead>
              <tr className="border-b border-line bg-surface-sunken">
                <Th>Volunteer</Th>
                <Th>Email</Th>
                <Th>Read</Th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((recipient) => {
                const name = [recipient.user.profile?.firstName, recipient.user.profile?.lastName].filter(Boolean).join(' ')
                return (
                  <tr key={recipient.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 text-body">{name || '—'}</td>
                    <td className="px-4 py-3 text-body">{recipient.user.email}</td>
                    <td className="px-4 py-3">
                      {recipient.readAt ? (
                        <span className="text-body">{formatDate(recipient.readAt, true)}</span>
                      ) : (
                        <Badge tone="warning">Unread</Badge>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {pages > 1 && (
        <nav aria-label="Recipient pages" className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Page {page} of {pages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/admin/volunteer-messages/${id}?page=${page - 1}`} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={`/admin/volunteer-messages/${id}?page=${page + 1}`} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
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
