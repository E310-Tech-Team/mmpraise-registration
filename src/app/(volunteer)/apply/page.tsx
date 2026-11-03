import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/rbac'
import { getOrCreateDraft, getOrCreateParticipation } from '@/lib/applications/service'
import { stepByNumber } from '@/lib/validation/registration'

/** Entry point: send the volunteer to wherever they left off. */
export default async function ApplyPage() {
  const user = await requireUser()
  const application = await getOrCreateDraft(user.id)

  if (application.status !== 'DRAFT') {
    // Already registered. If this edition still needs confirming, the short
    // per-edition form is the right place; otherwise the dashboard is.
    const participation = await getOrCreateParticipation(application.id)
    redirect(participation.confirmedAt ? '/dashboard' : '/participate')
  }

  const step = stepByNumber(Math.min(Math.max(application.currentStep, 1), 5))
  redirect(`/apply/${step.slug}`)
}
