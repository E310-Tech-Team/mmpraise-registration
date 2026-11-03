import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { ProgressSteps } from '@/components/apply/progress-steps'
import { AvailabilityStep } from '@/components/apply/steps/availability-step'
import { ChurchStep } from '@/components/apply/steps/church-step'
import { DepartmentStep } from '@/components/apply/steps/department-step'
import { PersonalStep } from '@/components/apply/steps/personal-step'
import { ReviewStep } from '@/components/apply/steps/review-step'
import { Alert } from '@/components/ui/primitives'
import { requireUser } from '@/lib/auth/rbac'
import { loadWizardState } from '@/lib/applications/service'
import { buildReviewSections } from '@/lib/applications/review'
import {
  getChurchRegions,
  getCountries,
  getDepartmentQuestions,
  getDepartmentsWithLoad,
  getLookupOptions,
} from '@/lib/reference'
import { stepBySlug, WIZARD_STEPS } from '@/lib/validation/registration'

export const metadata: Metadata = { title: 'Volunteer registration' }

export default async function WizardStepPage({ params }: { params: Promise<{ step: string }> }) {
  const { step: slug } = await params

  // Redirect old steps to their new merged locations
  if (slug === 'location' || slug === 'professional') redirect('/apply/personal')
  if (slug === 'motivation') redirect('/apply/department')

  const step = stepBySlug(slug)
  if (!step) notFound()

  const user = await requireUser()
  const state = await loadWizardState(user.id)

  if (state.application.status !== 'DRAFT') redirect('/dashboard')

  const draft = state.draft as Record<string, Record<string, unknown> | undefined>
  const merge = <T,>(persisted: T, key: string): T => ({ ...persisted, ...(draft[key] ?? {}) }) as T

  const profile = state.profile
  const furthest = Math.max(state.application.currentStep, step.number)

  const body = await renderStep()

  return (
    <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
      <div className="mb-6 lg:mb-0">
        <div className="lg:sticky lg:top-6">
          <ProgressSteps current={step.number} furthest={furthest} />
        </div>
      </div>

      <div className="min-w-0">
        {!user.emailVerified && (
          <Alert tone="warning" title="Confirm your email address" className="mb-6">
            We sent a link to {user.email}. You can carry on registering, but please confirm it before
            your application is reviewed.
          </Alert>
        )}
        {body}
      </div>
    </div>
  )

  async function renderStep() {
    switch (step!.slug) {
      case 'personal': {
        const [countries, occupations, educationLevels] = await Promise.all([
          getCountries(),
          getLookupOptions('OCCUPATION'),
          getLookupOptions('EDUCATION'),
        ])
        const defaultCountry = countries.find((c) => c.iso2 === 'NG') ?? countries[0]
        const phone = profile?.phone ?? ''
        const dialCode = profile?.phoneCountry ?? defaultCountry?.phoneCode ?? ''

        return (
          <PersonalStep
            countries={countries}
            occupations={occupations}
            educationLevels={educationLevels}
            initialValues={merge(
              {
                firstName: profile?.firstName ?? '',
                lastName: profile?.lastName ?? '',
                gender: profile?.gender ?? '',
                email: state.user?.email ?? '',
                phoneDialCode: dialCode,
                phoneLocal: phone && dialCode ? phone.replace(`+${dialCode}`, '') : '',
                phone,
                ageRange: profile?.ageRange ?? '',
                isMinor: profile?.isMinor ?? null,
                photoDocumentId: profile?.photoDocumentId ?? null,
                guardianName: profile?.guardianName ?? '',
                guardianPhone: profile?.guardianPhone ?? '',
                guardianConsent: profile?.guardianConsent ?? false,
                countryId: profile?.countryId ?? '',
                countryHasStates: Boolean(countries.find((c) => c.id === profile?.countryId)?.hasStates),
                stateId: profile?.stateId ?? null,
                stateNameOther: profile?.stateNameOther ?? '',
                city: profile?.city ?? '',
                addressLine: profile?.addressLine ?? '',
                occupation: profile?.occupation ?? '',
                occupationOther: profile?.occupationOther ?? '',
                education: profile?.education ?? '',
                educationOther: profile?.educationOther ?? '',
                emergencyName: state.emergency?.name ?? '',
                emergencyRelationship: state.emergency?.relationship ?? '',
                emergencyPhone: state.emergency?.phone ?? '',
              },
              'personal',
            )}
          />
        )
      }

      case 'church': {
        const regions = await getChurchRegions()
        return (
          <ChurchStep
            regions={regions}
            initialValues={merge(
              {
                denomination: profile?.denomination ?? '',
                churchRegionId: profile?.churchRegionId ?? null,
                churchProvinceId: profile?.churchProvinceId ?? null,
                parishId: profile?.parishId ?? null,
                churchName: profile?.churchName ?? '',
              },
              'church',
            )}
          />
        )
      }

      case 'department': {
        const [departments, discoverySources] = await Promise.all([
          getDepartmentsWithLoad(),
          getLookupOptions('DISCOVERY_SOURCE'),
        ])
        const questions = state.participation.departmentId
          ? await getDepartmentQuestions(state.participation.departmentId)
          : []

        return (
          <DepartmentStep
            departments={departments}
            discoverySources={discoverySources}
            initialQuestions={questions}
            initialAnswers={state.answers}
            initialValues={merge(
              {
                departmentId: state.participation.departmentId ?? '',
                discoverySource: state.application.discoverySource ?? '',
                discoveryOther: state.application.discoveryOther ?? '',
                whyVolunteer: state.application.whyVolunteer ?? '',
                skillsExperience: state.application.skillsExperience ?? '',
                additionalInfo: state.application.additionalInfo ?? '',
              },
              'department',
            )}
          />
        )
      }

      case 'availability': {
        return (
          <AvailabilityStep
            initialValues={merge(
              {
                availableForThisYear: state.participation.confirmedAt ? 'YES' : 'YES',
              },
              'availability',
            )}
          />
        )
      }

      case 'review': {
        const sections = await buildReviewSections(state)
        return <ReviewStep sections={sections} />
      }

      default:
        notFound()
    }
  }
}

export function generateStaticParams() {
  return WIZARD_STEPS.map((step) => ({ step: step.slug }))
}
