import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * One figure. A link whenever a view exists that resolves it — the rule the
 * whole dashboard is built on — and, where a percentage is shown, the
 * denominator is named right under it. A reader should never have to guess
 * "percent of what?".
 */
export function Metric({
  label,
  value,
  href,
  tone,
  percent,
  percentOfLabel,
}: {
  label: string
  value: number
  href?: string
  tone?: 'success' | 'warning' | 'danger'
  /** Whole percent, or null for "N/A" (zero denominator). Omit to hide. */
  percent?: number | null
  /** Names the denominator, e.g. "of invited". Required when percent is set. */
  percentOfLabel?: string
}) {
  const colour =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'danger'
          ? 'text-danger'
          : 'text-ink'

  const body = (
    <>
      <span className="block text-xs uppercase tracking-wide text-muted">{label}</span>
      <span className={cn('mt-0.5 block font-display text-2xl font-bold tabular-nums', colour)}>
        {value}
      </span>
      {percent !== undefined && (
        <span className="block text-xs tabular-nums text-muted">
          {percent === null ? 'N/A' : `${percent}%`} {percentOfLabel}
        </span>
      )}
    </>
  )

  return (
    <li>
      {href ? (
        <Link href={href} className="-m-1 block rounded-field p-1 hover:bg-surface-sunken">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  )
}

/**
 * One row of a distribution: a label, a count, and a decorative bar. The
 * link's accessible name carries the figure and says what following it does.
 * Segments that cannot be expressed as a filter stay plain text.
 */
export function DistributionRow({
  label,
  count,
  max,
  href,
  tone = 'primary',
}: {
  label: string
  count: number
  max: number
  href: string | null
  tone?: 'primary' | 'brand'
}) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="font-medium text-ink group-hover:underline">{label}</span>
        <span className="tabular-nums text-muted">{count}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-pill bg-line" role="presentation">
        <div
          className={cn('h-full rounded-pill', tone === 'brand' ? 'bg-brand' : 'bg-primary')}
          style={{ width: `${Math.round((count / max) * 100)}%` }}
        />
      </div>
    </>
  )

  return (
    <li>
      {href ? (
        <Link
          href={href}
          aria-label={`${label}: ${count}. View these volunteers.`}
          className="group block rounded-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  )
}
