import { WIZARD_STEPS } from '@/lib/validation/registration'

/**
 * How far an application got, in words a follow-up caller can use.
 *
 * `currentStep` is the step the wizard would open next — so a draft at step 3
 * has completed steps 1–2 and stopped at "Professional". Submitted
 * applications have walked every step, so their progress is simply that.
 */
export function applicationProgress(status: string, currentStep: number): string {
  if (status !== 'DRAFT') return 'Submitted'
  const step = WIZARD_STEPS.find((candidate) => candidate.number === currentStep) ?? WIZARD_STEPS[0]
  return `Draft — stopped at step ${step.number} of ${WIZARD_STEPS.length} (${step.title})`
}
