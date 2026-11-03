'use client'

import { useSyncExternalStore } from 'react'
import { CalendarClock, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Compact event details for the authentication screens.
 *
 * Deliberately *not* the four-unit countdown. The task on these pages is to
 * sign in or create an account; a large ticking clock competes with the form
 * for attention and pushes it down the page. This states the edition, the date
 * and — once mounted — a single days-remaining figure, and stops there.
 *
 * The days figure is the only value that changes, and it changes once a day,
 * so there is no ticking and nothing for a screen reader to be interrupted by.
 */

/**
 * Days remaining, recomputed on an hourly tick.
 *
 * `useSyncExternalStore` gives a defined server snapshot — null — so the server
 * and the first client render agree and there is no hydration mismatch. The
 * figure appears once the client knows the real time.
 */
let cachedNowMs: number | null = null

function getSnapshot(): number {
  if (cachedNowMs === null) {
    cachedNowMs = Date.now()
  }
  return cachedNowMs
}

const getServerSnapshot = (): null => null

function subscribeHourly(onChange: () => void) {
  const timer = setInterval(() => {
    cachedNowMs = Date.now()
    onChange()
  }, 3_600_000)
  return () => clearInterval(timer)
}

function useDaysUntil(iso: string | null): number | null {
  const nowMs = useSyncExternalStore(
    subscribeHourly,
    getSnapshot,
    getServerSnapshot,
  )

  if (!iso || nowMs === null) return null
  const start = new Date(iso).getTime()
  if (Number.isNaN(start)) return null

  const diff = start - nowMs
  // Never negative: once the event has begun there are no days remaining.
  if (diff <= 0) return 0
  return Math.ceil(diff / 86_400_000)
}

export function EventPanel({
  editionName,
  edition,
  dateTimeLabel,
  venue,
  startsAtIso,
  summary,
  className,
  onDark = false,
}: {
  /** "85 Hours Marathon Messiah's Praise" */
  editionName: string
  /** "2027" */
  edition: string
  /** "1 March 2027 · 2:00 AM WAT" */
  dateTimeLabel: string
  venue: string
  startsAtIso: string | null
  /** The full sentence, read by assistive technology instead of the fragments. */
  summary: string
  className?: string
  onDark?: boolean
}) {
  const days = useDaysUntil(startsAtIso)

  return (
    <div
      className={cn(
        'rounded-card border p-4',
        onDark ? 'border-white/15 bg-white/5' : 'border-line bg-surface-sunken',
        className,
      )}
    >
      {/* One sentence for assistive technology; the fragments below are visual. */}
      <p className="sr-only">{summary}</p>

      <p
        aria-hidden
        className={cn(
          'font-display text-sm font-bold uppercase tracking-wide',
          onDark ? 'text-gold' : 'text-primary-active',
        )}
      >
        {editionName} {edition}
      </p>

      <p
        aria-hidden
        className={cn('mt-2 flex items-center gap-2 text-sm', onDark ? 'text-white/85' : 'text-body')}
      >
        <CalendarClock className="size-4 shrink-0" />
        {dateTimeLabel}
      </p>

      <p
        aria-hidden
        className={cn('mt-1 flex items-center gap-2 text-sm', onDark ? 'text-white/70' : 'text-muted')}
      >
        <MapPin className="size-4 shrink-0" />
        {venue}
      </p>

      {days !== null && days > 0 && (
        <p
          aria-hidden
          className={cn(
            'mt-3 border-t pt-3 text-sm font-semibold tabular-nums',
            onDark ? 'border-white/15 text-white' : 'border-line text-ink',
          )}
        >
          {days} {days === 1 ? 'day' : 'days'} to go
        </p>
      )}
    </div>
  )
}
