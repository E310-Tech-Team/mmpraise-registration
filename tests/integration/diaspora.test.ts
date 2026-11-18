import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { hasTestDatabase, migrateTestDatabase, testDb } from '../helpers/db'
import { createDiasporaSubmission, diasporaWhere, repeatCounts } from '@/lib/diaspora/service'
import { diasporaSchema } from '@/lib/validation/diaspora'

/**
 * Diaspora responses against a real PostgreSQL database: the migration, the
 * receipt reference, and the repeat-submission grouping the admin list shows.
 */
const describeDb = hasTestDatabase ? describe : describe.skip

const answers = (centreEmail: string, centre = 'RCCG City of Grace, Manchester') =>
  diasporaSchema.omit({ website: true }).parse({
    country: 'United Kingdom',
    countryPastorName: 'Pastor Ade Johnson',
    countryPastorEmail: 'pastor@example.org',
    continentalOverseer: 'Pastor Femi Ola',
    centreNameAndLocation: centre,
    centreOfficialEmail: centreEmail,
    repName: 'Grace Adeyemi',
    repEmail: 'grace@example.org',
    repPhone: '+44 7700 900077',
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

  it('stores a response with a unique receipt reference and blank optionals as null', async () => {
    const created = await createDiasporaSubmission(answers('centre@example.org'), context)
    expect(created.reference).toMatch(/^DSP-[A-Z0-9]{6}$/)

    const row = await db.diasporaSubmission.findUniqueOrThrow({ where: { id: created.id } })
    expect(row).toMatchObject({ edition: '2027', country: 'United Kingdom', picName: null, picEmail: null })
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
