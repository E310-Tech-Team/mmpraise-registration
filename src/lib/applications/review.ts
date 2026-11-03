import 'server-only'
import { db } from '@/lib/db'
import type { ReviewSection } from '@/components/apply/steps/review-step'
import { formatAnswer } from '@/lib/questions/engine'
import { getDepartmentQuestions, getLookupOptions } from '@/lib/reference'
import { humanise } from '@/lib/utils'
import { AGE_RANGES, DENOMINATIONS } from '@/lib/validation/registration'
import type { WizardState } from './service'

/**
 * Build the human-readable review of everything the volunteer has entered.
 * Shared by the review step, the dashboard and the printable summary, so the
 * three can never drift apart.
 */
export async function buildReviewSections(state: WizardState): Promise<ReviewSection[]> {
  const { application, participation, profile, answers, emergency, user } = state

  const [occupations, educations, discoveries] = await Promise.all([
    getLookupOptions('OCCUPATION'),
    getLookupOptions('EDUCATION'),
    getLookupOptions('DISCOVERY_SOURCE'),
  ])

  const [country, state_, region, province, parish, department] = await Promise.all([
    profile?.countryId ? db.country.findUnique({ where: { id: profile.countryId }, select: { name: true } }) : null,
    profile?.stateId ? db.state.findUnique({ where: { id: profile.stateId }, select: { name: true } }) : null,
    profile?.churchRegionId
      ? db.churchRegion.findUnique({ where: { id: profile.churchRegionId }, select: { name: true } })
      : null,
    profile?.churchProvinceId
      ? db.churchProvince.findUnique({ where: { id: profile.churchProvinceId }, select: { name: true } })
      : null,
    profile?.parishId ? db.parish.findUnique({ where: { id: profile.parishId }, select: { name: true } }) : null,
    // Department belongs to the edition, not to the application.
    participation.departmentId
      ? db.department.findUnique({ where: { id: participation.departmentId }, select: { id: true, name: true } })
      : null,
  ])

  const label = (options: { value: string; label: string }[], value: string | null | undefined) =>
    options.find((o) => o.value === value)?.label ?? value ?? '—'

  const sections: ReviewSection[] = []

  sections.push({
    title: 'Personal, location & profession',
    stepSlug: 'personal',
    items: [
      { label: 'Name', value: profile ? `${profile.firstName} ${profile.lastName}` : '—' },
      { label: 'Gender', value: humanise(profile?.gender) },
      { label: 'Email address', value: user?.email ?? '—' },
      { label: 'Phone number', value: profile?.phone ?? '—' },
      { label: 'Age range', value: AGE_RANGES.find((a) => a.value === profile?.ageRange)?.label ?? '—' },
      { label: 'Profile photograph', value: profile?.photoDocumentId ? 'Uploaded' : 'Not provided' },
      ...(profile?.isMinor === true
        ? [
            { label: 'Parent or guardian', value: profile.guardianName ?? '—' },
            { label: 'Guardian phone', value: profile.guardianPhone ?? '—' },
            { label: 'Guardian consent', value: profile.guardianConsent ? 'Given' : 'Not given' },
          ]
        : []),
      { label: 'Country', value: country?.name ?? '—' },
      { label: 'State or province', value: state_?.name ?? profile?.stateNameOther ?? '—' },
      { label: 'City or town', value: profile?.city ?? '—' },
      { label: 'Residential address', value: profile?.addressLine ?? 'Not provided' },
      {
        label: 'Occupation',
        value: profile?.occupation === 'other' ? (profile.occupationOther ?? 'Other') : label(occupations, profile?.occupation),
      },
      {
        label: 'Educational qualification',
        value: profile?.education === 'other' ? (profile.educationOther ?? 'Other') : label(educations, profile?.education),
      },
      { label: 'Emergency contact', value: emergency ? `${emergency.name} (${emergency.relationship})` : '—' },
      { label: 'Emergency phone', value: emergency?.phone ?? '—' },
    ],
  })

  const denominationLabel = DENOMINATIONS.find((d) => d.value === profile?.denomination)?.label ?? '—'
  sections.push({
    title: 'Church information',
    stepSlug: 'church',
    items:
      profile?.denomination === 'RCCG'
        ? [
            { label: 'Denomination', value: denominationLabel },
            { label: 'Region', value: region?.name ?? '—' },
            { label: 'Province', value: province?.name ?? '—' },
            { label: 'Parish', value: parish?.name ?? '—' },
          ]
        : profile?.denomination === 'OTHER_CHRISTIAN'
          ? [
              { label: 'Denomination', value: denominationLabel },
              { label: 'Church name', value: profile.churchName ?? '—' },
            ]
          : [{ label: 'Denomination', value: denominationLabel }],
  })

  // Department answers, rendered from the question definitions + motivation
  const departmentItems: ReviewSection['items'] = [{ label: 'Department', value: department?.name ?? '—' }]
  if (department) {
    const questions = await getDepartmentQuestions(department.id)
    for (const question of questions) {
      const answer = answers[question.key]
      if (!answer) continue
      departmentItems.push({ label: question.label, value: formatAnswer(question, answer) })
    }
  }
  departmentItems.push(
    {
      label: 'How you heard about us',
      value:
        application.discoverySource === 'other'
          ? (application.discoveryOther ?? 'Other')
          : label(discoveries, application.discoverySource),
    },
    { label: 'Why you want to volunteer', value: application.whyVolunteer ?? '—' },
    { label: 'Relevant skills or experience', value: application.skillsExperience ?? 'Not provided' },
    { label: 'Additional information', value: application.additionalInfo ?? 'Not provided' },
  )
  sections.push({ title: 'Department & motivation', stepSlug: 'department', items: departmentItems })

  sections.push({
    title: 'Availability',
    stepSlug: 'availability',
    items: [
      {
        label: "Available for this year's edition",
        value: participation.confirmedAt ? 'Yes' : 'Yes',
      },
    ],
  })

  return sections
}
