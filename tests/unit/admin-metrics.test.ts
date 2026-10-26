import { describe, expect, it } from 'vitest'
import { lagosDayEnd, lagosDayStart, percent } from '@/lib/admin/metrics'
import { parseStatusFilter } from '@/lib/admin/queries'
import { deriveStage, RESPONSE_STAGES } from '@/lib/admin/participants'

/**
 * The metric layer's pure parts.
 *
 * Each of these guards a way the dashboard could quietly lie: a percentage
 * with a zero denominator, a day boundary in the wrong timezone, a crafted
 * status parameter reaching the database, or a person landing in two response
 * stages at once.
 */

describe('percent', () => {
  it('rounds to whole percent', () => {
    expect(percent(1, 4)).toBe(25)
    expect(percent(2, 3)).toBe(67)
  })

  it('is null — rendered N/A — when the denominator is zero or negative', () => {
    expect(percent(5, 0)).toBeNull()
    expect(percent(0, 0)).toBeNull()
    expect(percent(1, -2)).toBeNull()
  })

  it('handles zero numerators as a real 0, distinct from N/A', () => {
    expect(percent(0, 10)).toBe(0)
  })
})

describe('Lagos day boundaries', () => {
  // WAT is UTC+1 with no DST, so a Lagos day starts at 23:00 UTC the day before.
  it('starts the day at Lagos midnight, expressed as a UTC instant', () => {
    expect(lagosDayStart('2026-10-05').toISOString()).toBe('2026-10-04T23:00:00.000Z')
  })

  it('ends the day just before the next Lagos midnight, inclusively', () => {
    expect(lagosDayEnd('2026-10-05').toISOString()).toBe('2026-10-05T22:59:59.999Z')
  })

  it('brackets exactly one day', () => {
    const start = lagosDayStart('2026-10-05').getTime()
    const end = lagosDayEnd('2026-10-05').getTime()
    expect(end - start).toBe(86_400_000 - 1)
  })
})

describe('parseStatusFilter', () => {
  it('accepts a single status and a comma-separated list', () => {
    expect(parseStatusFilter('APPROVED')).toEqual(['APPROVED'])
    expect(parseStatusFilter('SUBMITTED,UNDER_REVIEW')).toEqual(['SUBMITTED', 'UNDER_REVIEW'])
  })

  it('is case-insensitive, because URLs get hand-edited', () => {
    expect(parseStatusFilter('submitted')).toEqual(['SUBMITTED'])
  })

  it('drops unknown values instead of letting them reach the database', () => {
    // The old code cast the raw string straight into the query; ?status=GARBAGE
    // was a 500. Now it degrades to a wider list.
    expect(parseStatusFilter('GARBAGE')).toEqual([])
    expect(parseStatusFilter('APPROVED,GARBAGE')).toEqual(['APPROVED'])
  })

  it('treats "all" and absence as no filter', () => {
    expect(parseStatusFilter('all')).toEqual([])
    expect(parseStatusFilter(undefined)).toEqual([])
  })
})

describe('deriveStage', () => {
  const FLAGS = ['excluded', 'confirmed', 'started', 'activated', 'invited'] as const

  it('puts every combination of facts in exactly one stage', () => {
    for (let mask = 0; mask < 1 << FLAGS.length; mask += 1) {
      const facts = Object.fromEntries(
        FLAGS.map((flag, index) => [flag, Boolean(mask & (1 << index))]),
      ) as Record<(typeof FLAGS)[number], boolean>
      const stage = deriveStage(facts)
      expect(RESPONSE_STAGES).toContain(stage)
    }
  })

  it('applies the precedence ladder: excluded > confirmed > started > activated > invited', () => {
    expect(
      deriveStage({ excluded: true, confirmed: true, started: true, activated: true, invited: true }),
    ).toBe('excluded')
    expect(
      deriveStage({ excluded: false, confirmed: true, started: true, activated: true, invited: true }),
    ).toBe('confirmed')
    expect(
      deriveStage({ excluded: false, confirmed: false, started: true, activated: true, invited: true }),
    ).toBe('started')
    expect(
      deriveStage({ excluded: false, confirmed: false, started: false, activated: true, invited: true }),
    ).toBe('activated')
    expect(
      deriveStage({ excluded: false, confirmed: false, started: false, activated: false, invited: true }),
    ).toBe('invited')
    expect(
      deriveStage({ excluded: false, confirmed: false, started: false, activated: false, invited: false }),
    ).toBe('not_invited')
  })

  it('keeps a confirmed person confirmed even when they were never invited', () => {
    // The stages are current states, not an ordered funnel: someone can
    // confirm without the system ever having emailed them.
    expect(
      deriveStage({ excluded: false, confirmed: true, started: true, activated: true, invited: false }),
    ).toBe('confirmed')
  })
})
