import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'
import { can, effectivePermissions } from '@/lib/auth/rbac'
import { generateReference } from '@/lib/diaspora/service'
import { diasporaConfirmationEmail } from '@/lib/mail/templates'
import {
  DIASPORA_QUESTIONS,
  diasporaSchema,
  firstInvalidQuestion,
  flagEmoji,
  joinWhatsApp,
  validateDiasporaAnswer,
  type DiasporaAnswers,
} from '@/lib/validation/diaspora'
import { sessionUser } from '../helpers/session'

/** A complete, valid response — each test changes only what it is about. */
const complete: Required<DiasporaAnswers> = {
  country: 'United Kingdom',
  countryPastorName: 'Pastor (Dr.) Ade Johnson',
  countryPastorEmail: 'Pastor@Example.org',
  countryPastorPhone: '+44 7700900077',
  continentalOverseer: 'Pastor Femi Ola',
  centreNameAndLocation: 'RCCG City of Grace, Manchester',
  centreOfficialEmail: 'centre@example.org',
  picName: 'Pastor Tunde Bello',
  picEmail: 'pic@example.org',
  picPhone: '+44 7700900078',
  repName: 'Grace Adeyemi',
  repEmail: 'grace@example.org',
  repPhone: '+44 7700900079',
  responderEmail: 'Responder@Example.org',
}

describe('diaspora form validation', () => {
  it('accepts a complete response and normalises emails and WhatsApp numbers', () => {
    const parsed = diasporaSchema.safeParse(complete)
    expect(parsed.success).toBe(true)
    expect(parsed.data?.countryPastorEmail).toBe('pastor@example.org')
    expect(parsed.data?.responderEmail).toBe('responder@example.org')
    expect(parsed.data?.repPhone).toBe('+447700900079')
  })

  it('requires every question, including the ones that used to be optional', () => {
    for (const question of DIASPORA_QUESTIONS) {
      expect(validateDiasporaAnswer(question.id, ''), question.id).toBe('This field is required')
    }
  })

  it('asks for the responder email last, in its own section', () => {
    const last = DIASPORA_QUESTIONS[DIASPORA_QUESTIONS.length - 1]
    expect(last?.id).toBe('responderEmail')
    expect(last?.section).toBe('Your Details')
  })

  it('labels every question in Title Case', () => {
    const small = new Set(['of', 'the', 'and', 'for', 'in'])
    for (const question of DIASPORA_QUESTIONS) {
      for (const word of question.label.replace(/[()]/g, '').split(' ')) {
        if (small.has(word)) continue
        expect(word[0], `${question.id}: ${word}`).toBe(word[0]?.toUpperCase())
      }
    }
  })

  it('tells people every number is a WhatsApp number', () => {
    for (const question of DIASPORA_QUESTIONS.filter((q) => q.type === 'whatsapp')) {
      expect(question.label, question.id).toContain('WhatsApp')
      expect(question.hint, question.id).toMatch(/WhatsApp/)
    }
  })

  it('accepts international WhatsApp numbers and refuses ones without a country code', () => {
    for (const phone of ['+44 7700 900077', '+1-202-555-0143', '+234 803 123 4567']) {
      expect(validateDiasporaAnswer('repPhone', phone), phone).toBeNull()
    }
    for (const phone of ['07700900077', 'call me', '+44 12']) {
      expect(validateDiasporaAnswer('repPhone', phone), phone).not.toBeNull()
    }
  })

  it('accepts titles and punctuation in names, unlike the volunteer name rule', () => {
    expect(validateDiasporaAnswer('countryPastorName', 'Pastor (Dr.) Ade Johnson')).toBeNull()
  })

  it('points the person at the first question that still needs an answer', () => {
    expect(firstInvalidQuestion(complete)).toBe(-1)
    expect(DIASPORA_QUESTIONS[firstInvalidQuestion({ ...complete, picEmail: '' })]?.id).toBe('picEmail')
  })

  it('caps free text so one field cannot carry an essay', () => {
    expect(validateDiasporaAnswer('centreNameAndLocation', 'x'.repeat(201))).not.toBeNull()
  })
})

describe('WhatsApp number helpers', () => {
  it('joins the country code and local number, dropping a leading trunk zero', () => {
    expect(joinWhatsApp('44', '07700 900077')).toBe('+44 7700900077')
    expect(joinWhatsApp('234', '803-123-4567')).toBe('+234 8031234567')
    expect(joinWhatsApp('44', '')).toBe('')
  })

  it('turns a country code into its flag, and ignores nonsense', () => {
    expect(flagEmoji('GB')).toBe('🇬🇧')
    expect(flagEmoji('ng')).toBe('🇳🇬')
    expect(flagEmoji('')).toBe('')
    expect(flagEmoji('GBR')).toBe('')
  })
})

describe('diasporaConfirmationEmail', () => {
  it('sends the responder their answers and reference, escaped', () => {
    const email = diasporaConfirmationEmail({
      reference: 'DSP-ABC234',
      answers: [{ label: 'Name of Country', value: '<b>United Kingdom</b>' }],
    })
    expect(email.subject).toContain('DSP-ABC234')
    expect(email.text).toContain('Name of Country: <b>United Kingdom</b>')
    expect(email.html).not.toContain('<b>United Kingdom</b>')
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
