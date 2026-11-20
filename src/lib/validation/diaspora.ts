import { z } from 'zod'
import { emailSchema, trimmedText } from './common'

/**
 * The diaspora participation form (diaspora.mmpraise.org).
 *
 * Questions carry the Title Case wording of the Google Form this replaced, and
 * every one is required. The field schemas below are the single source of
 * validation: the browser checks each answer with them as the person moves
 * through the form, and the server parses the whole submission with the same
 * ones.
 */

export const DIASPORA_META = {
  title: 'MMPraise Global Participation (Diaspora)',
  salutation: 'Dear Highly Esteemed,',
  intro:
    "We appreciate your willingness to be a part of this edition of Marathon Messiah's Praise. Kindly fill the form below to affirm your participation.",
  confirmationMessage: 'Thank you for your time. Your response has been recorded. Blessings!',
} as const

const REQUIRED = 'This field is required'

const requiredText = (max: number) => trimmedText(max).pipe(z.string().min(1, REQUIRED))
const requiredEmail = z.string().trim().min(1, REQUIRED).pipe(emailSchema)

/**
 * WhatsApp numbers, stored in international (E.164) form: "+447700900077".
 * The form builds this from the country-code picker and the local number, so
 * spaces and punctuation typed into the number are tolerated and removed.
 */
export const WHATSAPP_PATTERN = /^\+[1-9]\d{6,14}$/
const requiredWhatsApp = z
  .string()
  .transform((value) => value.replace(/[\s()\-.]/g, ''))
  .pipe(
    z
      .string()
      .min(1, REQUIRED)
      .regex(/^\+?\d*$/, 'Use digits only')
      .regex(WHATSAPP_PATTERN, 'Enter a valid WhatsApp number, with the right country code'),
  )

/**
 * One schema per question. `country` is also checked against the active
 * country list on the server — the select offers only real names, but a
 * hand-made request could send anything.
 */
export const DIASPORA_FIELD_SCHEMAS = {
  country: requiredText(80),
  countryPastorName: requiredText(120),
  countryPastorEmail: requiredEmail,
  countryPastorPhone: requiredWhatsApp,
  continentalOverseer: requiredText(120),
  centreNameAndLocation: requiredText(200),
  centreOfficialEmail: requiredEmail,
  picName: requiredText(120),
  picEmail: requiredEmail,
  picPhone: requiredWhatsApp,
  repName: requiredText(120),
  repEmail: requiredEmail,
  repPhone: requiredWhatsApp,
  responderEmail: requiredEmail,
} as const

export type DiasporaField = keyof typeof DIASPORA_FIELD_SCHEMAS
export type DiasporaAnswers = Partial<Record<DiasporaField, string>>

export const diasporaSchema = z.object({
  ...DIASPORA_FIELD_SCHEMAS,
  /** Honeypot: hidden from people, filled in by bots. */
  website: z.string().optional(),
})

export type DiasporaSubmissionInput = z.infer<typeof diasporaSchema>

export const DIASPORA_SECTIONS = [
  'Country & Oversight',
  'Participating Centre',
  'MMPraise Representative',
  'Your Details',
] as const

export type DiasporaSection = (typeof DIASPORA_SECTIONS)[number]

export type DiasporaQuestion = {
  id: DiasporaField
  section: DiasporaSection
  label: string
  type: 'text' | 'email' | 'whatsapp' | 'country'
  placeholder: string
  hint?: string
  autoComplete?: string
}

const WHATSAPP_HINT = 'Please give a WhatsApp number — updates and coordination happen on WhatsApp.'

