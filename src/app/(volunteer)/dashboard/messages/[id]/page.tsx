import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/primitives'
import { RefreshUnread } from '@/components/volunteer/refresh-unread'
import { requireUser } from '@/lib/auth/rbac'
import { openMessage } from '@/lib/messages/service'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Message' }

/**
 * One message, opened by its recipient — which marks it read. `openMessage`
 * looks the message up by (message, signed-in user), so a volunteer can only
 * ever open a message addressed to them; any other id is simply not found.
 */
export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const copy = await openMessage(user.id, id)
  if (!copy) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {copy.wasUnread && <RefreshUnread />}
      <Link
        href="/dashboard/messages"
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" /> All messages
      </Link>
      <Card>
        <CardBody>
          <article className="space-y-4">
            <header>
              <h1 className="text-2xl">{copy.message.subject}</h1>
              <p className="mt-1 text-sm text-muted">
                From the MMPraise volunteer team · {formatDate(copy.createdAt, true)}
              </p>
            </header>
            <p className="whitespace-pre-line text-body">{copy.message.body}</p>
          </article>
        </CardBody>
      </Card>
      <p className="text-sm text-muted">
        This message is one-way. To get in touch with the team, use the{' '}
        <Link href="/contact" className="text-primary underline underline-offset-4">
          contact page
        </Link>
        .
      </p>
    </div>
  )
}
