import { z } from 'zod'
import { multilineText, trimmedText } from './common'

/**
 * Direct messages from the volunteer team to volunteers' dashboard inboxes.
 *
 * Recipients are chosen two ways: one person (from their application page), or
 * everyone matching the applicant list's filters. Either way the server
 * re-resolves the recipients with the sender's own scoping and compares the
 * count with the one the sender confirmed, so a list that changed while they
 * were writing is never messaged by surprise.
 */

/** In-app copies are cheap rows; past this, an announcement is the right tool. */
export const MESSAGE_RECIPIENT_LIMIT = 5000

/**
 * Email notices are sent one at a time inside the request, as announcements
 * are. Above this the send would outlive the request, so larger groups get the
 * in-app message only.
 */
export const MESSAGE_EMAIL_LIMIT = 500

/** Every applicant-list filter, by the names the list and its export use. */
export const MESSAGE_FILTER_KEYS = [
  'q',
  'status',
  'departmentId',
  'countryId',
  'stateId',
  'churchRegionId',
  'churchProvinceId',
  'ageRange',
  'confirmed',
  'participation',
  'submittedFrom',
  'submittedTo',
  'imported',
] as const

export type MessageFilterKey = (typeof MESSAGE_FILTER_KEYS)[number]
export type MessageFilters = Partial<Record<MessageFilterKey, string>>

const filtersSchema = z
  .object(Object.fromEntries(MESSAGE_FILTER_KEYS.map((key) => [key, z.string().max(200).optional()])))
  .strict() as z.ZodType<MessageFilters>

export const messageSelectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('individual'), userId: z.string().min(1).max(40) }),
  z.object({ mode: z.literal('filter'), filters: filtersSchema }),
])

export type MessageSelection = z.infer<typeof messageSelectionSchema>

export const sendMessageSchema = z.object({
  subject: trimmedText(150).pipe(z.string().min(3, 'Give the message a subject')),
  body: multilineText(4000).pipe(z.string().min(1, 'Write the message')),
  sendEmail: z.boolean().default(false),
  selection: messageSelectionSchema,
  /** The recipient count the sender saw and confirmed. */
  expectedCount: z.number().int().positive(),
})

export type SendMessageInput = z.infer<typeof sendMessageSchema>

/** Keep only real filter keys with values — from a URL query or a form. */
export function pickMessageFilters(source: Record<string, string | string[] | undefined>): MessageFilters {
  const filters: MessageFilters = {}
  for (const key of MESSAGE_FILTER_KEYS) {
    const value = source[key]
    const single = Array.isArray(value) ? value[0] : value
    if (single) filters[key] = single
  }
  return filters
}
