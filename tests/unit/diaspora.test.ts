import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'
import { can, effectivePermissions } from '@/lib/auth/rbac'
import { generateReference } from '@/lib/diaspora/service'
import {
  DIASPORA_QUESTIONS,
  diasporaSchema,
  firstInvalidQuestion,
  validateDiasporaAnswer,
  type DiasporaAnswers,
} from '@/lib/validation/diaspora'
import { sessionUser } from '../helpers/session'

/** A complete, valid response — each test changes only what it is about. */
const complete: Required<DiasporaAnswers> = {
  country: 'United Kingdom',
  countryPastorName: 'Pastor (Dr.) Ade Johnson',
  countryPastorEmail: 'Pastor@Example.org',
  countryPastorPhone: '',
  continentalOverseer: 'Pastor Femi Ola',
  centreNameAndLocation: 'RCCG City of Grace, Manchester',
  centreOfficialEmail: 'centre@example.org',
  picName: '',
  picEmail: '',
  picPhone: '',
  repName: 'Grace Adeyemi',
  repEmail: 'grace@example.org',
  repPhone: '+44 7700 900077',
}

describe('diaspora form validation', () => {
  it('accepts a complete response with the optional answers left blank', () => {
    const parsed = diasporaSchema.safeParse(complete)
    expect(parsed.success).toBe(true)
    // Emails are normalised the same way as everywhere else in the app.
    expect(parsed.data?.countryPastorEmail).toBe('pastor@example.org')
  })

  it('accepts titles and punctuation in names, unlike the volunteer name rule', () => {
    expect(validateDiasporaAnswer('countryPastorName', 'Pastor (Dr.) Ade Johnson')).toBeNull()
  })

  it('accepts international phone numbers as people actually write them', () => {
    for (const phone of ['+44 7700 900077', '(0)20 7946 0018', '+1-202-555-0143', '07700900077']) {
      expect(validateDiasporaAnswer('repPhone', phone), phone).toBeNull()
    }
    expect(validateDiasporaAnswer('repPhone', 'call me')).not.toBeNull()
  })

  it('requires every question the original form required', () => {
    for (const question of DIASPORA_QUESTIONS) {
      const error = validateDiasporaAnswer(question.id, '')
      if (question.required) expect(error, question.id).toBe('This field is required')
      else expect(error, question.id).toBeNull()
    }
  })

  it('rejects malformed email addresses, including optional ones that are filled in', () => {
    expect(validateDiasporaAnswer('centreOfficialEmail', 'not-an-email')).not.toBeNull()
    expect(validateDiasporaAnswer('picEmail', 'not-an-email')).not.toBeNull()
    expect(validateDiasporaAnswer('picEmail', '')).toBeNull()
  })

  it('points the person at the first question that still needs an answer', () => {
    expect(firstInvalidQuestion(complete)).toBe(-1)
    const missingRep = { ...complete, repName: '' }
    expect(DIASPORA_QUESTIONS[firstInvalidQuestion(missingRep)]?.id).toBe('repName')
  })

  it('caps free text so one field cannot carry an essay', () => {
    expect(validateDiasporaAnswer('centreNameAndLocation', 'x'.repeat(201))).not.toBeNull()
  })
})

describe('diaspora references', () => {
  it('are short, prefixed and free of look-alike characters', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateReference()).toMatch(/^DSP-[2-9A-HJ-KMNP-Z]{6}$/)
    }
  })
})

describe('diaspora:view permission', () => {
  it('belongs to the super administrator by default and to no other role', () => {
    expect(can(sessionUser({ roles: ['SUPER_ADMIN'] }), 'diaspora:view')).toBe(true)
    for (const role of [
      'REGISTRATION_ADMIN',
      'DEPARTMENT_HEAD',
      'REVIEWER',
      'COMMUNICATION_OFFICER',
      'MEDICAL_INFO_OFFICER',
      'VOLUNTEER',
    ] as const) {
      expect(can(sessionUser({ roles: [role] }), 'diaspora:view'), role).toBe(false)
    }
  })

  it('can be granted to an individual administrator', () => {
    const granted = effectivePermissions(['REVIEWER'], [{ permission: 'diaspora:view', granted: true }])
    expect(granted.has('diaspora:view')).toBe(true)
  })
})

describe('diaspora host routing', () => {
  it('serves the form at the root of the diaspora host only', async () => {
    const rewrites = await nextConfig.rewrites!()
    const before = Array.isArray(rewrites) ? rewrites : (rewrites.beforeFiles ?? [])
    const rule = before.find((r) => r.destination === '/diaspora')

    expect(rule?.source).toBe('/')
    const host = rule?.has?.find((h) => h.type === 'host')
    const pattern = new RegExp(`^${host?.value}$`)
    expect(pattern.test('diaspora.mmpraise.org')).toBe(true)
    expect(pattern.test('mmpraise.org')).toBe(false)
    expect(pattern.test('www.mmpraise.org')).toBe(false)
  })

  it('sends other pages on the diaspora host to the main site, but never the form assets', async () => {
    const [rule] = await nextConfig.redirects!()
    expect(rule?.has?.[0]).toMatchObject({ type: 'host' })

    // The capture group of the source, as Next will apply it to the path.
    const group = rule!.source.match(/^\/:path\((.*)\)$/)?.[1]
    const pathPattern = new RegExp(`^${group}$`)
    for (const kept of ['_next/static/chunk.js', 'diaspora', 'landing/global-map.webp', 'logo.png', 'favicon.ico']) {
      expect(pathPattern.test(kept), kept).toBe(false)
    }
    for (const moved of ['login', 'admin', 'apply/personal']) {
      expect(pathPattern.test(moved), moved).toBe(true)
    }
  })
})
