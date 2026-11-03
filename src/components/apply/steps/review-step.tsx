'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, Send } from 'lucide-react'
import { submitApplicationAction } from '@/app/(volunteer)/apply/actions'
import { Alert, Button, Card, CardBody, CardHeader } from '@/components/ui/primitives'
import { Checkbox, ErrorSummary } from '@/components/ui/form'
import { consentSchema } from '@/lib/validation/registration'
import type { FieldErrors } from '@/lib/actions/result'

export type ReviewItem = { label: string; value: string; sensitive?: boolean }
export type ReviewSection = { title: string; stepSlug: string; items: ReviewItem[] }

type Consents = {
  consentAccurate: boolean
  consentTermsAndProcessing: boolean
  consentCommunication: boolean
}

const CONSENT_COPY: { key: keyof Consents; label: React.ReactNode }[] = [
  { key: 'consentAccurate', label: 'I confirm that the information I have provided is accurate.' },
  {
    key: 'consentTermsAndProcessing',
    label: (
      <>
        I agree to the{' '}
        <Link href="/terms" target="_blank" className="font-semibold text-primary underline underline-offset-2">
          MMPraise volunteer terms and code of conduct
        </Link>
        , and I consent to my information being processed for volunteer coordination, as described in the{' '}
        <Link href="/privacy" target="_blank" className="font-semibold text-primary underline underline-offset-2">
          privacy notice
        </Link>
        .
      </>
    ),
  },
  { key: 'consentCommunication', label: 'I consent to receiving registration and volunteer-related communication.' },
]

export function ReviewStep({ sections }: { sections: ReviewSection[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [consents, setConsents] = useState<Consents>({
    consentAccurate: false,
    consentTermsAndProcessing: false,
    consentCommunication: false,
  })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const payload = {
      consentAccurate: consents.consentAccurate,
      consentTermsAndProcessing: consents.consentTermsAndProcessing,
      consentTerms: consents.consentTermsAndProcessing,
      consentDataProcessing: consents.consentTermsAndProcessing,
      consentCommunication: consents.consentCommunication,
    }

    const parsed = consentSchema.safeParse(payload)
    if (!parsed.success) {
      const next: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.')
        if (!next[key]) next[key] = issue.message
      }
      setErrors(next)
      requestAnimationFrame(() => document.getElementById('step-errors')?.focus())
      return
    }

    setErrors({})
    startTransition(async () => {
      try {
        const result = await submitApplicationAction(payload)
        if (!result.ok) {
          setFormError(result.error)
          requestAnimationFrame(() => document.getElementById('step-errors')?.focus())
          return
        }
        router.push(`/apply/submitted?id=${encodeURIComponent(result.data.registrationId)}`)
        router.refresh()
      } catch {
        setFormError('We could not submit your registration. Your answers are saved — please try again.')
        requestAnimationFrame(() => document.getElementById('step-errors')?.focus())
      }
    })
  }

  const summary = Object.entries(errors).map(([field, message]) => ({ field: `field-${field}`, message }))

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <ErrorSummary id="step-errors" errors={summary} title="Please complete the following before submitting" />
      {formError && (
        <Alert tone="danger" title="We could not submit your registration">
          {formError}
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Review your registration"
          description="Check everything below. You can go back and change any section before submitting."
        />
        <CardBody className="space-y-8">
          {sections.map((section) => (
            <section key={section.stepSlug} className="print-break-inside-avoid">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
                <h3 className="text-base">{section.title}</h3>
                <Link
                  href={`/apply/${section.stepSlug}`}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-4 no-print"
                >
                  <Pencil aria-hidden className="size-3.5" />
                  Edit
                  <span className="sr-only"> {section.title}</span>
                </Link>
              </div>

              <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {section.items.map((item) => (
                  <div key={item.label} className="min-w-0">
                    <dt className="text-sm text-muted">{item.label}</dt>
                    <dd className="break-words font-medium text-ink">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Consent" description="Please review and agree to complete your registration." />
        <CardBody className="space-y-3">
          {CONSENT_COPY.map((consent) => (
            <div key={consent.key} id={`field-${consent.key}`}>
              <Checkbox
                checked={consents[consent.key]}
                onChange={(checked) => {
                  setConsents((c) => ({ ...c, [consent.key]: checked }))
                  setErrors((e) => {
                    if (!e[consent.key]) return e
                    const next = { ...e }
                    delete next[consent.key]
                    return next
                  })
                }}
                invalid={Boolean(errors[consent.key])}
                label={consent.label}
              />
              {errors[consent.key] && (
                <p className="mt-1 text-sm font-medium text-danger">{errors[consent.key]}</p>
              )}
            </div>
          ))}
          <p className="text-xs text-muted">
            Terms and privacy links open in a new tab, so nothing you have entered is lost.
          </p>
        </CardBody>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/apply/motivation"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill border border-ink px-6 py-3 font-display text-sm font-bold uppercase text-ink hover:bg-ink hover:text-white"
        >
          Previous
        </Link>

        <Button type="submit" size="lg" isLoading={pending}>
          {!pending && <Send aria-hidden className="size-4" />}
          {pending ? 'Submitting…' : 'Submit registration'}
        </Button>
      </div>
    </form>
  )
}
