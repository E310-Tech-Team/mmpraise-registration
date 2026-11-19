'use server'

import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { requirePermission } from '@/lib/auth/rbac'
import { fail, ok, parseOrFail, type ActionResult } from '@/lib/actions/result'
import { createVolunteerMessage, emailMessageNotices, resolveRecipients } from '@/lib/messages/service'
import { MESSAGE_EMAIL_LIMIT, MESSAGE_RECIPIENT_LIMIT, sendMessageSchema } from '@/lib/validation/messages'

/**
 * Send a direct message to volunteers' dashboard inboxes.
 *
 * The counted-confirm contract used by bulk approve and bulk follow-up: the
 * sender confirmed "send to N people", so the recipients are resolved again
 * here, with the sender's own scoping, and the send is refused if that number
 * moved. Nobody is messaged on the strength of a list that changed under them.
 */
export async function sendVolunteerMessageAction(
  input: unknown,
): Promise<ActionResult<{ id: string; emailed: number; emailFailed: number }>> {
  const sender = await requirePermission('volunteer:message')
  const parsed = parseOrFail(sendMessageSchema, input)
  if (!parsed.ok) return parsed.result
  const { subject, body, sendEmail, selection, expectedCount } = parsed.data

  const userIds = await resolveRecipients(sender, selection, MESSAGE_RECIPIENT_LIMIT)

  if (userIds.length === 0) {
    return fail('There is nobody to send this to — the volunteer is no longer in your list.', undefined, 'no_recipients')
  }
  if (userIds.length > MESSAGE_RECIPIENT_LIMIT) {
    return fail(
      `This would reach more than ${MESSAGE_RECIPIENT_LIMIT.toLocaleString()} volunteers. Narrow the filters, or post an announcement instead.`,
      undefined,
      'too_many',
    )
  }
  if (userIds.length !== expectedCount) {
    return fail(
      `The list changed while you were writing: it is now ${userIds.length} ${userIds.length === 1 ? 'volunteer' : 'volunteers'}, not ${expectedCount}. Check the recipients and send again.`,
      undefined,
      'count_changed',
    )
  }
  if (sendEmail && userIds.length > MESSAGE_EMAIL_LIMIT) {
    return fail(
      `Email notices can go to at most ${MESSAGE_EMAIL_LIMIT} volunteers at once. Send without email, or narrow the filters.`,
      undefined,
      'email_limit',
    )
  }

  const message = await createVolunteerMessage({
    senderId: sender.id,
    subject,
    body,
    selection,
    userIds,
    emailRequested: sendEmail,
  })
  const email = sendEmail ? await emailMessageNotices(message.id) : { succeeded: 0, failed: 0 }

  await audit({
    action: 'volunteer_message.sent',
    entityType: 'VolunteerMessage',
    entityId: message.id,
    actorId: sender.id,
    metadata: {
      recipients: userIds.length,
      mode: selection.mode,
      email: sendEmail ? { succeeded: email.succeeded, failed: email.failed } : false,
    },
  })

  revalidatePath('/admin/volunteer-messages')
  revalidatePath('/dashboard', 'layout')

  return ok({ id: message.id, emailed: email.succeeded, emailFailed: email.failed })
}
