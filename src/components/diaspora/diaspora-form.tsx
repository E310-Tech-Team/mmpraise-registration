'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { submitDiasporaAction } from '@/app/diaspora/actions'
import { Alert, Button } from '@/components/ui/primitives'
import { SelectInput, TextInput } from '@/components/ui/form'
import {
  DIASPORA_META,
  DIASPORA_QUESTIONS,
  firstInvalidQuestion,
  validateDiasporaAnswer,
  type DiasporaAnswers,
} from '@/lib/validation/diaspora'

/**
 * The diaspora participation form: one question per screen, then a review, the
 * same rhythm as the Google Form it replaces.
 *
 * Answers are kept in localStorage as they are typed, so a pastor interrupted
 * half-way through can come back to the same device and carry on. The draft is
 * cleared once the response is stored.
 */
type Stage = 'welcome' | 'question' | 'review' | 'confirmed'

const DRAFT_KEY = 'mmpraise_diaspora_draft_v1'
const TOTAL = DIASPORA_QUESTIONS.length

function readDraft(): DiasporaAnswers {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? (parsed as DiasporaAnswers) : {}
  } catch {
    return {}
  }
}

function writeDraft(answers: DiasporaAnswers | null) {
  try {
    if (answers) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(answers))
    else window.localStorage.removeItem(DRAFT_KEY)
  } catch {
    // Private browsing or storage disabled: the form still works, it just cannot resume.
  }
}

