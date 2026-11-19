import type { Metadata } from 'next'
import { Card, CardBody, CardHeader } from '@/components/ui/primitives'
import { MessageList } from '@/components/volunteer/message-list'
import { requireUser } from '@/lib/auth/rbac'
import { inboxFor } from '@/lib/messages/service'

export const metadata: Metadata = { title: 'Messages' }

/** The volunteer's inbox: every direct message the volunteer team has sent them. */
export default async function MessagesPage() {
  const user = await requireUser()
  const items = await inboxFor(user.id)
  const unread = items.filter((item) => !item.readAt).length

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl">Messages</h1>
        <p className="mt-1 text-body">
          {unread > 0
            ? `${unread} unread ${unread === 1 ? 'message' : 'messages'} from the volunteer team.`
            : 'Messages from the volunteer team, addressed to you.'}
        </p>
      </div>
      <Card>
        <CardHeader title="Inbox" description="These are one-way — to reach the team, use the contact page." />
        <CardBody>
          <MessageList items={items} />
        </CardBody>
      </Card>
    </div>
  )
}
