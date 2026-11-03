'use client'

import { CalendarCheck2 } from 'lucide-react'
import { saveAvailabilityAction } from '@/app/(volunteer)/apply/actions'
import { StepShell } from '@/components/apply/step-shell'
import { useStepForm } from '@/components/apply/use-step-form'
import { Field, RadioGroup } from '@/components/ui/form'
import { availabilitySchema, type AvailabilityFormValues } from '@/lib/validation/registration'

const LABELS: Record<string, string> = {
  availableForThisYear: 'Availability for this year',
}

/**
 * Step 4: Availability (Simplified final step before Review)
 * Only asks: "Are you going to be available for this year's edition?"
 */
export function AvailabilityStep({
  initialValues,
}: {
  initialValues: AvailabilityFormValues
  eventDates?: string[]
}) {
  const form = useStepForm<AvailabilityFormValues>({
    step: 'availability',
    initialValues: {
      ...initialValues,
      availableForThisYear: initialValues.availableForThisYear || 'YES',
    },
    schema: availabilitySchema,
    action: saveAvailabilityAction,
    nextHref: '/apply/review',
  })

  return (
    <StepShell
      stepNumber={4}
      title="Availability"
      description="Confirm your availability for this year's edition."
      errors={form.errors}
      errorLabels={LABELS}
      formError={form.formError}
      pending={form.pending}
      saveState={form.saveState}
      onSubmit={form.submit}
      onSaveAndExit={form.saveAndExit}
    >
      <div className="rounded-card border border-primary/20 bg-primary-subtle p-6">
        <div className="flex items-start gap-4">
          <CalendarCheck2 className="size-8 text-primary shrink-0 mt-1" />
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-lg font-bold text-ink">
                Are you going to be available for this year&apos;s edition?
              </h3>
              <p className="mt-1 text-sm text-muted">
                Please confirm whether you will be available to take part and serve in Marathon Messiah&apos;s Praise this year.
              </p>
            </div>

            <Field
              label=""
              required
              error={form.errors.availableForThisYear}
              asFieldset
            >
              <RadioGroup
                name="availableForThisYear"
                options={[
                  { value: 'YES', label: 'Yes, I will be available to serve' },
                  { value: 'NO', label: 'No, I cannot make it this year' },
                ]}
                value={form.values.availableForThisYear ?? 'YES'}
                onChange={(value) => form.setValue('availableForThisYear', value as 'YES' | 'NO')}
                invalid={Boolean(form.errors.availableForThisYear)}
              />
            </Field>
          </div>
        </div>
      </div>
    </StepShell>
  )
}
