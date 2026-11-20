'use client'

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { DiasporaForm, type DiasporaProgress } from '@/components/diaspora/diaspora-form'
import type { DialCountry } from '@/components/diaspora/whatsapp-input'
import { Logo } from '@/components/ui/primitives'
import { gsap, prefersReducedMotion, useIntroTimeline } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { DIASPORA_SECTIONS } from '@/lib/validation/diaspora'

/**
 * The diaspora page as a split screen.
 *
 * On wide screens the empty margins either side of a narrow form become a
 * full-height visual panel — the pattern lululemon, Runway and Luma use for
 * their sign-up pages (Mobbin) — carrying the event, a slow Ken Burns photo,
 * drifting light, and a section tracker that follows the person through the
 * form, as Luma's panel tracks its steps. Phones keep the compact header: there
 * is no spare width there to fill.
 *
 * All motion is GSAP through the shared motion system, and none of it runs
 * under `prefers-reduced-motion`: the panel is then simply a still photograph.
 */
export function DiasporaExperience({ countries, editionName }: { countries: DialCountry[]; editionName: string }) {
  const [progress, setProgress] = useState<DiasporaProgress>({ stage: 'welcome', sectionIndex: 0 })
  const photoRef = useRef<HTMLImageElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)

  // Entrance: the panel's words rise in once, in sequence.
  const introRef = useIntroTimeline<HTMLDivElement>((timeline, scope) => {
    timeline.from(scope.querySelectorAll('[data-intro]'), { y: 24, opacity: 0, duration: 0.9, stagger: 0.12 })
  })

  // Ambient motion: a slow Ken Burns on the photograph and two drifting glows.
  useEffect(() => {
    if (prefersReducedMotion()) return
    const ctx = gsap.context(() => {
      if (photoRef.current) {
        gsap.fromTo(
          photoRef.current,
          { scale: 1.14, xPercent: -2 },
          { scale: 1, xPercent: 2, duration: 24, ease: 'sine.inOut', repeat: -1, yoyo: true },
        )
      }
      gsap.utils.toArray<HTMLElement>('[data-glow]', glowRef.current).forEach((glow, index) => {
        gsap.to(glow, {
          x: index === 0 ? 60 : -50,
          y: index === 0 ? -40 : 50,
          scale: index === 0 ? 1.15 : 0.9,
          duration: 9 + index * 3,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
      })
    })
    return () => ctx.revert()
  }, [])

  const finished = progress.stage === 'review' || progress.stage === 'confirmed'

  return (
    <div className="min-h-dvh bg-surface-sunken lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* --- The visual panel (wide screens) ------------------------------ */}
      <aside className="relative hidden overflow-hidden bg-night text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={photoRef}
          src="/landing/congregation.webp"
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover opacity-45 will-change-transform"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/global-map.webp"
          alt=""
          aria-hidden
          className="absolute inset-x-0 top-1/4 w-full opacity-15 mix-blend-screen"
        />
        <div ref={glowRef} aria-hidden className="pointer-events-none absolute inset-0">
          <div data-glow className="absolute -left-24 top-1/3 size-96 rounded-full bg-primary/35 blur-3xl" />
          <div data-glow className="absolute -right-16 bottom-10 size-80 rounded-full bg-gold/25 blur-3xl" />
        </div>
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-night via-night/70 to-night/30" />

        <div ref={introRef} className="relative flex h-full flex-col justify-between p-10 xl:p-14">
          <div data-intro>
            <Logo inverted subtitle="Diaspora" />
          </div>

          <div className="space-y-5">
            <p data-intro className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">
              {editionName}
            </p>
            <h2 data-intro className="max-w-md font-display text-5xl font-bold uppercase leading-[0.95] text-white xl:text-6xl">
              One praise.
              <br />
              Many nations.
            </h2>
            <p data-intro className="max-w-sm text-base leading-relaxed text-white/80">
              Affirm your centre&apos;s participation in Marathon Messiah&apos;s Praise, wherever in the world you
              gather.
            </p>
          </div>

          <ol data-intro className="space-y-3" aria-label="Form sections">
            {DIASPORA_SECTIONS.map((section, index) => {
              const done = finished || (progress.stage === 'question' && index < progress.sectionIndex)
              const current = progress.stage === 'question' && index === progress.sectionIndex
              return (
                <li key={section} className="flex items-center gap-3" aria-current={current ? 'step' : undefined}>
                  <span
                    className={cn(
                      'flex size-8 items-center justify-center rounded-full border text-xs font-bold transition-all duration-500',
                      done && 'border-gold bg-gold text-night',
                      current && 'scale-110 border-white bg-white text-night shadow-[0_0_24px_rgba(255,255,255,0.35)]',
                      !done && !current && 'border-white/30 text-white/60',
                    )}
                  >
                    {done ? <Check aria-hidden className="size-4" /> : index + 1}
                  </span>
                  <span
                    className={cn(
                      'text-sm transition-colors duration-500',
                      current ? 'font-semibold text-white' : done ? 'text-white/80' : 'text-white/55',
                    )}
                  >
                    {section}
                    {done && <span className="sr-only"> (complete)</span>}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      </aside>

      {/* --- The form ------------------------------------------------------ */}
      <div className="flex min-h-dvh flex-col">
        {/* Compact header for narrow screens, where the panel is hidden. */}
        <header className="relative overflow-hidden bg-night text-white lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/landing/global-map.webp"
            alt=""
            aria-hidden
            className="absolute inset-0 size-full object-cover opacity-30"
          />
          <div className="relative flex flex-col gap-4 px-4 py-6 sm:px-6">
            <Logo inverted subtitle="Diaspora" />
            <p className="text-sm text-white/85">{editionName} · Global participation</p>
          </div>
        </header>

        <main id="main" className="flex flex-1 items-center px-4 py-8 sm:px-6 sm:py-12 lg:px-12 xl:px-20">
          <div className="mx-auto w-full max-w-2xl rounded-card border border-line bg-surface p-5 shadow-card sm:p-8">
            <DiasporaForm countries={countries} onProgress={setProgress} />
          </div>
        </main>

        <footer className="px-4 py-6 text-center text-xs text-muted sm:px-6">
          {`© ${new Date().getFullYear()} MMPraise · Marathon Messiah’s Praise`}
        </footer>
      </div>
    </div>
  )
}
