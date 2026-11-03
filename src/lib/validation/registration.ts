import { z } from 'zod'
import { emailSchema, multilineText, nameSchema, phoneSchema, trimmedText } from './common'

/**
 * Per-step schemas for the registration wizard.
 *
 * Each step validates independently so a volunteer can move forward without the
 * later steps being complete, and the same schema runs again on the server when
 * the step is saved and once more when the application is submitted.
 */

export const GENDERS = ['MALE', 'FEMALE'] as const

export const AGE_RANGES = [
  { value: 'AGE_00_15', label: '00–15' },
  { value: 'AGE_16_20', label: '16–20' },
  { value: 'AGE_21_25', label: '21–25' },
  { value: 'AGE_26_30', label: '26–30' },
  { value: 'AGE_31_35', label: '31–35' },
  { value: 'AGE_36_40', label: '36–40' },
  { value: 'AGE_41_45', label: '41–45' },
  { value: 'AGE_46_50', label: '46–50' },
  { value: 'AGE_51_PLUS', label: '51 and above' },
] as const

export const AGE_RANGE_VALUES = AGE_RANGES.map((a) => a.value) as unknown as [string, ...string[]]

/** Bands where the applicant is definitely under 18. */
export const ALWAYS_MINOR_RANGES = ['AGE_00_15']
/** Bands that straddle 18, where we must ask. */
export const ASK_IF_MINOR_RANGES = ['AGE_16_20']

export const DENOMINATIONS = [
  { value: 'RCCG', label: 'RCCG' },
  { value: 'OTHER_CHRISTIAN', label: 'Other Christian denomination' },
  { value: 'NON_CHRISTIAN', label: 'Non-Christian' },
] as const

export const SHIFT_PERIODS = [
  { value: 'MORNING', label: 'Morning', hint: '06:00 – 12:00' },
  { value: 'AFTERNOON', label: 'Afternoon', hint: '12:00 – 18:00' },
  { value: 'EVENING', label: 'Evening', hint: '18:00 – 00:00' },
  { value: 'OVERNIGHT', label: 'Overnight', hint: '00:00 – 06:00' },
] as const

// --- Step 1: personal, location & professional ----------------------------

export const personalSchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    gender: z.enum(GENDERS, { message: 'Select your gender' }),
    email: emailSchema,
    phoneDialCode: z.string().min(1, 'Select a country code'),
    phoneLocal: z
      .string()
      .transform((v) => v.replace(/\D/g, ''))
      .pipe(z.string().min(6, 'Enter your phone number').max(15, 'That number looks too long')),
    phone: phoneSchema,
    ageRange: z.enum(AGE_RANGE_VALUES, { message: 'Select your age range' }),
    isMinor: z.boolean().nullable().default(null),
    photoDocumentId: z.string().nullable().optional(),
    guardianName: z.string().optional().nullable(),
    guardianPhone: z.string().optional().nullable(),
    guardianConsent: z.boolean().default(false),

    // Location fields (merged into Step 1)
    countryId: z.string().min(1, 'Select your country'),
    countryHasStates: z.boolean().default(false),
    stateId: z.string().nullable().optional(),
    stateNameOther: z.string().optional().nullable(),
    city: trimmedText(80).pipe(z.string().min(2, 'Enter your city or town')),
    addressLine: z.string().optional().nullable(),

    // Professional & educational fields (merged into Step 1)
    occupation: z.string().min(1, 'Select your occupation'),
    occupationOther: z.string().optional().nullable(),
    education: z.string().min(1, 'Select your highest qualification'),
    educationOther: z.string().optional().nullable(),

    // Emergency contact fields (moved to Step 1, without country code)
    emergencyName: nameSchema,
    emergencyRelationship: trimmedText(60).pipe(z.string().min(2, 'Enter the relationship')),
    emergencyPhone: z.string().min(5, 'Enter emergency contact phone number'),
  })
  .superRefine((data, ctx) => {
    const minor = ALWAYS_MINOR_RANGES.includes(data.ageRange) || data.isMinor === true

    if (ASK_IF_MINOR_RANGES.includes(data.ageRange) && data.isMinor === null) {
      ctx.addIssue({ code: 'custom', path: ['isMinor'], message: 'Tell us whether you are under 18' })
    }

    if (minor) {
      if (!data.guardianName || data.guardianName.trim().length < 2) {
        ctx.addIssue({ code: 'custom', path: ['guardianName'], message: "Enter your parent or guardian's full name" })
      }
      if (!data.guardianPhone || !/^\+[1-9]\d{7,14}$/.test(data.guardianPhone.replace(/[\s()-]/g, ''))) {
        ctx.addIssue({ code: 'custom', path: ['guardianPhone'], message: "Enter your parent or guardian's phone number" })
      }
      if (!data.guardianConsent) {
        ctx.addIssue({ code: 'custom', path: ['guardianConsent'], message: 'Parental or guardian consent is required for volunteers under 18' })
      }
    }

    if (data.countryHasStates) {
      if (!data.stateId) {
        ctx.addIssue({ code: 'custom', path: ['stateId'], message: 'Select your state or province' })
      }
    } else if (!data.stateNameOther || data.stateNameOther.trim().length < 2) {
      ctx.addIssue({ code: 'custom', path: ['stateNameOther'], message: 'Enter your state, province or region' })
    }

    if (data.addressLine && data.addressLine.length > 200) {
      ctx.addIssue({ code: 'custom', path: ['addressLine'], message: 'Must be 200 characters or fewer' })
    }

    if (data.occupation === 'other' && !data.occupationOther?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['occupationOther'], message: 'Please specify your occupation' })
    }
    if (data.education === 'other' && !data.educationOther?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['educationOther'], message: 'Please specify your qualification' })
    }
  })

