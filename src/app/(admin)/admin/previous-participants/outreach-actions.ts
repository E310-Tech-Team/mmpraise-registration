'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/rbac'
import { fail, ok, parseOrFail, type ActionResult } from '@/lib/actions/result'
import {
  cancelOutreachRun,
  createReminderRun,
  getOutreachRunProgress,
  previewReminderRun,
  reminderDefaults,
  type ReminderKind,
} from '@/lib/outreach/service'
import { runOutreachQueue } from '@/lib/outreach/worker'

/**
 * Reminder campaigns, from the administrator's side of the counted contract:
 * preview states the exact audience, creation refuses if it changed, and the
 * worker re-checks each person at the moment of sending. All of it behind
 * `migration:invite` — the mass-email permission.
 */

const kindSchema = z.object({ kind: z.enum(['REMINDER_UNACTIVATED', 'REMINDER_UNCONFIRMED']) })

export async function previewReminderAction(input: unknown): Promise<
  ActionResult<{
    count: number
    sample: { email: string; firstName: string | null }[]
    cooldownDays: number
    maxRecipients: number
  }>
> {
  await requirePermission('migration:invite')
  const parsed = parseOrFail(kindSchema, input)
  if (!parsed.ok) return parsed.result

  const defaults = await reminderDefaults()
  const preview = await previewReminderRun({
    kind: parsed.data.kind as ReminderKind,
    cooldownDays: defaults.cooldownDays,
  })
  return ok({ ...preview, ...defaults })
}

const createSchema = kindSchema.extend({ expectedCount: z.number().int().positive() })

export async function createReminderRunAction(
  input: unknown,
): Promise<ActionResult<{ runId: string; planned: number }>> {
  const user = await requirePermission('migration:invite')
  const parsed = parseOrFail(createSchema, input)
  if (!parsed.ok) return parsed.result

  const defaults = await reminderDefaults()
  const result = await createReminderRun({
    kind: parsed.data.kind as ReminderKind,
    cooldownDays: defaults.cooldownDays,
    maxRecipients: defaults.maxRecipients,
    expectedCount: parsed.data.expectedCount,
    actorId: user.id,
  })
  if (!result.ok) return fail(result.error)

  // Start sending immediately; the dialog's polling keeps it moving after.
  await runOutreachQueue({ maxJobs: 2 }).catch((error) =>
    console.error('[outreach] inline pass failed', error),
  )

  revalidatePath('/admin/previous-participants/people')
  return ok({ runId: result.runId, planned: result.planned })
}

export async function outreachProgressAction(runId: string): Promise<
  ActionResult<{
    status: string
    planned: number
    sent: number
    failed: number
    skipped: number
    queued: number
    mailerMode: string
  }>
> {
  await requirePermission('migration:invite')

  // Advance the queue as part of polling — this poll is what drives sending
  // while the dialog is open, exactly like the batch screen's pattern.
  await runOutreachQueue({ maxJobs: 3 }).catch((error) =>
    console.error('[outreach] poll pass failed', error),
  )

  const progress = await getOutreachRunProgress(runId)
  if (!progress) return fail('That run no longer exists.')
  return ok({
    status: progress.run.status,
    planned: progress.run.plannedCount,
    sent: progress.sent,
    failed: progress.failed,
    skipped: progress.skipped,
    queued: progress.queued,
    mailerMode: progress.run.mailerMode,
  })
}

export async function cancelOutreachRunAction(runId: string): Promise<ActionResult> {
  const user = await requirePermission('migration:invite')
  const result = await cancelOutreachRun({ runId, actorId: user.id })
  if (!result.ok) return fail(result.error)
  revalidatePath('/admin/previous-participants/people')
  return ok()
}