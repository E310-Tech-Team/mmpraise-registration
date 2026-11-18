'use server'

import { headers } from 'next/headers'
import { eventConfig } from '@/config/site'
import { audit } from '@/lib/audit'
import { clientIp } from '@/lib/auth/session'
import { fail, ok, parseOrFail, type ActionResult } from '@/lib/actions/result'
import { createDiasporaSubmission } from '@/lib/diaspora/service'
import { getCountries } from '@/lib/reference'
import { ipKey, rateLimit } from '@/lib/security/rate-limit'
import { diasporaSchema } from '@/lib/validation/diaspora'

/**
 * The public diaspora participation form.
 *
 * Unauthenticated, so it carries the same protections as the contact form:
 * Next.js origin-checks the Server Action, requests are rate-limited per IP, a
 * honeypot catches simple bots, and every field is re-validated here with the
 * schemas the browser used.
 *
 * The limit is generous because one coordinator often submits several centres
 * from the same office connection in one sitting.
 */
const SUBMISSIONS_PER_HOUR = 20

export async function submitDiasporaAction(input: unknown): Promise<ActionResult<{ reference: string }>> {
  const limit = await rateLimit(await ipKey('diaspora'), SUBMISSIONS_PER_HOUR, 60)
  if (!limit.allowed) {
    return fail(
      `Too many submissions from this connection. Please try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
      undefined,
      'rate_limited',
    )
  }

  const parsed = parseOrFail(diasporaSchema, input)
  if (!parsed.ok) return parsed.result
  const { website, ...data } = parsed.data

  // Bots get a convincing success and nothing is stored.
  if (website) return ok({ reference: 'DSP-RECEIVED' })

  const countries = await getCountries()
  if (!countries.some((c) => c.name === data.country)) {
    return fail('Select a country from the list', { country: 'Select a country from the list' })
  }

  const headerList = await headers()
  const created = await createDiasporaSubmission(data, {
    edition: eventConfig.edition,
    ip: clientIp(headerList),
    userAgent: headerList.get('user-agent')?.slice(0, 500) ?? null,
  })

  await audit({
    action: 'diaspora.submitted',
    entityType: 'DiasporaSubmission',
    entityId: created.id,
    metadata: { reference: created.reference, country: data.country, edition: eventConfig.edition },
  })

  return ok({ reference: created.reference })
}
