'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { isUniqueViolation } from '@/lib/db-errors'
import type { AgeRange, Denomination, Gender } from '@/generated/prisma/enums'
import { env } from '@/lib/env'
import { audit } from '@/lib/audit'
import { recordProfileReviewed } from '@/lib/migration/activity'
import { requireUser } from '@/lib/auth/rbac'
import { headers } from 'next/headers'
import { clientIp } from '@/lib/auth/session'
import { fail, ok, parseOrFail, type ActionResult, type FieldErrors } from '@/lib/actions/result'
import { storeUpload } from '@/lib/files'
import { getDepartmentQuestions } from '@/lib/reference'
import { sendMailSafely } from '@/lib/mail/mailer'
import { submissionEmail } from '@/lib/mail/templates'
import { getSettings } from '@/lib/settings'
import {
  availabilitySchema,
  churchSchema,
  consentSchema,
  departmentSchema,
  discoverySchema,
  locationSchema,
  personalSchema,
  professionalSchema,
  stepBySlug,
  type WizardStepSlug,
} from '@/lib/validation/registration'
import { validateAnswers, type AnswerMap } from '@/lib/questions/engine'
import {
  getOrCreateDraft,
  getOrCreateParticipation,
  loadWizardState,
  nextRegistrationId,
  persistAnswers,
  saveDraftData,
} from '@/lib/applications/service'
import { formatDate } from '@/lib/utils'

/**
 * Registration wizard Server Actions.
 *
 * Every step is validated here with the same Zod schema the browser used — the
 * client-side check is only there to give fast feedback.
 */

const PHONE_TAKEN = 'This phone number is already registered to another volunteer'

/** Guard: only a DRAFT application may be edited through the wizard. */
async function requireEditableApplication() {
  const user = await requireUser()
  const application = await getOrCreateDraft(user.id)
  return { user, application }
}

// --- Autosave -------------------------------------------------------------

export async function autosaveStepAction(step: WizardStepSlug, values: unknown): Promise<ActionResult> {
  const { application } = await requireEditableApplication()
  if (application.status !== 'DRAFT') return ok()
  if (!stepBySlug(step)) return fail('Unknown step')

  await saveDraftData(application.id, step, values)
  return ok()
}

// --- Step saves -----------------------------------------------------------

export async function savePersonalAction(values: unknown): Promise<ActionResult> {
  const { user, application } = await requireEditableApplication()
  const parsed = parseOrFail(personalSchema, values)
  if (!parsed.ok) return parsed.result
  const data = parsed.data

  // The account email can be changed here; it must stay unique and re-verified.
  if (data.email !== user.email) {
    const taken = await db.user.findUnique({ where: { email: data.email }, select: { id: true } })
    if (taken && taken.id !== user.id) {
      return fail('That email address is already registered', {
        email: 'That email address is already registered to another volunteer',
      })
    }
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          phone: data.phone,
          ...(data.email !== user.email ? { email: data.email, emailVerifiedAt: null } : {}),
        },
      })

      await tx.volunteerProfile.upsert({
        where: { userId: user.id },
        update: {
          firstName: data.firstName,
          lastName: data.lastName,
          gender: data.gender as Gender,
          ageRange: data.ageRange as AgeRange,
          phone: data.phone,
          phoneCountry: data.phoneDialCode,
          isMinor: data.isMinor,
          guardianName: data.guardianName ?? null,
          guardianPhone: data.guardianPhone ?? null,
          guardianConsent: data.guardianConsent,
          photoDocumentId: data.photoDocumentId ?? null,
        },
        create: {
          // Prisma requires the relation, not the raw foreign key, when
          // creating a record whose owner is mandatory.
          user: { connect: { id: user.id } },
          firstName: data.firstName,
          lastName: data.lastName,
          gender: data.gender as Gender,
          ageRange: data.ageRange as AgeRange,
          phone: data.phone,
          phoneCountry: data.phoneDialCode,
          isMinor: data.isMinor,
          guardianName: data.guardianName ?? null,
          guardianPhone: data.guardianPhone ?? null,
          guardianConsent: data.guardianConsent,
          // Relation fields must be connected, not set by foreign key, in a
          // checked create input.
          photo: data.photoDocumentId ? { connect: { id: data.photoDocumentId } } : undefined,
        },
      })
    })
  } catch (error) {
    if (isUniqueViolation(error, 'phone')) {
      return fail(PHONE_TAKEN, { phoneLocal: PHONE_TAKEN })
    }
    throw error
  }

  await advance(application.id, 1)
  return ok()
}

