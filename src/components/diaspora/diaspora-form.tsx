'use client'

import { Fragment, useEffect, useRef, useState, useTransition } from 'react'
import { ArrowLeft, ArrowRight, Check, Mail } from 'lucide-react'
import { submitDiasporaAction } from '@/app/diaspora/actions'
import { Alert, Button } from '@/components/ui/primitives'
import { SelectInput, TextInput } from '@/components/ui/form'
import { WhatsAppInput, type DialCountry } from '@/components/diaspora/whatsapp-input'
import {
  DIASPORA_META,
  DIASPORA_QUESTIONS,
  DIASPORA_SECTIONS,
  firstInvalidQuestion,
  joinWhatsApp,
  validateDiasporaAnswer,
  type DiasporaAnswers,
  type DiasporaField,
} from '@/lib/validation/diaspora'

/**
 * The diaspora participation form: one question per screen, then a review.
 *
 * Patterns taken from real forms (Mobbin: Airbnb, Turo, Klaviyo onboarding;
 * Revolut, Uber, Delphi phone entry):
 *  - a segmented bar, one segment per section, with "Question n of N" and the
 *    section that comes next, so people always know how far there is to go;
 *  - WhatsApp numbers as one control — dial-code prefix + local number — with
 *    the code chosen automatically from the country picked in question 1;
 *  - a review grouped by section before anything is sent.
 *
 * Answers are kept in localStorage as they are typed, so an interrupted
 * pastor can come back on the same device. The draft is cleared on success.
 */
type Stage = 'welcome' | 'question' | 'review' | 'confirmed'
type PhoneParts = { iso: string; local: string; isoChosen?: boolean }
type Draft = { answers: DiasporaAnswers; phones: Partial<Record<DiasporaField, PhoneParts>> }

const DRAFT_KEY = 'mmpraise_diaspora_draft_v2'
const TOTAL = DIASPORA_QUESTIONS.length
const WHATSAPP_FIELDS = DIASPORA_QUESTIONS.filter((q) => q.type === 'whatsapp').map((q) => q.id)

function readDraft(): Draft | null {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? 'null')
    if (parsed && typeof parsed === 'object' && 'answers' in parsed) return parsed as Draft
  } catch {
    // Unreadable draft: start clean.
  }
  return null
}

function writeDraft(draft: Draft | null) {
  try {
    if (draft) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    else window.localStorage.removeItem(DRAFT_KEY)
  } catch {
    // Private browsing or storage disabled: the form still works, it just cannot resume.
  }
}

