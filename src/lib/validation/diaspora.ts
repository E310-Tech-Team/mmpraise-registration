import { z } from 'zod'
import { emailSchema, trimmedText } from './common'

/**
 * The diaspora participation form (diaspora.mmpraise.org).
 *
 * Questions and wording are carried over from the Google Form it replaces, so
 * centres that filled that one in see the same thing. The field schemas below
 * are the single source of validation: the browser checks each answer with
 * them as the person moves through the form, and the server parses the whole
 * submission with the same ones.
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
const optionalText = (max: number) => trimmedText(max).optional()
const requiredEmail = z.string().trim().min(1, REQUIRED).pipe(emailSchema)
const optionalEmail = z.union([z.literal(''), emailSchema]).optional()

/** Free-form international numbers: "+44 7700 900077", "(0)20 7946 0018". */
const PHONE_PATTERN = /^[+(]?[0-9][0-9 ()\-.]{5,28}$/
const PHONE_MESSAGE = 'Enter a phone number, including the country code if you can'
const requiredPhone = trimmedText(30).pipe(z.string().min(1, REQUIRED).regex(PHONE_PATTERN, PHONE_MESSAGE))
const optionalPhone = trimmedText(30)
  .pipe(z.union([z.literal(''), z.string().regex(PHONE_PATTERN, PHONE_MESSAGE)]))
  .optional()

/**
 * One schema per question. `country` is also checked against the active
 * country list on the server — the select offers only real names, but a
 * hand-made request could send anything.
 */
export const DIASPORA_FIELD_SCHEMAS = {
  country: requiredText(80),
  countryPastorName: requiredText(120),
  countryPastorEmail: requiredEmail,
  countryPastorPhone: optionalPhone,
  continentalOverseer: requiredText(120),
  centreNameAndLocation: requiredText(200),
  centreOfficialEmail: requiredEmail,
  picName: optionalText(120),
  picEmail: optionalEmail,
  picPhone: optionalPhone,
  repName: requiredText(120),
  repEmail: requiredEmail,
  repPhone: requiredPhone,
} as const

export type DiasporaField = keyof typeof DIASPORA_FIELD_SCHEMAS
export type DiasporaAnswers = Partial<Record<DiasporaField, string>>

export const diasporaSchema = z.object({
  ...DIASPORA_FIELD_SCHEMAS,
  /** Honeypot: hidden from people, filled in by bots. */
  website: z.string().optional(),
})

export type DiasporaSubmissionInput = z.infer<typeof diasporaSchema>

export type DiasporaQuestion = {
  id: DiasporaField
  section: 'Country & oversight' | 'Participating centre' | 'MMPraise representative'
  label: string
  type: 'text' | 'email' | 'tel' | 'country'
  required: boolean
  placeholder: string
  hint?: string
  autoComplete?: string
}

export const DIASPORA_QUESTIONS: readonly DiasporaQuestion[] = [
  {
    id: 'country',
    section: 'Country & oversight',
    label: 'Name of country',
    type: 'country',
    required: true,
    placeholder: 'Select a country',
    autoComplete: 'country-name',
  },
  {
    id: 'countryPastorName',
    section: 'Country & oversight',
    label: 'Name of country pastor',
    type: 'text',
    required: true,
    placeholder: 'Full name',
  },
  {
    id: 'countryPastorEmail',
    section: 'Country & oversight',
    label: 'Email address of country pastor',
    type: 'email',
    required: true,
    placeholder: 'pastor@example.org',
  },
  {
    id: 'countryPastorPhone',
    section: 'Country & oversight',
    label: 'Phone number of country pastor',
    type: 'tel',
    required: false,
    placeholder: '+44 7700 900077',
    hint: 'Include the country code if you can',
  },
  {
    id: 'continentalOverseer',
    section: 'Country & oversight',
    label: 'Name of continental overseer',
    type: 'text',
    required: true,
    placeholder: 'Full name',
  },
  {
    id: 'centreNameAndLocation',
    section: 'Participating centre',
    label: 'Name and location of participating centre',
    type: 'text',
    required: true,
    placeholder: 'e.g. RCCG City of Grace, Manchester',
  },
  {
    id: 'centreOfficialEmail',
    section: 'Participating centre',
    label: 'Official email address of participating centre',
    type: 'email',
    required: true,
    placeholder: 'centre@example.org',
  },
  {
    id: 'picName',
    section: 'Participating centre',
    label: 'Name of the Pastor in Charge (PIC) of the participating centre',
    type: 'text',
    required: false,
    placeholder: 'Full name',
  },
  {
    id: 'picEmail',
    section: 'Participating centre',
    label: 'Email address of the PIC of the participating centre',
    type: 'email',
    required: false,
    placeholder: 'pic@example.org',
  },
  {
    id: 'picPhone',
    section: 'Participating centre',
    label: 'Phone number of the PIC of the participating centre',
    type: 'tel',
    required: false,
    placeholder: '+44 7700 900077',
    hint: 'Include the country code if you can',
  },
  {
    id: 'repName',
    section: 'MMPraise representative',
    label: 'Name of the MMPraise representative for the participating centre',
    type: 'text',
    required: true,
    placeholder: 'Full name',
  },
  {
    id: 'repEmail',
    section: 'MMPraise representative',
    label: 'Email of the MMPraise representative for the participating centre',
    type: 'email',
    required: true,
    placeholder: 'representative@example.org',
  },
  {
    id: 'repPhone',
    section: 'MMPraise representative',
    label: 'Phone number of the MMPraise representative for the participating centre',
    type: 'tel',
    required: true,
    placeholder: '+44 7700 900077',
    hint: 'Include the country code — it is used for WhatsApp coordination',
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