export async function saveLocationAction(values: unknown): Promise<ActionResult> {
  const { user, application } = await requireEditableApplication()
  const parsed = parseOrFail(locationSchema, values)
  if (!parsed.ok) return parsed.result
  const data = parsed.data

  // Never trust the client's claim about whether a country has states.
  const country = await db.country.findUnique({ where: { id: data.countryId }, select: { id: true, hasStates: true } })
  if (!country) return fail('Select a valid country', { countryId: 'Select a valid country' })

  if (country.hasStates && data.stateId) {
    const state = await db.state.findFirst({ where: { id: data.stateId, countryId: country.id }, select: { id: true } })
    if (!state) return fail('Select a valid state', { stateId: 'Select a state that belongs to your country' })
  }

  if (country.hasStates && !data.stateId) {
    return fail('Select your state or province', { stateId: 'Select your state or province' })
  }

  await db.volunteerProfile.update({
    where: { userId: user.id },
    data: {
      countryId: country.id,
      stateId: country.hasStates ? data.stateId : null,
      stateNameOther: country.hasStates ? null : (data.stateNameOther ?? null),
      city: data.city,
      addressLine: data.addressLine ?? null,
    },
  })

  await advance(application.id, 2)
  return ok()
}

export async function saveProfessionalAction(values: unknown): Promise<ActionResult> {
  const { user, application } = await requireEditableApplication()
  const parsed = parseOrFail(professionalSchema, values)
  if (!parsed.ok) return parsed.result
  const data = parsed.data

  await db.volunteerProfile.update({
    where: { userId: user.id },
    data: {
      occupation: data.occupation,
      occupationOther: data.occupation === 'other' ? (data.occupationOther ?? null) : null,
      education: data.education,
      educationOther: data.education === 'other' ? (data.educationOther ?? null) : null,
    },
  })

  await advance(application.id, 3)
  return ok()
}

export async function saveChurchAction(values: unknown): Promise<ActionResult> {
  const { user, application } = await requireEditableApplication()
  const parsed = parseOrFail(churchSchema, values)
  if (!parsed.ok) return parsed.result
  const data = parsed.data
  const isRccg = data.denomination === 'RCCG'

  if (isRccg && data.churchProvinceId) {
    const province = await db.churchProvince.findFirst({
      where: { id: data.churchProvinceId, regionId: data.churchRegionId ?? undefined },
      select: { id: true },
    })
    if (!province) {
      return fail('Select a valid province', { churchProvinceId: 'Select a province that belongs to your region' })
    }
  }

  await db.volunteerProfile.update({
    where: { userId: user.id },
    data: {
      denomination: data.denomination as Denomination,
      churchRegionId: isRccg ? (data.churchRegionId ?? null) : null,
      churchProvinceId: isRccg ? (data.churchProvinceId ?? null) : null,
      parishId: isRccg ? (data.parishId ?? null) : null,
      parishNameOther: isRccg ? (data.parishNameOther ?? null) : null,
      // Non-Christian applicants are not asked for a church name at all.
      churchName: data.denomination === 'OTHER_CHRISTIAN' ? (data.churchName ?? null) : null,
    },
  })

  await advance(application.id, 4)
  return ok()
}

export async function saveDepartmentAction(values: unknown, answers: AnswerMap): Promise<ActionResult> {
  const { application } = await requireEditableApplication()
  const parsed = parseOrFail(departmentSchema, values)
  if (!parsed.ok) return parsed.result

  const department = await db.department.findFirst({
    where: { id: parsed.data.departmentId, isActive: true },
    select: { id: true, name: true },
  })
  if (!department) return fail('Select a valid department', { departmentId: 'Select a valid department' })

  /*
   * No capacity check.
   *
   * There is no fixed limit on the number of volunteers a department needs, so
   * nothing here may refuse an application because a count has been reached.
   * This used to turn people away with "{Department} has reached its volunteer
   * capacity" — a rule the organisation does not have.
   */

  const questions = await getDepartmentQuestions(department.id)
  const answerErrors = validateAnswers(questions, answers)
  if (Object.keys(answerErrors).length > 0) {
    const fieldErrors: FieldErrors = {}
    for (const [key, message] of Object.entries(answerErrors)) fieldErrors[`answers.${key}`] = message
    return fail('Please answer the department questions', fieldErrors)
  }

  // The department is a choice for *this* edition; a volunteer may serve
  // somewhere else next time without disturbing what they did before.
  const participation = await getOrCreateParticipation(application.id)
  await db.editionParticipation.update({
    where: { id: participation.id },
    data: { departmentId: department.id },
  })
  await persistAnswers(participation.id, questions, answers)
  await advance(application.id, 5)
  return ok()
}