export function DiasporaForm({ countries }: { countries: DialCountry[] }) {
  const [stage, setStage] = useState<Stage>('welcome')
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<DiasporaAnswers>({})
  const [phones, setPhones] = useState<Draft['phones']>({})
  const [hasDraft, setHasDraft] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [reference, setReference] = useState<string | null>(null)
  const [website, setWebsite] = useState('')
  const [pending, startTransition] = useTransition()
  const headingRef = useRef<HTMLHeadingElement>(null)

  const question = DIASPORA_QUESTIONS[step]
  const dialCode = (iso: string) => countries.find((c) => c.iso2 === iso)?.phoneCode ?? ''

  // The draft lives in the browser, so it can only be read after hydration.
  useEffect(() => {
    const draft = readDraft()
    if (draft && Object.values(draft.answers).some((value) => typeof value === 'string' && value.trim())) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off restore from storage
      setAnswers(draft.answers)
      setPhones(draft.phones ?? {})
      setHasDraft(true)
    }
  }, [])

  // Move focus with the person: to the field on a question, to the heading elsewhere.
  useEffect(() => {
    if (stage === 'question') document.getElementById(`diaspora-${DIASPORA_QUESTIONS[step]?.id}`)?.focus()
    else if (stage !== 'welcome') headingRef.current?.focus()
  }, [stage, step])

  function save(nextAnswers: DiasporaAnswers, nextPhones: Draft['phones']) {
    setAnswers(nextAnswers)
    setPhones(nextPhones)
    writeDraft({ answers: nextAnswers, phones: nextPhones })
  }

  function setAnswer(field: DiasporaField, value: string) {
    let nextAnswers = { ...answers, [field]: value }
    let nextPhones = phones
    if (field === 'country') {
      // The country sets the dial code of every WhatsApp number whose code the
      // person has not chosen by hand.
      const iso = countries.find((c) => c.name === value)?.iso2 ?? ''
      nextPhones = { ...phones }
      for (const phoneField of WHATSAPP_FIELDS) {
        const current = phones[phoneField]
        if (current?.isoChosen) continue
        nextPhones[phoneField] = { iso, local: current?.local ?? '' }
        nextAnswers = { ...nextAnswers, [phoneField]: joinWhatsApp(dialCode(iso), current?.local ?? '') }
      }
    }
    save(nextAnswers, nextPhones)
    if (fieldError) setFieldError(validateDiasporaAnswer(field, nextAnswers[field]))
  }

  function setPhone(field: DiasporaField, parts: PhoneParts) {
    const nextPhones = { ...phones, [field]: parts }
    const nextAnswers = { ...answers, [field]: joinWhatsApp(dialCode(parts.iso), parts.local) }
    save(nextAnswers, nextPhones)
    if (fieldError) setFieldError(validateDiasporaAnswer(field, nextAnswers[field]))
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
      document.getElementById(`diaspora-${question.id}`)?.focus()
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
    setPhones({})
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

  // --- progress: one segment per section --------------------------------
  const sectionIndex = question ? DIASPORA_SECTIONS.indexOf(question.section) : 0
  const segments = DIASPORA_SECTIONS.map((section, index) => {
    if (stage === 'review' || stage === 'confirmed') return 1
    if (stage === 'welcome' || index > sectionIndex) return 0
    if (index < sectionIndex) return 1
    const inSection = DIASPORA_QUESTIONS.filter((q) => q.section === section)
    const position = inSection.findIndex((q) => q.id === question?.id)
    return (position + 1) / inSection.length
  })
  const isLastInSection = Boolean(question) && DIASPORA_QUESTIONS[step + 1]?.section !== question?.section
  const nextSection = isLastInSection ? DIASPORA_SECTIONS[sectionIndex + 1] : undefined

  return (
    <div className="space-y-8">
      <div aria-hidden className="grid grid-cols-4 gap-1.5">
        {segments.map((fill, index) => (
          <div key={DIASPORA_SECTIONS[index]} className="h-1.5 overflow-hidden rounded-pill bg-line">
            <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${fill * 100}%` }} />
          </div>
        ))}
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
          </div>
          <ol className="grid gap-2 text-sm text-body sm:grid-cols-2">
            {DIASPORA_SECTIONS.map((section, index) => (
              <li key={section} className="flex items-center gap-2 rounded-field border border-line bg-surface-sunken px-3 py-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
                  {index + 1}
                </span>
                {section}
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted">{TOTAL} questions · about 5 minutes · every question is required</p>
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
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <p className="font-semibold uppercase tracking-wide text-primary">{question.section}</p>
            <p className="text-muted" aria-live="polite">
              Question {step + 1} of {TOTAL}
              {nextSection ? ` · Next: ${nextSection}` : ''}
            </p>
          </div>
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
                <span aria-hidden className="ml-1 text-danger">
                  *
                </span>
              </label>
              {question.hint && (
                <p id="diaspora-hint" className="text-sm text-body">
                  {question.hint}
                </p>
              )}
              {question.type === 'country' ? (
                <SelectInput
                  id={`diaspora-${question.id}`}
                  autoComplete={question.autoComplete}
                  placeholder={question.placeholder}
                  value={answers.country ?? ''}
                  onChange={(event) => setAnswer('country', event.target.value)}
                  invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? 'diaspora-error' : question.hint ? 'diaspora-hint' : undefined}
                  className="text-base"
                >
                  {countries.map((country) => (
                    <option key={country.iso2} value={country.name}>
                      {country.name}
                    </option>
                  ))}
                </SelectInput>
              ) : question.type === 'whatsapp' ? (
                <WhatsAppInput
                  id={`diaspora-${question.id}`}
                  countries={countries}
                  dialIso={phones[question.id]?.iso ?? ''}
                  local={phones[question.id]?.local ?? ''}
                  placeholder={question.placeholder}
                  invalid={Boolean(fieldError)}
                  describedBy={fieldError ? 'diaspora-error' : 'diaspora-hint'}
                  onDialChange={(iso) =>
                    setPhone(question.id, { iso, local: phones[question.id]?.local ?? '', isoChosen: true })
                  }
                  onLocalChange={(local) => setPhone(question.id, { ...(phones[question.id] ?? { iso: '' }), local })}
                />
              ) : (
                <TextInput
                  id={`diaspora-${question.id}`}
                  type={question.type}
                  autoComplete={question.autoComplete}
                  placeholder={question.placeholder}
                  value={answers[question.id] ?? ''}
                  onChange={(event) => setAnswer(question.id, event.target.value)}
                  invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? 'diaspora-error' : question.hint ? 'diaspora-hint' : undefined}
                  className="text-base"
                />
              )}
              {fieldError && (
                <p id="diaspora-error" role="alert" className="text-sm font-medium text-danger">
                  {fieldError}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="ghost" onClick={back}>
                <ArrowLeft aria-hidden className="size-4" /> Back
              </Button>
              <Button type="submit">
                {step + 1 === TOTAL ? 'Review answers' : 'Continue'} <ArrowRight aria-hidden className="size-4" />
              </Button>
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
              Review Your Details
            </h1>
            <p className="text-sm text-muted">Select any answer to change it before submitting.</p>
          </div>

          {DIASPORA_SECTIONS.map((section) => (
            <Fragment key={section}>
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-primary">{section}</h2>
              <ul className="-mt-3 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                {DIASPORA_QUESTIONS.filter((q) => q.section === section).map((q) => {
                  const index = DIASPORA_QUESTIONS.indexOf(q)
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
                            {value || <span className="font-normal text-danger">Missing</span>}
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
            </Fragment>
          ))}

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
              Participation Affirmed
            </h1>
            <p className="max-w-prose text-base leading-relaxed text-body">{DIASPORA_META.confirmationMessage}</p>
            {reference && (
              <p className="text-sm text-muted">
                Your reference: <span className="font-semibold tabular-nums text-ink">{reference}</span>
              </p>
            )}
            <p className="flex flex-wrap items-center gap-2 text-sm text-body">
              <Mail aria-hidden className="size-4 text-primary" /> A copy of your response is on its way to{' '}
              <strong className="break-all">{answers.responderEmail}</strong>.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
