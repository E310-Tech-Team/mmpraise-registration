import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { hasTestDatabase, migrateTestDatabase, testDb } from '../helpers/db'
import {
  createDiasporaSubmission,
  diasporaWhere,
  hasResponded,
  isDuplicateResponder,
  repeatCounts,
} from '@/lib/diaspora/service'
import { diasporaSchema } from '@/lib/validation/diaspora'

/**
 * Diaspora responses against a real PostgreSQL database: the migrations, the
 * receipt reference, repeat-centre grouping, and the one-response-per-responder
 * rule the unique index enforces.
 */
const describeDb = hasTestDatabase ? describe : describe.skip

let responderCount = 0
const answers = (centreEmail: string, centre = 'RCCG City of Grace, Manchester', responderEmail?: string) =>
  diasporaSchema.omit({ website: true }).parse({
    country: 'United Kingdom',
    countryPastorName: 'Pastor Ade Johnson',
    countryPastorEmail: 'pastor@example.org',
    countryPastorPhone: '+44 7700900077',
    continentalOverseer: 'Pastor Femi Ola',
    centreNameAndLocation: centre,
    centreOfficialEmail: centreEmail,
    picName: 'Pastor Tunde Bello',
    picEmail: 'pic@example.org',
    picPhone: '+44 7700900078',
    repName: 'Grace Adeyemi',
    repEmail: 'grace@example.org',
    repPhone: '+44 7700900079',
    responderEmail: responderEmail ?? `responder${(responderCount += 1)}@example.org`,
  })

const context = { edition: '2027', ip: '203.0.113.7', userAgent: 'vitest' }

describeDb('diaspora submissions', () => {
  const db = hasTestDatabase ? testDb() : (null as never)

  beforeAll(() => {
    migrateTestDatabase()
  }, 120_000)

  beforeEach(async () => {
    await db.diasporaSubmission.deleteMany()
  })

  it('stores a response with a receipt reference and the responder email', async () => {
    const created = await createDiasporaSubmission(answers('centre@example.org', undefined, 'Ada@Example.org'), context)
    expect(created.reference).toMatch(/^DSP-[A-Z0-9]{6}$/)

    const row = await db.diasporaSubmission.findUniqueOrThrow({ where: { id: created.id } })
    expect(row).toMatchObject({
      edition: '2027',
      responderEmail: 'ada@example.org',
      responderEmailKey: 'ada@example.org',
      repPhone: '+447700900079',
    })
  })

  it('allows one response per responder email per edition, whatever the case', async () => {
    await createDiasporaSubmission(answers('centre@example.org', undefined, 'ada@example.org'), context)
    expect(await hasResponded('2027', 'ADA@example.org')).toBe(true)
    expect(await hasResponded('2028', 'ada@example.org')).toBe(false)

    const second = await createDiasporaSubmission(
      answers('other@example.org', 'RCCG House of Praise, Leeds', 'Ada@Example.ORG'),
      context,
    ).catch((error: unknown) => error)
    expect(isDuplicateResponder(second)).toBe(true)

    // A new edition is a new response.
    await expect(
      createDiasporaSubmission(answers('centre@example.org', undefined, 'ada@example.org'), { ...context, edition: '2028' }),
    ).resolves.toMatchObject({ reference: expect.stringMatching(/^DSP-/) })
  })

  it('groups repeat submissions by centre email regardless of case', async () => {
    await createDiasporaSubmission(answers('Centre@Example.org'), context)
    await createDiasporaSubmission(answers('centre@example.org', 'RCCG City of Grace, Manchester (corrected)'), context)
    await createDiasporaSubmission(answers('other@example.org', 'RCCG House of Praise, Leeds'), context)

    const counts = await repeatCounts(['centre@example.org', 'other@example.org'], '2027')
    expect(counts.get('centre@example.org')).toBe(2)
    expect(counts.get('other@example.org')).toBe(1)
  })

  it('finds responses by centre, email or reference, ignoring case', async () => {
    const leeds = await createDiasporaSubmission(answers('leeds@example.org', 'RCCG House of Praise, Leeds'), context)
    await createDiasporaSubmission(answers('centre@example.org'), context)

    for (const q of ['house of praise', 'LEEDS@example', leeds.reference.toLowerCase()]) {
      const found = await db.diasporaSubmission.findMany({ where: diasporaWhere({ q }) })
      expect(found.map((row) => row.id), q).toEqual([leeds.id])
    }
  })
})