export async function saveAvailabilityAction(values: unknown): Promise<ActionResult> {
  const { application } = await requireEditableApplication()
  const parsed = parseOrFail(availabilitySchema, values)
  if (!parsed.ok) return parsed.result
  const data = parsed.data

  const settings = await getSettings()
  const allowedDates = new Set(settings.event_dates)
  const dates = data.availableDates.filter((d) => allowedDates.size === 0 || allowedDates.has(d))
  if (dates.length === 0) {
    return fail('Select at least one valid date', { availableDates: 'Select at least one date you can serve' })
  }

  const participation = await getOrCreateParticipation(application.id)

  await db.$transaction(async (tx) => {
    await tx.volunteerAvailability.deleteMany({ where: { participationId: participation.id } })
    for (const date of dates) {
      for (const period of data.preferredPeriods) {
        await tx.volunteerAvailability.create({
          data: { participationId: participation.id, date: new Date(`${date}T00:00:00.000Z`), period },
        })
      }
    }

    await tx.emergencyContact.upsert({
      where: { applicationId: application.id },
      update: {
        name: data.emergencyName,
        relationship: data.emergencyRelationship,
        phone: data.emergencyPhone,
      },
      create: {
        applicationId: application.id,
        name: data.emergencyName,
        relationship: data.emergencyRelationship,
        phone: data.emergencyPhone,
      },
    })

    await tx.applicationHealthInfo.upsert({
      where: { applicationId: application.id },
      update: {
        hasCondition: Boolean(data.hasMedicalCondition),
        details: data.hasMedicalCondition ? (data.medicalDetails ?? null) : null,
      },
      create: {
        applicationId: application.id,
        hasCondition: Boolean(data.hasMedicalCondition),
        details: data.hasMedicalCondition ? (data.medicalDetails ?? null) : null,
      },
    })

    await tx.editionParticipation.update({
      where: { id: participation.id },
      data: { availableOvernight: data.availableOvernight },
    })
  })

  await advance(application.id, 6)
  return ok()
}

export async function saveMotivationAction(values: unknown): Promise<ActionResult> {
  const { application } = await requireEditableApplication()
  const parsed = parseOrFail(discoverySchema, values)
  if (!parsed.ok) return parsed.result
  const data = parsed.data

  await db.volunteerApplication.update({
    where: { id: application.id },
    data: {
      discoverySource: data.discoverySource,
      discoveryOther: data.discoverySource === 'other' ? (data.discoveryOther ?? null) : null,
      whyVolunteer: data.whyVolunteer,
      skillsExperience: data.skillsExperience ?? null,
      additionalInfo: data.additionalInfo ?? null,
    },
  })

  await advance(application.id, 7)
  return ok()
}

async function advance(applicationId: string, completedStep: number) {
  await db.volunteerApplication.update({
    where: { id: applicationId },
    data: { currentStep: Math.max(completedStep + 1, 1) },
  })
  revalidatePath('/apply', 'layout')
}

// --- Uploads --------------------------------------------------------------

export async function uploadProfilePhotoAction(formData: FormData): Promise<ActionResult<{ documentId: string }>> {
  const user = await requireUser()
  const file = formData.get('file')
  if (!(file instanceof File)) return fail('No file was uploaded')

  const result = await storeUpload({ file, userId: user.id, kind: 'PROFILE_PHOTO' })
  if (!result.ok) return fail(result.error, { photo: result.error })

  await audit({
    action: 'document.uploaded',
    entityType: 'VolunteerDocument',
    entityId: result.documentId,
    actorId: user.id,
    metadata: { kind: 'PROFILE_PHOTO' },
  })

  return ok({ documentId: result.documentId })
}

export async function uploadAnswerFileAction(
  questionId: string,
  formData: FormData,
): Promise<ActionResult<{ documentId: string }>> {
  const { user, application } = await requireEditableApplication()
  const file = formData.get('file')
  if (!(file instanceof File)) return fail('No file was uploaded')

  const question = await db.departmentQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, type: true, allowedMimeTypes: true, maxFileSizeKb: true },
  })
  if (!question || question.type !== 'FILE') return fail('This question does not accept files')

  const result = await storeUpload({
    file,
    userId: user.id,
    applicationId: application.id,
    kind: 'ANSWER_ATTACHMENT',
    allowedMimeTypes: question.allowedMimeTypes.length > 0 ? question.allowedMimeTypes : undefined,
    maxFileSizeKb: question.maxFileSizeKb,
  })
  if (!result.ok) return fail(result.error)

  await audit({
    action: 'document.uploaded',
    entityType: 'VolunteerDocument',
    entityId: result.documentId,
    actorId: user.id,
    metadata: { questionId },
  })

  return ok({ documentId: result.documentId })
}

