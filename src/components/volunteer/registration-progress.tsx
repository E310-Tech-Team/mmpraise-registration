'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { buttonClass } from '@/components/ui/primitives'
import { ensureScrollTrigger, gsap, prefersReducedMotion } from '@/lib/motion'
import { WIZARD_STEPS } from '@/lib/validation/registration'
import { cn } from '@/lib/utils'

/**
 * How far through the registration a volunteer is, and what remains.
 *
 * The old dashboard said only "your registration is still a draft", which is
 * equally true of someone who has typed their first name and someone who is one
 * click from submitting. A bar, a percentage, the section they are on and the
 * one after it turn an unbounded task into a countable one — which is the
 * difference between coming back to it and not.
 *
 * `completedSteps` is derived from the application's `currentStep`, which the
 * wizard advances only once a step has passed validation. The figure is
 * therefore what has actually been saved, never what has merely been visited.
 */
export function RegistrationProgress({
  completedSteps,
  nextStepSlug,
  started,
}: {
  completedSteps: number
  /** Where "continue" goes — the first section not yet finished. */
  nextStepSlug: string
  /** False when the volunteer has not entered anything at all. */
  started: boolean
}) {
  const total = WIZARD_STEPS.length
  const done = Math.max(0, Math.min(total, completedSteps))
  const target = Math.round((done / total) * 100)
  const remaining = total - done

  const current = WIZARD_STEPS.find((s) => s.number === done + 1) ?? null
  const upNext = WIZARD_STEPS.find((s) => s.number === done + 2) ?? null

  const { ref, shown } = useProgressCountUp(target)

  return (
    <div ref={ref}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-sm font-bold uppercase tracking-wide text-ink">
          {done} of {total} sections complete
        </p>
        {/*
          `aria-hidden` on the counting number: it changes ~60 times during the
          animation, and the progressbar below already carries the same figure
          as an accessible value that is announced once.
        */}
        <p aria-hidden className="text-sm tabular-nums text-muted">
          {shown}%
        </p>
      </div>

      <Progress
        className="mt-3 h-2"
        value={done}
        max={total}
        label={`Registration sections complete: ${done} of ${total}, ${target} per cent`}
        barClassName={done === 0 ? 'bg-line-strong' : undefined}
        displayPercent={shown}
      />

      {current && (
        <>
          <Separator className="mt-6" />
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">You are on</dt>
              <dd className="mt-1 font-display font-bold uppercase text-ink">
                Section {current.number} · {current.title}
              </dd>
              <dd className="text-sm text-muted">{current.description}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Up next</dt>
              <dd className="mt-1 font-display font-bold uppercase text-body">
                {upNext ? `Section ${upNext.number} · ${upNext.title}` : 'Review and submit'}
              </dd>
              <dd className="text-sm text-muted">
                {upNext ? upNext.description : 'Check your answers, then send your application.'}
              </dd>
            </div>
          </dl>
        </>
      )}

      <ol className="mt-6 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {WIZARD_STEPS.map((step) => {
          const isComplete = step.number <= done
          const isCurrent = step.number === done + 1
          // Only sections already reached are navigable; the wizard redirects
          // anyone who jumps ahead, and a link that bounces is worse than none.
          const isReachable = step.number <= done + 1

          const inner = (
            <>
              <span
                aria-hidden
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-[0.6875rem] font-bold',
                  isComplete && 'border-success bg-success text-white',
                  !isComplete && isCurrent && 'border-primary bg-primary text-white',
                  !isComplete && !isCurrent && 'border-line-strong text-muted',
                )}
              >
                {isComplete ? <Check className="size-3.5" /> : step.number}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    'block truncate text-sm font-semibold',
                    isComplete || isCurrent ? 'text-ink' : 'text-muted',
                  )}
                >
                  {step.title}
                </span>
              </span>
              <span className="sr-only">
                {isComplete ? '— complete.' : isCurrent ? '— next.' : '— not started.'}
              </span>
            </>
          )

          return (
            <li key={step.slug}>
              {isReachable ? (
                <Link
                  href={`/apply/${step.slug}`}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-field px-2 py-1.5 hover:bg-surface-sunken',
                    isCurrent && 'bg-primary-subtle hover:bg-primary-subtle',
                  )}
                >
                  {inner}
                </Link>
              ) : (
                <span aria-disabled className="flex min-h-11 items-center gap-3 px-2 py-1.5 opacity-70">
                  {inner}
                </span>
              )}
            </li>
          )
        })}
      </ol>

      <div className="mt-6">
        <Link href={`/apply/${nextStepSlug}`} className={buttonClass({ size: 'lg' })}>
          {started ? 'Confirm your availability' : 'Start your registration'}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
        <p className="mt-3 text-sm text-muted">
          {remaining === 0
            ? 'Every section is complete. Review your answers and submit.'
            : `${remaining} ${remaining === 1 ? 'section' : 'sections'} left. Your answers are saved as you go, so you can stop and come back.`}
        </p>
      </div>
    </div>
  )
}

/**
 * Count the bar and the percentage up together, once, when they scroll into
 * view.
 *
 * The rendered value starts at the real figure, so the correct number is in the
 * HTML from the first frame — for a crawler, for a reader with JavaScript off,
 * and for anyone who prefers reduced motion, where the tween never runs at all.
 * GSAP only takes over after it has confirmed it should.
 */
function useProgressCountUp(target: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(target)

  useEffect(() => {
    const element = ref.current
    if (!element || prefersReducedMotion() || target === 0) return

    ensureScrollTrigger()

    const ctx = gsap.context(() => {
      const counter = { value: 0 }
      gsap.to(counter, {
        value: target,
        duration: 1.1,
        ease: 'power2.out',
        onUpdate: () => setShown(Math.round(counter.value)),
        scrollTrigger: { trigger: element, start: 'top 90%', once: true },
      })
    }, element)

    return () => {
      ctx.revert()
      // The tween is gone; never leave the bar stranded mid-count.
      setShown(target)
    }
  }, [target])

  return { ref, shown }
}