export function DiasporaForm({ countries }: { countries: string[] }) {
  const [stage, setStage] = useState<Stage>('welcome')
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<DiasporaAnswers>({})
  const [hasDraft, setHasDraft] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [reference, setReference] = useState<string | null>(null)
  const [website, setWebsite] = useState('')
  const [pending, startTransition] = useTransition()

  const headingRef = useRef<HTMLHeadingElement>(null)
  const question = DIASPORA_QUESTIONS[step]
  // The shared inputs do not forward refs, so the field is found by its id.
  const focusField = () => document.getElementById(`diaspora-${DIASPORA_QUESTIONS[step]?.id}`)?.focus()

  // The draft lives in the browser, so it can only be read after hydration.
  useEffect(() => {
    const draft = readDraft()
    if (Object.values(draft).some((value) => typeof value === 'string' && value.trim())) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off restore from storage
      setAnswers(draft)
      setHasDraft(true)
    }
  }, [])

  // Move focus with the person: to the field on a question, to the heading elsewhere.
  useEffect(() => {
    if (stage === 'question') document.getElementById(`diaspora-${DIASPORA_QUESTIONS[step]?.id}`)?.focus()
    else if (stage !== 'welcome') headingRef.current?.focus()
  }, [stage, step])

  function setAnswer(value: string) {
    const next = { ...answers, [question.id]: value }
    setAnswers(next)
    writeDraft(next)
    if (fieldError) setFieldError(validateDiasporaAnswer(question.id, value))
  }

  function goTo(nextStage: Stage, nextStep = step) {
    setFieldError(null)
    setStep(nextStep)
    setStage(nextStage)
  }

  function next() {
    const error = validateDiasporaAnswer(question.id, answers[question.id])
    if (error) {
      setFieldError(error)
      focusField()
      return
    }
    if (step + 1 < TOTAL) goTo('question', step + 1)
    else goTo('review')
  }

  function back() {
    if (stage === 'review') goTo('question', TOTAL - 1)
    else if (step === 0) goTo('welcome', 0)
    else goTo('question', step - 1)
  }

  function resume() {
    const firstMissing = firstInvalidQuestion(answers)
    if (firstMissing === -1) goTo('review')
    else goTo('question', firstMissing)
  }

  function startOver() {
    writeDraft(null)
    setAnswers({})
    setHasDraft(false)
    setReference(null)
    setSubmitError(null)
    goTo('welcome', 0)
  }

  function submit() {
    const firstMissing = firstInvalidQuestion(answers)
    if (firstMissing !== -1) {
      const missing = DIASPORA_QUESTIONS[firstMissing]
      goTo('question', firstMissing)
      setFieldError(validateDiasporaAnswer(missing.id, answers[missing.id]))
      return
    }

    setSubmitError(null)
    startTransition(async () => {
      // A thrown action must not escape the transition and blank the page.
      const result = await submitDiasporaAction({ ...answers, website }).catch(() => null)
      if (!result) {
        setSubmitError('We could not send your response. Check your connection and try again.')
        return
      }
      if (!result.ok) {
        const fieldIndex = DIASPORA_QUESTIONS.findIndex((q) => result.fieldErrors?.[q.id])
        if (fieldIndex !== -1) {
          goTo('question', fieldIndex)
          setFieldError(result.fieldErrors?.[DIASPORA_QUESTIONS[fieldIndex].id] ?? null)
        } else {
          setSubmitError(result.error)
        }
        return
      }
      writeDraft(null)
      setHasDraft(false)
      setReference(result.data.reference)
      goTo('confirmed', 0)
    })
  }

  const progress =
    stage === 'welcome' ? 0 : stage === 'question' ? Math.round(((step + 1) / TOTAL) * 100) : 100

  return (
    <div className="space-y-8">
      <div
        className="h-1.5 w-full overflow-hidden rounded-pill bg-line"
        role="progressbar"
        aria-label="Form progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>

      {/* Honeypot: invisible to people and to assistive technology. */}
      <div aria-hidden className="hidden">
        <label htmlFor="diaspora-website">Website</label>
        <input
          id="diaspora-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      {stage === 'welcome' && (
        <section aria-labelledby="diaspora-title" className="space-y-6">
          <h1 id="diaspora-title" className="font-display text-3xl font-bold uppercase leading-tight text-ink sm:text-4xl">
            {DIASPORA_META.title}
          </h1>
          <div className="max-w-prose space-y-3 text-base leading-relaxed text-body">
            <p className="font-semibold text-ink">{DIASPORA_META.salutation}</p>
            <p>{DIASPORA_META.intro}</p>
            <p className="text-sm text-muted">{TOTAL} questions · about 5 minutes</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {hasDraft ? (
              <>
                <Button size="lg" onClick={resume}>
                  Continue where you left off <ArrowRight aria-hidden className="size-4" />
                </Button>
                <Button size="lg" variant="ghost" onClick={startOver}>
                  Start over
                </Button>
              </>
            ) : (
              <Button size="lg" onClick={() => goTo('question', 0)}>
                Begin <ArrowRight aria-hidden className="size-4" />
              </Button>
            )}
          </div>
        </section>
      )}

      {stage === 'question' && question && (
        <section aria-labelledby="diaspora-question" className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            {question.section} · {step + 1} of {TOTAL}
          </p>
          <form
            noValidate
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault()
              next()
            }}
          >
            <div className="space-y-2">
              <label
                id="diaspora-question"
                htmlFor={`diaspora-${question.id}`}
                className="block font-display text-2xl font-bold leading-snug text-ink sm:text-3xl"
              >
                {question.label}
                {question.required ? (
                  <span aria-hidden className="ml-1 text-danger">
                    *
                  </span>
                ) : (
                  <span className="ml-2 align-middle text-sm font-normal text-muted">Optional</span>
                )}
              </label>
              {question.type === 'country' ? (
                <SelectInput
                  id={`diaspora-${question.id}`}
                  autoComplete={question.autoComplete}
                  placeholder={question.placeholder}
                  value={answers[question.id] ?? ''}
                  onChange={(event) => setAnswer(event.target.value)}
                  invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? 'diaspora-error' : undefined}
                  className="text-base"
                >
                  {countries.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </SelectInput>
              ) : (
                <TextInput
                  id={`diaspora-${question.id}`}
                  type={question.type}
                  autoComplete={question.autoComplete}
                  placeholder={question.placeholder}
                  value={answers[question.id] ?? ''}
                  onChange={(event) => setAnswer(event.target.value)}
                  invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? 'diaspora-error' : question.hint ? 'diaspora-hint' : undefined}
                  className="text-base"
                />
              )}
              {fieldError ? (
                <p id="diaspora-error" role="alert" className="text-sm font-medium text-danger">
                  {fieldError}
                </p>
              ) : question.hint ? (
                <p id="diaspora-hint" className="text-sm text-muted">
                  {question.hint}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="ghost" onClick={back}>
                <ArrowLeft aria-hidden className="size-4" /> Back
              </Button>
              <div className="flex gap-2">
                {!question.required && !answers[question.id]?.trim() && (
                  <Button type="button" variant="ghost" onClick={next}>
                    Skip
                  </Button>
                )}
                <Button type="submit">
                  {step + 1 === TOTAL ? 'Review' : 'Continue'} <ArrowRight aria-hidden className="size-4" />
                </Button>
              </div>
            </div>
          </form>
        </section>
      )}

      {stage === 'review' && (
        <section aria-labelledby="diaspora-review" className="space-y-6">
          <div className="space-y-2">
            <h1
              id="diaspora-review"
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-3xl font-bold uppercase text-ink focus:outline-none"
            >
              Review your details
            </h1>
            <p className="text-sm text-muted">Select any answer to change it before submitting.</p>
          </div>

          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {DIASPORA_QUESTIONS.map((q, index) => {
              const value = answers[q.id]?.trim()
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => goTo('question', index)}
                    className="flex w-full items-start justify-between gap-4 px-5 py-3.5 text-left transition-colors hover:bg-primary-subtle focus-visible:bg-primary-subtle"
                  >
                    <span className="min-w-0 space-y-0.5">
                      <span className="block text-xs font-medium text-muted">{q.label}</span>
                      <span className="block break-words text-sm font-semibold text-ink">
                        {value || <span className="font-normal text-muted">Not provided</span>}
                      </span>
                    </span>
                    <span className="shrink-0 pt-1 text-xs font-semibold text-primary">
                      Edit<span className="sr-only"> {q.label}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {submitError && <Alert tone="danger">{submitError}</Alert>}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={back}>
              <ArrowLeft aria-hidden className="size-4" /> Back
            </Button>
            <Button size="lg" onClick={submit} isLoading={pending}>
              Submit participation
            </Button>
          </div>
        </section>
      )}

      {stage === 'confirmed' && (
        <section aria-labelledby="diaspora-confirmed" className="space-y-6">
          <span className="flex size-12 items-center justify-center rounded-card bg-success-subtle text-success">
            <Check aria-hidden className="size-6" />
          </span>
          <div className="space-y-3">
            <h1
              id="diaspora-confirmed"
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-3xl font-bold uppercase text-ink focus:outline-none sm:text-4xl"
            >
              Participation affirmed
            </h1>
            <p className="max-w-prose text-base leading-relaxed text-body">{DIASPORA_META.confirmationMessage}</p>
            {reference && (
              <p className="text-sm text-muted">
                Your reference: <span className="font-semibold tabular-nums text-ink">{reference}</span>
              </p>
            )}
          </div>

          <Button variant="outline" onClick={startOver}>
            Submit another centre
          </Button>
        </section>
      )}
    </div>
  )
}
