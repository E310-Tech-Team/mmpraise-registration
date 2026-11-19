import Link from 'next/link'
import { Mail } from 'lucide-react'
import { Badge, EmptyState } from '@/components/ui/primitives'
import { formatDate } from '@/lib/utils'

export type InboxItem = {
  id: string
  readAt: Date | null
  createdAt: Date
  message: { id: string; subject: string; body: string }
}

/**
 * A volunteer's direct messages, newest first. Unread ones are bold and badged;
 * each opens on its own page, which marks it read.
 *
 * Kept apart from announcements on purpose: an announcement is the same text
 * for everyone, a message is addressed to this person and has a read state.
 */
export function MessageList({ items }: { items: InboxItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Mail className="size-8" />}
        title="No messages yet"
        description="When the volunteer team writes to you, it will appear here."
      />
    )
  }

  return (
    <ul className="divide-y divide-line">
      {items.map((item) => {
        const unread = !item.readAt
        const preview = item.message.body.replace(/\s+/g, ' ').slice(0, 140)
        return (
          <li key={item.id}>
            <Link
              href={`/dashboard/messages/${item.message.id}`}
              className="flex items-start gap-3 py-3 transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken sm:px-2"
            >
              <span
                aria-hidden
                className={`mt-2 size-2 shrink-0 rounded-full ${unread ? 'bg-primary' : 'bg-transparent'}`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={`truncate ${unread ? 'font-bold text-ink' : 'font-medium text-body'}`}>
                    {item.message.subject}
                  </span>
                  {unread && <Badge tone="brand">New</Badge>}
                </span>
                <span className="mt-0.5 block truncate text-sm text-muted">{preview}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">
                <span className="sr-only">Received </span>
                {formatDate(item.createdAt)}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