export const DIASPORA_QUESTIONS: readonly DiasporaQuestion[] = [
  {
    id: 'country',
    section: 'Country & Oversight',
    label: 'Name of Country',
    type: 'country',
    placeholder: 'Select a country',
    hint: 'This also sets the country code for the WhatsApp numbers that follow.',
    autoComplete: 'country-name',
  },
  {
    id: 'countryPastorName',
    section: 'Country & Oversight',
    label: 'Name of Country Pastor',
    type: 'text',
    placeholder: 'Full name',
  },
  {
    id: 'countryPastorEmail',
    section: 'Country & Oversight',
    label: 'Email Address of Country Pastor',
    type: 'email',
    placeholder: 'pastor@example.org',
  },
  {
    id: 'countryPastorPhone',
    section: 'Country & Oversight',
    label: 'WhatsApp Number of Country Pastor',
    type: 'whatsapp',
    placeholder: '7700 900077',
    hint: WHATSAPP_HINT,
  },
  {
    id: 'continentalOverseer',
    section: 'Country & Oversight',
    label: 'Name of Continental Overseer',
    type: 'text',
    placeholder: 'Full name',
  },
  {
    id: 'centreNameAndLocation',
    section: 'Participating Centre',
    label: 'Name and Location of Participating Centre',
    type: 'text',
    placeholder: 'e.g. RCCG City of Grace, Manchester',
  },
  {
    id: 'centreOfficialEmail',
    section: 'Participating Centre',
    label: 'Official Email Address of Participating Centre',
    type: 'email',
    placeholder: 'centre@example.org',
  },
  {
    id: 'picName',
    section: 'Participating Centre',
    label: 'Name of the Pastor in Charge (PIC) of Participating Centre',
    type: 'text',
    placeholder: 'Full name',
  },
  {
    id: 'picEmail',
    section: 'Participating Centre',
    label: 'Email Address of the PIC of Participating Centre',
    type: 'email',
    placeholder: 'pic@example.org',
  },
  {
    id: 'picPhone',
    section: 'Participating Centre',
    label: 'WhatsApp Number of the PIC of Participating Centre',
    type: 'whatsapp',
    placeholder: '7700 900077',
    hint: WHATSAPP_HINT,
  },
  {
    id: 'repName',
    section: 'MMPraise Representative',
    label: 'Name of MMPraise Representative for Participating Centre',
    type: 'text',
    placeholder: 'Full name',
  },
  {
    id: 'repEmail',
    section: 'MMPraise Representative',
    label: 'Email Address of MMPraise Representative for Participating Centre',
    type: 'email',
    placeholder: 'representative@example.org',
  },
  {
    id: 'repPhone',
    section: 'MMPraise Representative',
    label: 'WhatsApp Number of MMPraise Representative for Participating Centre',
    type: 'whatsapp',
    placeholder: '7700 900077',
    hint: WHATSAPP_HINT,
  },
  {
    id: 'responderEmail',
    section: 'Your Details',
    label: 'Your Email Address',
    type: 'email',
    placeholder: 'you@example.org',
    hint: 'We will email you a copy of this response. Each email address can submit one response.',
    autoComplete: 'email',
  },
]

/** First error for one answer, or null — what the browser shows under the field. */
export function validateDiasporaAnswer(field: DiasporaField, value: string | undefined): string | null {
  const result = DIASPORA_FIELD_SCHEMAS[field].safeParse(value ?? '')
  return result.success ? null : (result.error.issues[0]?.message ?? 'Check this answer')
}

/** Index of the first question not yet answered acceptably, or -1 when all are. */
export function firstInvalidQuestion(answers: DiasporaAnswers): number {
  return DIASPORA_QUESTIONS.findIndex((q) => validateDiasporaAnswer(q.id, answers[q.id]) !== null)
}

/** "+44 7700900077" — the dial code and the local number, as the form joins them. */
export function joinWhatsApp(dialCode: string, local: string): string {
  const digits = local.replace(/\D/g, '').replace(/^0+/, '')
  if (!digits) return ''
  return dialCode ? `+${dialCode} ${digits}` : digits
}

/** A flag emoji from a two-letter country code ("GB" → 🇬🇧); empty if unknown. */
export function flagEmoji(iso2: string | null | undefined): string {
  if (!iso2 || !/^[A-Za-z]{2}$/.test(iso2)) return ''
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}
