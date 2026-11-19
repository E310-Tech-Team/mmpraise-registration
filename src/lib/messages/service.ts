import 'server-only'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import type { Prisma } from '@/generated/prisma/client'
import type { SessionUser } from '@/lib/auth/session'
import { buildWhere, EVERYONE } from '@/lib/admin/queries'
import { sendMailSafely } from '@/lib/mail/mailer'
import { volunteerMessageEmail } from '@/lib/mail/templates'
import type { MessageSelection } from '@/lib/validation/messages'

/**
 * Direct messages: who receives them, sending, and the volunteer's inbox.
 *
 * Recipients always come through `buildWhere`, the applicant list's own query,
 * with the sender's department scope folded in. So the people a sender can
 * message are exactly the people they can see — a department head cannot reach
 * another department's volunteers by editing a URL.
 */

/** The application query a selection stands for, scoped to the sender. */
export function selectionWhere(sender: SessionUser, selection: MessageSelection): Prisma.VolunteerApplicationWhereInput {
  if (selection.mode === 'individual') {
    // Any status, drafts included: a person still registering can be messaged
    // from their record, but only if the sender may see that record at all.
    return { AND: [buildWhere(sender, { status: EVERYONE }), { userId: selection.userId }] }
  }
  return buildWhere(sender, selection.filters)
}

export async function countRecipients(sender: SessionUser, selection: MessageSelection): Promise<number> {
  return db.volunteerApplication.count({ where: selectionWhere(sender, selection) })
}

/**
 * The user ids a selection reaches, at most `limit + 1` — one past the limit, so
 * the caller can tell "exactly at the limit" from "over it".
 */
export async function resolveRecipients(
  sender: SessionUser,
  selection: MessageSelection,
  limit: number,
): Promise<string[]> {
  const rows = await db.volunteerApplication.findMany({
    where: selectionWhere(sender, selection),
    select: { userId: true },
    orderBy: { createdAt: 'asc' },
    take: limit + 1,
  })
  return [...new Set(rows.map((row) => row.userId))]
}

/** Store the message and one inbox copy per recipient, in one transaction. */
export async function createVolunteerMessage(params: {
  senderId: string
  subject: string
  body: string
  selection: MessageSelection
  userIds: string[]
  emailRequested: boolean
}): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    const message = await tx.volunteerMessage.create({
      data: {
        subject: params.subject,
        body: params.body,
        senderId: params.senderId,
        audience: params.selection.mode,
        filters: params.selection.mode === 'filter' ? (params.selection.filters as Prisma.InputJsonValue) : undefined,
        recipientCount: params.userIds.length,
        emailRequested: params.emailRequested,
      },
      select: { id: true },
    })
    await tx.volunteerMessageRecipient.createMany({
      data: params.userIds.map((userId) => ({ messageId: message.id, userId })),
      skipDuplicates: true,
    })
    return message
  })
}

/**
 * Email each recipient a "you have a message" notice and record the outcome.
 * Sequential and inside the request, like announcement emails — which is why
 * callers cap how many recipients may be emailed at once.
 */
export async function emailMessageNotices(messageId: string): Promise<{ succeeded: number; failed: number }> {
  const message = await db.volunteerMessage.findUniqueOrThrow({
    where: { id: messageId },
    select: {
      subject: true,
      recipients: {
        select: { user: { select: { email: true, isActive: true, profile: { select: { firstName: true } } } } },
      },
    },
  })

  const inboxUrl = `${env.APP_URL}/dashboard/messages`
  const failures: string[] = []
  let succeeded = 0

  for (const { user } of message.recipients) {
    if (!user.isActive) continue
    const notice = volunteerMessageEmail({
      name: user.profile?.firstName ?? 'there',
      subject: message.subject,
      inboxUrl,
    })
    const delivered = await sendMailSafely({ ...notice, to: user.email })
    if (delivered) succeeded += 1
    else failures.push(user.email)
  }

  await db.volunteerMessage.update({
    where: { id: messageId },
    data: {
      emailSucceeded: succeeded,
      emailFailed: failures.length,
      emailFailures: failures.length > 0 ? failures : undefined,
      emailCompletedAt: new Date(),
    },
  })
  return { succeeded, failed: failures.length }
}

// --- The volunteer's side ------------------------------------------------

export async function unreadMessageCount(userId: string): Promise<number> {
  return db.volunteerMessageRecipient.count({ where: { userId, readAt: null } })
}

export async function inboxFor(userId: string, take?: number) {
  return db.volunteerMessageRecipient.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      readAt: true,
      createdAt: true,
      message: { select: { id: true, subject: true, body: true } },
    },
  })
}

/**
 * One message as its recipient sees it, marked read on first open. Returns null
 * when the message was not sent to this person — never another volunteer's copy.
 */
export async function openMessage(userId: string, messageId: string) {
  const copy = await db.volunteerMessageRecipient.findUnique({
    where: { messageId_userId: { messageId, userId } },
    select: {
      id: true,
      readAt: true,
      createdAt: true,
      message: { select: { subject: true, body: true } },
    },
  })
  if (!copy) return null
  if (!copy.readAt) {
    const readAt = new Date()
    await db.volunteerMessageRecipient.update({ where: { id: copy.id }, data: { readAt } })
    return { ...copy, readAt, wasUnread: true }
  }
  return { ...copy, wasUnread: false }
}
