import 'server-only'
import { randomInt } from 'node:crypto'
import { db } from '@/lib/db'
import { isUniqueViolation } from '@/lib/db-errors'
import type { Prisma } from '@/generated/prisma/client'
import type { DiasporaSubmissionInput } from '@/lib/validation/diaspora'

/**
 * Persistence and queries for diaspora participation responses.
 *
 * Shared by the public Server Action, the admin pages and the CSV export, so
 * "which responses match this search" has one definition everywhere.
 */

/** No 0/O or 1/I/L: the reference is read aloud over the phone and typed back. */
const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const REFERENCE_LENGTH = 6
const MAX_REFERENCE_ATTEMPTS = 5

export function generateReference(): string {
  let code = ''
  for (let i = 0; i < REFERENCE_LENGTH; i += 1) {
    code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]
  }
  return `DSP-${code}`
}

function isReferenceCollision(error: unknown): boolean {
  return isUniqueViolation(error, 'reference')
}

/** True when this error is the one-response-per-responder rule refusing a second response. */
export function isDuplicateResponder(error: unknown): boolean {
  return isUniqueViolation(error, 'responderEmailKey')
}

export function responderKey(email: string): string {
  return email.trim().toLowerCase()
}

/** Has this responder email already submitted for this edition? */
export async function hasResponded(edition: string, email: string): Promise<boolean> {
  const existing = await db.diasporaSubmission.findUnique({
    where: { edition_responderEmailKey: { edition, responderEmailKey: responderKey(email) } },
    select: { id: true },
  })
  return existing !== null
}

/** Store one response. Returns its reference, retrying on the rare collision. */
export async function createDiasporaSubmission(
  data: Omit<DiasporaSubmissionInput, 'website'>,
  context: { edition: string; ip: string | null; userAgent: string | null },
): Promise<{ id: string; reference: string }> {
  const fields = {
    edition: context.edition,
    country: data.country,
    countryPastorName: data.countryPastorName,
    countryPastorEmail: data.countryPastorEmail,
    countryPastorPhone: data.countryPastorPhone || null,
    continentalOverseer: data.continentalOverseer,
    centreNameAndLocation: data.centreNameAndLocation,
    centreOfficialEmail: data.centreOfficialEmail,
    picName: data.picName || null,
    picEmail: data.picEmail || null,
    picPhone: data.picPhone || null,
    repName: data.repName,
    repEmail: data.repEmail,
    repPhone: data.repPhone,
    centreEmailKey: data.centreOfficialEmail.trim().toLowerCase(),
    responderEmail: data.responderEmail,
    responderEmailKey: responderKey(data.responderEmail),
    ip: context.ip,
    userAgent: context.userAgent,
  }

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await db.diasporaSubmission.create({
        data: { ...fields, reference: generateReference() },
        select: { id: true, reference: true },
      })
    } catch (error) {
      if (!isReferenceCollision(error) || attempt >= MAX_REFERENCE_ATTEMPTS) throw error
    }
  }
}

export type DiasporaFilters = { q?: string; edition?: string; country?: string }

export function diasporaWhere(filters: DiasporaFilters): Prisma.DiasporaSubmissionWhereInput {
  const q = filters.q?.trim()
  return {
    ...(filters.edition ? { edition: filters.edition } : {}),
    ...(filters.country ? { country: filters.country } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: 'insensitive' } },
            { centreNameAndLocation: { contains: q, mode: 'insensitive' } },
            { centreOfficialEmail: { contains: q, mode: 'insensitive' } },
            { countryPastorName: { contains: q, mode: 'insensitive' } },
            { repName: { contains: q, mode: 'insensitive' } },
            { repEmail: { contains: q, mode: 'insensitive' } },
            { country: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }
}

/**
 * How many responses share each centre email, for the given keys. A count above
 * one is what the admin list flags as a repeat submission.
 */
export async function repeatCounts(centreEmailKeys: string[], edition?: string): Promise<Map<string, number>> {
  if (centreEmailKeys.length === 0) return new Map()
  const groups = await db.diasporaSubmission.groupBy({
    by: ['centreEmailKey'],
    where: { centreEmailKey: { in: [...new Set(centreEmailKeys)] }, ...(edition ? { edition } : {}) },
    _count: { _all: true },
  })
  return new Map(groups.map((g) => [g.centreEmailKey, g._count._all]))
}

/** Editions and countries that actually have responses, for the filter menus. */
export async function diasporaFacets(): Promise<{ editions: string[]; countries: string[] }> {
  const [editions, countries] = await Promise.all([
    db.diasporaSubmission.findMany({ distinct: ['edition'], select: { edition: true }, orderBy: { edition: 'desc' } }),
    db.diasporaSubmission.findMany({ distinct: ['country'], select: { country: true }, orderBy: { country: 'asc' } }),
  ])
  return { editions: editions.map((e) => e.edition), countries: countries.map((c) => c.country) }
}