// Standalone location and professional schemas retained for legacy helpers
export const locationSchema = z
  .object({
    countryId: z.string().min(1, 'Select your country'),
    countryHasStates: z.boolean().default(false),
    stateId: z.string().nullable().optional(),
    stateNameOther: z.string().optional().nullable(),
    city: trimmedText(80).pipe(z.string().min(2, 'Enter your city or town')),
    addressLine: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.countryHasStates) {
      if (!data.stateId) {
        ctx.addIssue({ code: 'custom', path: ['stateId'], message: 'Select your state or province' })
      }
    } else if (!data.stateNameOther || data.stateNameOther.trim().length < 2) {
      ctx.addIssue({ code: 'custom', path: ['stateNameOther'], message: 'Enter your state, province or region' })
    }
    if (data.addressLine && data.addressLine.length > 200) {
      ctx.addIssue({ code: 'custom', path: ['addressLine'], message: 'Must be 200 characters or fewer' })
    }
  })

export const professionalSchema = z
  .object({
    occupation: z.string().min(1, 'Select your occupation'),
    occupationOther: z.string().optional().nullable(),
    education: z.string().min(1, 'Select your highest qualification'),
    educationOther: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.occupation === 'other' && !data.occupationOther?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['occupationOther'], message: 'Please specify your occupation' })
    }
    if (data.education === 'other' && !data.educationOther?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['educationOther'], message: 'Please specify your qualification' })
    }
  })

// --- Step 2: church (optional parish removed) -----------------------------

export const churchSchema = z
  .object({
    denomination: z.enum(['RCCG', 'OTHER_CHRISTIAN', 'NON_CHRISTIAN'], { message: 'Select an option' }),
    churchRegionId: z.string().nullable().optional(),
    churchProvinceId: z.string().nullable().optional(),
    parishId: z.string().nullable().optional(),
    churchName: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.denomination === 'RCCG') {
      if (!data.churchRegionId) {
        ctx.addIssue({ code: 'custom', path: ['churchRegionId'], message: 'Select your RCCG region' })
      }
      if (!data.churchProvinceId) {
        ctx.addIssue({ code: 'custom', path: ['churchProvinceId'], message: 'Select your RCCG province' })
      }
    }

    if (data.denomination === 'OTHER_CHRISTIAN' && !data.churchName?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['churchName'], message: 'Enter the name of your church' })
    }
  })

// --- Step 3: department (merged with motivation) --------------------------

export const departmentSchema = z
  .object({
    departmentId: z.string().min(1, 'Select the department you would like to serve in'),
    discoverySource: z.string().min(1, 'Tell us how you heard about MMPraise volunteering'),
    discoveryOther: z.string().optional().nullable(),
    whyVolunteer: multilineText(1000).pipe(z.string().min(10, 'Please tell us a little more (at least 10 characters)')),
    skillsExperience: z.string().optional().nullable(),
    additionalInfo: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.discoverySource === 'other' && !data.discoveryOther?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['discoveryOther'], message: 'Please tell us where you heard about us' })
    }
    if ((data.skillsExperience?.length ?? 0) > 1000) {
      ctx.addIssue({ code: 'custom', path: ['skillsExperience'], message: 'Must be 1000 characters or fewer' })
    }
    if ((data.additionalInfo?.length ?? 0) > 1000) {
      ctx.addIssue({ code: 'custom', path: ['additionalInfo'], message: 'Must be 1000 characters or fewer' })
    }
  })

