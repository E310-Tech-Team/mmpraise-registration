import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge conditional class names, letting later Tailwind utilities win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a date for display, stable across server and client rendering.
 *
 * Africa/Lagos (WAT, UTC+1, no DST) — the organisation's own clock, matching
 * the event formatters in src/config/site.ts. This used to pin UTC, so every
 * admin timestamp read an hour early with no label saying so; times now carry
 * "WAT" so nobody has to guess whose midnight a date means.
 */
export function formatDate(value: Date | string | null | undefined, withTime = false) {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  const formatted = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'Africa/Lagos',
  }).format(date)
  return withTime ? `${formatted} WAT` : formatted
}

/** Turn an enum-ish constant into readable text: AGE_21_25 -> "21–25". */
export function humanise(value: string | null | undefined) {
  if (!value) return '—'
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function initials(firstName?: string | null, lastName?: string | null) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?'
}

/** Debounce helper for search inputs. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
