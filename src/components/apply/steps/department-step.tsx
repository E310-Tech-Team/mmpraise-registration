'use client'

import { useEffect, useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import { saveDepartmentAction } from '@/app/(volunteer)/apply/actions'
import { QuestionField } from '@/components/apply/question-field'
import { StepShell } from '@/components/apply/step-shell'
import { useStepForm } from '@/components/apply/use-step-form'
import { Alert, Skeleton } from '@/components/ui/primitives'
import { Field, RadioGroup, TextArea, TextInput } from '@/components/ui/form'
import { cn } from '@/lib/utils'
import { departmentSchema, type DepartmentFormValues } from '@/lib/validation/registration'
import {
  validateAnswers,
  visibleQuestions,
  type AnswerMap,
  type AnswerValue,
  type QuestionDef,
} from '@/lib/questions/engine'

type DepartmentOption = {
  id: string
  slug: string
  name: string
  description: string | null
  applied: number
}

type Lookup = { value: string; label: string; requiresText: boolean }

const LABELS: Record<string, string> = {
  departmentId: 'Department',
  discoverySource: 'How you heard about us',
  discoveryOther: 'How you heard about us (other)',
  whyVolunteer: 'Why you want to volunteer',
  skillsExperience: 'Skills and experience',
  additionalInfo: 'Additional information',
}

/**
 * Department selection, its conditional questions, and motivation.
 * (Merged Step 3)
 */
export function DepartmentStep({
  initialValues,
  initialAnswers,
  departments,
  initialQuestions,
  discoverySources = [],
}: {
  initialValues: DepartmentFormValues
  initialAnswers: AnswerMap
  departments: DepartmentOption[]
  initialQuestions: QuestionDef[]
  discoverySources?: Lookup[]
}) {
  const [answers, setAnswers] = useState<AnswerMap>(initialAnswers)
  const [questions, setQuestions] = useState<QuestionDef[]>(initialQuestions)
  const [loadedFor, setLoadedFor] = useState<string | null>(
    initialValues.departmentId && initialQuestions.length > 0 ? initialValues.departmentId : null,
  )
  const [loadError, setLoadError] = useState<string | null>(null)

  const form = useStepForm<DepartmentFormValues>({
    step: 'department',
    initialValues,
    schema: departmentSchema,
    action: (values) => saveDepartmentAction(values, answers),
    nextHref: '/apply/availability',
    extraValidate: () => {
      const errors = validateAnswers(questions, answers)
      const prefixed: Record<string, string> = {}
      for (const [key, message] of Object.entries(errors)) prefixed[`answers.${key}`] = message
      return prefixed
    },
  })

  const selectedId = form.values.departmentId

  useEffect(() => {
    if (!selectedId || loadedFor === selectedId) return

    const controller = new AbortController()

    fetch(`/api/departments/${selectedId}/questions`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.json()
      })
      .then((data: { items: QuestionDef[] }) => {
        setQuestions(data.items)
        setLoadedFor(selectedId)
      })
      .catch((cause) => {
        if (controller.signal.aborted) return
        console.error('[questions] load failed', cause)
        setLoadError('We could not load the questions for this department. Please try again.')
      })

    return () => controller.abort()
  }, [selectedId, loadedFor])

  const loadingQuestions = Boolean(selectedId) && loadedFor !== selectedId && !loadError

  const shown = useMemo(() => visibleQuestions(questions, answers), [questions, answers])

  function updateAnswer(key: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [key]: value }))
  }

  const needsOther = discoverySources.find((s) => s.value === form.values.discoverySource)?.requiresText

  return (
    <StepShell
      stepNumber={3}
      title="Department & Motivation"
      description="Choose where and tell us why you want to serve."
      errors={form.errors}
      errorLabels={LABELS}
      formError={form.formError}
      pending={form.pending}
      saveState={form.saveState}
      onSubmit={form.submit}
      onSaveAndExit={form.saveAndExit}
    >
      <Field
        label="Select a department"
        required
        error={form.errors.departmentId}
        help="Select the team you want to join for this edition."
        asFieldset
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {departments.map((department) => {
            const checked = form.values.departmentId === department.id
            return (
              <label
                key={department.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-card border p-4 transition-colors',
                  checked
                    ? 'border-primary bg-primary-subtle ring-2 ring-primary'
                    : 'border-line hover:border-line-strong hover:bg-surface-subtle',
                )}
              >
                <input
                  type="radio"
                  name="departmentId"
                  value={department.id}
                  checked={checked}
                  onChange={() => {
                    form.setValue('departmentId', department.id)
                    setAnswers({})
                    setQuestions([])
                    setLoadedFor(null)
                    setLoadError(null)
                  }}
                  className="mt-1 size-5 shrink-0 accent-[var(--color-primary)]"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base font-bold uppercase text-ink">{department.name}</span>
                  </span>
                  {department.description && (
                    <span className="mt-1 block text-sm text-muted">{department.description}</span>
                  )}
                  {department.applied > 0 && (
                    <span className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                      <Users aria-hidden className="size-3.5" />
                      {department.applied} {department.applied === 1 ? 'volunteer' : 'volunteers'} so far
                    </span>
                  )}
                </span>
              </label>
            )
          })}
        </div>
      </Field>

      {selectedId && (
        <section aria-live="polite" className="space-y-6 border-t border-line pt-6">
          <h3 className="text-base font-bold text-ink">Department questions</h3>

          {loadError && <Alert tone="danger">{loadError}</Alert>}

          {loadingQuestions && (
            <div className="space-y-4">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-11 w-full" />
            </div>
          )}

          {!loadingQuestions && !loadError && shown.length === 0 && (
            <p className="text-sm text-muted">This department has no additional questions.</p>
          )}

          {!loadingQuestions &&
            shown.map((question) => (
              <QuestionField
                key={question.id}
                question={question}
                value={answers[question.key]}
                onChange={(value) => updateAnswer(question.key, value)}
                error={form.errors[`answers.${question.key}`]}
              />
            ))}
        </section>
      )}

      {/* Merged Motivation Section */}
      <section className="space-y-6 border-t border-line pt-6">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">Motivation & Background</h3>
          <p className="text-xs text-muted">Tell us a little more about your reasons for serving.</p>
        </div>

        {discoverySources.length > 0 && (
          <Field
            label="How did you hear about MMPraise volunteering?"
            required
            error={form.errors.discoverySource}
            asFieldset
          >
            <RadioGroup
              name="discoverySource"
              columns={2}
              value={form.values.discoverySource ?? null}
              onChange={(value) => form.patch({ discoverySource: value, discoveryOther: '' })}
              invalid={Boolean(form.errors.discoverySource)}
              options={discoverySources.map((s) => ({ value: s.value, label: s.label }))}
            />
          </Field>
        )}

        {needsOther && (
          <Field label="Please tell us where" htmlFor="field-discoveryOther" required error={form.errors.discoveryOther}>
            <TextInput
              id="field-discoveryOther"
              maxLength={120}
              value={form.values.discoveryOther ?? ''}
              onChange={(e) => form.setValue('discoveryOther', e.target.value)}
              invalid={Boolean(form.errors.discoveryOther)}
            />
          </Field>
        )}

        <Field
          label="Why do you want to volunteer at MMPraise?"
          htmlFor="field-whyVolunteer"
          required
          error={form.errors.whyVolunteer}
          help="A few sentences is plenty."
        >
          <TextArea
            id="field-whyVolunteer"
            maxLength={1000}
            rows={3}
            value={form.values.whyVolunteer ?? ''}
            onChange={(e) => form.setValue('whyVolunteer', e.target.value)}
            invalid={Boolean(form.errors.whyVolunteer)}
          />
        </Field>

        <Field
          label="Relevant skills or experience"
          htmlFor="field-skillsExperience"
          error={form.errors.skillsExperience}
          help="Optional. Any experience that might help us place you."
        >
          <TextArea
            id="field-skillsExperience"
            maxLength={1000}
            rows={2}
            value={form.values.skillsExperience ?? ''}
            onChange={(e) => form.setValue('skillsExperience', e.target.value)}
            invalid={Boolean(form.errors.skillsExperience)}
          />
        </Field>

        <Field
          label="Anything else you would like us to know?"
          htmlFor="field-additionalInfo"
          error={form.errors.additionalInfo}
        >
          <TextArea
            id="field-additionalInfo"
            maxLength={1000}
            rows={2}
            value={form.values.additionalInfo ?? ''}
            onChange={(e) => form.setValue('additionalInfo', e.target.value)}
            invalid={Boolean(form.errors.additionalInfo)}
          />
        </Field>
      </section>
    </StepShell>
  )
}
