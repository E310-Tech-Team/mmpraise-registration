import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Users } from 'lucide-react'
import { ComposeMessageForm } from '@/components/admin/volunteer-messages/compose-form'
import { Alert, Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives'
import { requirePermission } from '@/lib/auth/rbac'
import { db } from '@/lib/db'
import { countRecipients, selectionWhere } from '@/lib/messages/service'
import {
  MESSAGE_RECIPIENT_LIMIT,
  pickMessageFilters,
  type MessageSelection,
} from '@/lib/validation/messages'

export const metadata: Metadata = { title: 'New direct message' }

/**
 * Compose a direct message.
 *
 * Opened from an application ("Message volunteer", `?to=<userId>`) or from the
 * applicant list ("Message these volunteers", carrying the list's filters).
 * Recipients are counted with the sender's own scope, so this page can never
 * offer to message someone the sender cannot already see.
 */
export default async function NewVolunteerMessagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sender = await requirePermission('volunteer:message')
  const params = await searchParams
  const to = typeof params.to === 'string' ? params.to : undefined

  const filters = pickMessageFilters(params)
  const selection: MessageSelection = to ? { mode: 'individual', userId: to } : { mode: 'filter', filters }
  const listQuery = new URLSearchParams(filters as Record<string, string>).toString()

  let heading: React.ReactNode
  if (selection.mode === 'individual') {
    const application = await db.volunteerApplication.findFirst({
      where: selectionWhere(sender, selection),
      select: {
        id: true,
        user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    })
    if (!application) notFound()
    const name = [application.user.profile?.firstName, application.user.profile?.lastName].filter(Boolean).join(' ')
    heading = (
      <p className="text-body">
        To <strong>{name || application.user.email}</strong> ({application.user.email}) ·{' '}
        <Link href={`/admin/applications/${application.id}`} className="text-primary underline underline-offset-4">
          view application
        </Link>
      </p>
    )
  } else {
    heading = (
      <p className="text-body">
        To everyone matching the applicant list filters you had open ·{' '}
        <Link
          href={`/admin/applications${listQuery ? `?${listQuery}` : ''}`}
          className="text-primary underline underline-offset-4"
        >
          review that list
        </Link>
      </p>
    )
  }

  const recipientCount = await countRecipients(sender, selection)

  return (
    <div className="space-y-5">
      <Link
        href="/admin/volunteer-messages"
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" /> Direct messages
      </Link>

      <div>
        <h1 className="text-3xl">New direct message</h1>
        <div className="mt-1">{heading}</div>
      </div>

      <Card>
        <CardHeader
          title="Message"
          description="Arrives in each volunteer's inbox on their dashboard. Volunteers cannot reply here."
        />
        <CardBody>
          {recipientCount === 0 ? (
            <EmptyState
              icon={<Users className="size-8" />}
              title="Nobody to message"
              description="No volunteers match these filters. Go back to the applicant list and widen them."
            />
          ) : recipientCount > MESSAGE_RECIPIENT_LIMIT ? (
            <Alert tone="warning" title="Too many recipients">
              These filters match {recipientCount.toLocaleString()} volunteers. Direct messages go to at most{' '}
              {MESSAGE_RECIPIENT_LIMIT.toLocaleString()} at once — narrow the filters, or post an announcement instead.
            </Alert>
          ) : (
            <ComposeMessageForm selection={selection} recipientCount={recipientCount} />
          )}
        </CardBody>
      </Card>
    </div>
  )
}