// --- Submission -----------------------------------------------------------

export async function submitApplicationAction(values: unknown): Promise<ActionResult<{ registrationId: string }>> {
  const user = await requireUser()
  const parsed = parseOrFail(consentSchema, values)
  if (!parsed.ok) return parsed.result

  const settings = await getSettings()
  if (!settings.registration_open) return fail(settings.registration_closed_message, undefined, 'registration_closed')

  const state = await loadWizardState(user.id)
  const { application, participation, profile } = state

  if (application.status !== 'DRAFT') {
    return fail('This application has already been submitted', undefined, 'already_submitted')
  }

  // Re-validate every step server-side. The wizard should have caught all of
  // this, but a submission must never rely on the client having done so.
  const problems: string[] = []
  if (!profile?.firstName || !profile.lastName || !profile.gender || !profile.ageRange || !profile.phone) {
    problems.push('personal')
  }
  if (!profile?.countryId || !profile.city) problems.push('location')
  if (!profile?.occupation || !profile.education) problems.push('professional')
  if (!profile?.denomination) problems.push('church')
  if (!participation.departmentId) problems.push('department')
  if (!state.emergency || state.availability.length === 0) problems.push('availability')
  if (!application.whyVolunteer || !application.discoverySource) problems.push('motivation')

  if (problems.length > 0) {
    return fail(
      `Some steps are incomplete: ${problems.join(', ')}. Please go back and complete them.`,
      undefined,
      'incomplete',
    )
  }

  const questions = await getDepartmentQuestions(participation.departmentId!)
  const answerErrors = validateAnswers(questions, state.answers)
  if (Object.keys(answerErrors).length > 0) {
    return fail('Some department questions still need answers', undefined, 'incomplete_answers')
  }

  const registrationId = await nextRegistrationId()
  const headerList = await headers()

  const submitted = await db.volunteerApplication.update({
    where: { id: application.id },
    data: {
      registrationId,
      status: 'SUBMITTED',
      submittedAt: new Date(),
      submissionIp: clientIp(headerList),
      submissionUserAgent: headerList.get('user-agent')?.slice(0, 500) ?? null,
      draftData: undefined,
      currentStep: 8,
    },
  })

  /*
   * Consents belong to the edition and are re-taken each one.
   *
   * Recording them on the application would mean a volunteer who agreed to the
   * 2027 terms was treated as having agreed to whatever the 2029 terms turn out
   * to be — which is not consent.
   */
  const confirmed = await db.editionParticipation.update({
    where: { id: participation.id },
    data: {
      consentAccurate: true,
      consentTerms: true,
      consentDataProcessing: true,
      consentCommunication: true,
      consentedAt: new Date(),
      confirmedAt: new Date(),
    },
    include: { department: { select: { name: true } } },
  })

  await db.applicationStatusHistory.create({
    data: { applicationId: application.id, fromStatus: 'DRAFT', toStatus: 'SUBMITTED', changedById: user.id },
  })

  await audit({
    action: 'application.submitted',
    entityType: 'VolunteerApplication',
    entityId: application.id,
    actorId: user.id,
    metadata: { registrationId, departmentId: participation.departmentId, edition: participation.edition },
  })

  /*
   * Submission by a migrated account is the profile review the invitation
   * email promises: every prefilled step has now demonstrably been walked.
   * Best-effort — a reporting write must never fail a submission.
   */
  const migratedState = await db.user.findUnique({
    where: { id: user.id },
    select: { isPreviousEditionUser: true, profileReviewedAt: true },
  })
  if (migratedState?.isPreviousEditionUser && !migratedState.profileReviewedAt) {
    await recordProfileReviewed(user.id).catch((error) =>
      console.error('[migration] could not record profile review', error),
    )
  }

  // Confirmation email — deliberately excludes health and emergency details.
  const message = submissionEmail({
    name: `${profile!.firstName} ${profile!.lastName}`,
    registrationId,
    department: confirmed.department?.name ?? 'Unassigned',
    submittedAt: formatDate(submitted.submittedAt, false),
    loginUrl: `${env.APP_URL}/dashboard`,
  })
  await sendMailSafely({ ...message, to: user.email })

  revalidatePath('/dashboard')
  revalidatePath('/apply', 'layout')

  return ok({ registrationId })
}
