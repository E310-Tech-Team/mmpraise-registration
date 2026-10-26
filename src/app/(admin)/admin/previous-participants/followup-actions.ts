'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { eventConfig } from '@/config/site'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { requirePermission } from '@/lib/auth/rbac'
import { fail, ok, parseOrFail, type ActionResult } from '@/lib/actions/result'
import {
  participantsWhere,
  previousParticipantWhere,
  type ParticipantFilters,
} from '@/lib/admin/participants'

/**
 * Manual follow-up: the phone-bank's memory.
 *
 * Log entries are append-only — there is deliberately no edit or delete
 * action. A mis-recorded call is corrected by a new entry saying so, which is
 * the only version of history that survives an argument three months later.
 */

const CHANNELS = ['PHONE', 'WHATSAPP', 'SMS', 'EMAIL', 'IN_PERSON', 'OTHER'] as const
const OUTCOMES = [
  'AWAITING_RESPONSE',
  'NEEDS_ASSISTANCE',
  'DECLINED',
  'UNREACHABLE',
  'RESOLVED',
] as const

const entrySchema = z.object({
  channel: z.enum(CHANNELS),
  outcome: z.enum(OUTCOMES),
  notes: z.string().max(2000).optional().nullable(),
  /** `datetime-local`; defaults to now, never accepted from the future. */
  contactedAt: z.string().optional().nullable(),
  nextFollowUpAt: z.string().optional().nullable(),
})

const logSchema = entrySchema.extend({ userId: z.string().min(1) })

function parseLocal(value: string | null | undefined): Date | null | 'invalid' {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'invalid' : date
}

type BuiltEntry =
  | { ok: false; error: string }
  | {
      ok: true
      entry: {
        channel: (typeof CHANNELS)[number]
        outcome: (typeof OUTCOMES)[number]
        notes: string | null
        contactedAt: Date
        nextFollowUpAt: Date | null
      }
    }

function buildEntry(data: z.infer<typeof entrySchema>): BuiltEntry {
  const contactedAt = parseLocal(data.contactedAt)
  if (contactedAt === 'invalid') return { ok: false, error: 'The contact date could not be read.' }
  if (contactedAt && contactedAt.getTime() > Date.now() + 60_000) {
    return { ok: false, error: 'A contact cannot be logged in the future.' }
  }
  const nextFollowUpAt = parseLocal(data.nextFollowUpAt)
  if (nextFollowUpAt === 'invalid') {
    return { ok: false, error: 'The follow-up date could not be read.' }
  }

  return {
    ok: true,
    entry: {
      channel: data.channel,
      outcome: data.outcome,
      notes: data.notes?.trim() || null,
      contactedAt: contactedAt ?? new Date(),
      nextFollowUpAt,
    },
  }
}

export async function logContactAction(input: unknown): Promise<ActionResult<{ logId: string }>> {
  const user = await requirePermission('migration:followup')
  const parsed = parseOrFail(logSchema, input)
  if (!parsed.ok) return parsed.result

  const subject = await db.user.findFirst({
    where: { AND: [{ id: parsed.data.userId }, previousParticipantWhere()] },
    select: { id: true },
  })
  if (!subject) return fail('That person is not a previous participant.')

  const built = buildEntry(parsed.data)
  if (!built.ok) return fail(built.error)

  const log = await db.participantContactLog.create({
    data: { userId: subject.id, adminId: user.id, ...built.entry },
  })

  await audit({
    action: 'migration.contact_logged',
    entityType: 'User',
    entityId: subject.id,
    actorId: user.id,
    metadata: { channel: built.entry.channel, outcome: built.entry.outcome },
  })

  revalidatePath('/admin/previous-participants/people')
  revalidatePath(`/admin/previous-participants/people/${subject.id}`)
  return ok({ logId: log.id })
}

const BULK_LOG_LIMIT = 500

const bulkSchema = z.object({
  selection: z.union([
    z.object({ mode: z.literal('ids'), ids: z.array(z.string().min(1)).min(1).max(BULK_LOG_LIMIT) }),
    z.object({ mode: z.literal('filter'), filters: z.record(z.string(), z.string()) }),
  ]),
  /** What the dialog showed. The server re-counts and refuses on a change. */
  expectedCount: z.number().int().positive(),
  entry: entrySchema,
})

/**
 * One log entry against many people, under the house counted-bulk contract:
 * the dialog shows N, the server recomputes N with the same definition, and a
 * mismatch refuses rather than acting on people the administrator never saw.
 * The selection is explicit about its own meaning — the ids mode is "these
 * rows I ticked", the filter mode is "everything matching these filters, even
 * beyond this page".
 */
export async function bulkLogContactAction(
  input: unknown,
): Promise<ActionResult<{ logged: number }>> {
  const user = await requirePermission('migration:followup')
  const parsed = parseOrFail(bulkSchema, input)
  if (!parsed.ok) return parsed.result
  const { selection, expectedCount, entry: entryInput } = parsed.data

  const built = buildEntry(entryInput)
  if (!built.ok) return fail(built.error)

  let userIds: string[]
  if (selection.mode === 'ids') {
    const users = await db.user.findMany({
      where: { AND: [{ id: { in: selection.ids } }, previousParticipantWhere()] },
      select: { id: true },
    })
    userIds = users.map((row) => row.id)
  } else {
    const where = await participantsWhere(selection.filters as ParticipantFilters, eventConfig.edition)
    const users = await db.user.findMany({
      where,
      select: { id: true },
      take: BULK_LOG_LIMIT + 1,
    })
    userIds = users.map((row) => row.id)
  }

  if (userIds.length > BULK_LOG_LIMIT) {
    return fail(
      `That selection is ${userIds.length}+ people — more than the ${BULK_LOG_LIMIT} one run may touch. Narrow the filters.`,
    )
  }
  if (userIds.length !== expectedCount) {
    return fail(
      `The selection changed while you were reading: it is now ${userIds.length} people, not ${expectedCount}. Review and try again.`,
    )
  }

  await db.participantContactLog.createMany({
    data: userIds.map((userId) => ({ userId, adminId: user.id, ...built.entry })),
  })

  await audit({
    action: 'migration.contacts_bulk_logged',
    entityType: 'User',
    actorId: user.id,
    metadata: {
      count: userIds.length,
      channel: built.entry.channel,
      outcome: built.entry.outcome,
      mode: selection.mode,
    },
  })

  revalidatePath('/admin/previous-participants/people')
  return ok({ logged: userIds.length })
}