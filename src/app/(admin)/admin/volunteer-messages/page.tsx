import type { Metadata } from 'next'
import Link from 'next/link'
import { Send } from 'lucide-react'
import { buttonClass, Card, CardBody, EmptyState } from '@/components/ui/primitives'
import { requirePermission } from '@/lib/auth/rbac'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Direct messages' }

const PER_PAGE = 25

/**
 * Every direct message sent to volunteers, newest first, with how many have
 * been read. Messages are composed from the applicant list or an application —
 * that is where the recipients are chosen — so this page links there.
 */
export default async function VolunteerMessagesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requirePermission('volunteer:message')
  const page = Math.max(1, Number((await searchParams).page ?? 1) || 1)

  const [messages, total] = await Promise.all([
    db.volunteerMessage.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        subject: true,
        audience: true,
        recipientCount: true,
        emailRequested: true,
        createdAt: true,
        sender: { select: { username: true } },
      },
    }),
    db.volunteerMessage.count(),
  ])
  const reads = await db.volunteerMessageRecipient.groupBy({
    by: ['messageId'],
    where: { messageId: { in: messages.map((m) => m.id) }, readAt: { not: null } },
    _count: { _all: true },
  })
  const readCount = new Map(reads.map((r) => [r.messageId, r._count._all]))
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Direct messages</h1>
          <p className="mt-1 max-w-2xl text-body">
            Messages to volunteers&apos; dashboard inboxes. To send one, open the{' '}
            <Link href="/admin/applications" className="text-primary underline underline-offset-4">
              applicant list
            </Link>{' '}
            and choose &ldquo;Message these volunteers&rdquo;, or open an application and choose &ldquo;Message
            volunteer&rdquo;.
          </p>
        </div>
        <Link href="/admin/applications" className={buttonClass({ variant: 'primary', size: 'sm' })}>
          <Send aria-hidden className="size-4" /> Choose recipients
        </Link>
      </div>

      {messages.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<Send className="size-8" />}
              title="No messages sent yet"
              description="Messages you send to volunteers will be listed here with how many have read them."
            />
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                Direct messages, page {page} of {pages}
              </caption>
              <thead>
                <tr className="border-b border-line bg-surface-sunken">
                  <Th>Subject</Th>
                  <Th>Sent to</Th>
                  <Th>Read</Th>
                  <Th>Sent</Th>
                  <Th>By</Th>
                </tr>
              </thead>
              <tbody>
                {messages.map((message) => {
                  const read = readCount.get(message.id) ?? 0
                  return (
                    <tr key={message.id} className="border-b border-line last:border-0 hover:bg-surface-sunken">
                      <td className="max-w-96 px-4 py-3">
                        <Link
                          href={`/admin/volunteer-messages/${message.id}`}
                          className="block truncate font-semibold text-primary underline underline-offset-4"
                        >
                          {message.subject}
                        </Link>
                        {message.emailRequested && <span className="text-xs text-muted">with email notice</span>}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-body">
                        {message.recipientCount.toLocaleString()}{' '}
                        <span className="text-muted">{message.audience === 'individual' ? '(one person)' : '(filtered)'}</span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-body">
                        {read.toLocaleString()} of {message.recipientCount.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-body">{formatDate(message.createdAt, true)}</td>
                      <td className="px-4 py-3 text-body">{message.sender?.username ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Page {page} of {pages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/admin/volunteer-messages?page=${page - 1}`} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={`/admin/volunteer-messages?page=${page + 1}`} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
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