export const discoverySchema = z
  .object({
    discoverySource: z.string().min(1, 'Tell us how you heard about MMPraise volunteering'),
    discoveryOther: z.string().optional().nullable(),
    whyVolunteer: multilineText(1000).pipe(z.string().min(10, 'Please tell us a little more (at least 10 characters)')),
    skillsExperience: z.string().optional().nullable(),
    additionalInfo: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.discoverySource === 'other' && !data.discoveryOther?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['discoveryOther'], message: 'Please tell us where you heard about us' })
    }
    if ((data.skillsExperience?.length ?? 0) > 1000) {
      ctx.addIssue({ code: 'custom', path: ['skillsExperience'], message: 'Must be 1000 characters or fewer' })
    }
    if ((data.additionalInfo?.length ?? 0) > 1000) {
      ctx.addIssue({ code: 'custom', path: ['additionalInfo'], message: 'Must be 1000 characters or fewer' })
    }
  })

// --- Step 4: availability (last step before review) -----------------------

export const availabilitySchema = z.object({
  availableForThisYear: z.enum(['YES', 'NO'], { message: "Please confirm whether you will be available for this year's edition" }),
})

// --- Step 5: consent & submit (consents 2 & 3 merged) ---------------------

export const consentSchema = z
  .object({
    consentAccurate: z.literal(true, { message: 'Please confirm your information is accurate' }),
    consentTermsAndProcessing: z.literal(true, {
      message: 'Please accept the volunteer terms and data processing consent',
    }),
    consentCommunication: z.literal(true, { message: 'Please consent to registration communication' }),
    consentTerms: z.boolean().optional(),
    consentDataProcessing: z.boolean().optional(),
  })

export type PersonalInput = z.input<typeof personalSchema>
export type LocationInput = z.input<typeof locationSchema>
export type ProfessionalInput = z.input<typeof professionalSchema>
export type ChurchInput = z.input<typeof churchSchema>
export type DepartmentInput = z.input<typeof departmentSchema>
export type AvailabilityInput = z.input<typeof availabilitySchema>
export type DiscoveryInput = z.input<typeof discoverySchema>
export type ConsentInput = z.input<typeof consentSchema>

// --- Wizard step registry -------------------------------------------------

export const WIZARD_STEPS = [
  { slug: 'personal', number: 1, title: 'Personal & Profile', description: 'Personal, location & profession' },
  { slug: 'church', number: 2, title: 'Church', description: 'Your church background' },
  { slug: 'department', number: 3, title: 'Department', description: 'Where and why you want to serve' },
  { slug: 'availability', number: 4, title: 'Availability', description: 'Confirm your availability' },
  { slug: 'review', number: 5, title: 'Review', description: 'Check and submit' },
] as const

export type WizardStepSlug =
  | (typeof WIZARD_STEPS)[number]['slug']
  | 'location'
  | 'professional'
  | 'motivation'

export const STEP_SLUGS = WIZARD_STEPS.map((s) => s.slug) as unknown as [WizardStepSlug, ...WizardStepSlug[]]

export function stepBySlug(slug: string) {
  return WIZARD_STEPS.find((s) => s.slug === slug)
}

export function stepByNumber(number: number) {
  return WIZARD_STEPS.find((s) => s.number === number) ?? WIZARD_STEPS[0]
}

// --- Form value types -----------------------------------------------------

export type PersonalFormValues = {
  firstName: string
  lastName: string
  gender: string
  email: string
  phoneDialCode: string
  phoneLocal: string
  phone: string
  ageRange: string
  isMinor: boolean | null
  photoDocumentId: string | null
  guardianName: string
  guardianPhone: string
  guardianConsent: boolean

  // Location fields
  countryId: string
  countryHasStates: boolean
  stateId: string | null
  stateNameOther: string
  city: string
  addressLine: string

  // Professional fields
  occupation: string
  occupationOther: string
  education: string
  educationOther: string

  // Emergency contact fields (without country code)
  emergencyName: string
  emergencyRelationship: string
  emergencyPhone: string
}

export type LocationFormValues = {
  countryId: string
  countryHasStates: boolean
  stateId: string | null
  stateNameOther: string
  city: string
  addressLine: string
}

export type ProfessionalFormValues = {
  occupation: string
  occupationOther: string
  education: string
  educationOther: string
}

export type ChurchFormValues = {
  denomination: string
  churchRegionId: string | null
  churchProvinceId: string | null
  parishId: string | null
  parishNameOther?: string
  churchName: string
}

export type DepartmentFormValues = {
  departmentId: string
  discoverySource: string
  discoveryOther: string
  whyVolunteer: string
  skillsExperience: string
  additionalInfo: string
}

export type AvailabilityFormValues = {
  availableForThisYear: 'YES' | 'NO' | ''
  availableDates?: string[]
  preferredPeriods?: string[]
  availableOvernight?: boolean | null
  emergencyName?: string
  emergencyRelationship?: string
  emergencyPhone?: string
  hasMedicalCondition?: boolean | null
  medicalDetails?: string
}

export type MotivationFormValues = {
  discoverySource: string
  discoveryOther: string
  whyVolunteer: string
  skillsExperience: string
  additionalInfo: string
}
