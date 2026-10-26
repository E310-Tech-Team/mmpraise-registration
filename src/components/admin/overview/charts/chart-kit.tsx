'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'

/**
 * Shared chart plumbing, in the shadcn chart spirit but skinned entirely with
 * this project's tokens (the shadcn CSS variables do not exist here).
 *
 * Three rules every chart in this folder follows:
 *  - the SVG is `aria-hidden` decoration; the *data* is always also present as
 *    a disclosure table whose rows are real links — the keyboard and
 *    screen-reader path, and the drill-down of record;
 *  - colours come from the status tokens, so "approved is success-green"
 *    holds on every chart (contrast is unit-tested in contrast.test.ts);
 *  - clicking a mark navigates to the same URL its table row links to.
 */
export const CHART_COLORS = {
  primary: 'var(--color-primary)',
  brand: 'var(--color-brand)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  info: 'var(--color-info)',
  muted: 'var(--color-muted)',
  line: 'var(--color-line)',
} as const

export type ChartTone = keyof typeof CHART_COLORS

/** Recharts tooltip body, styled like the rest of the admin. */
export function ChartTooltip({
  active,
  label,
  rows,
}: {
  active?: boolean
  label?: ReactNode
  rows: { name: string; value: ReactNode; tone?: ChartTone }[]
}) {
  if (!active || rows.length === 0) return null
  return (
    <div className="rounded-field border border-line bg-surface px-3 py-2 text-sm shadow-[var(--shadow-card)]">
      {label && <p className="mb-1 font-semibold text-ink">{label}</p>}
      {rows.map((row) => (
        <p key={row.name} className="flex items-center gap-2 text-body">
          {row.tone && (
            <span
              aria-hidden
              className="inline-block size-2 rounded-pill"
              style={{ background: CHART_COLORS[row.tone] }}
            />
          )}
          <span>{row.name}</span>
          <span className="ml-auto pl-4 tabular-nums">{row.value}</span>
        </p>
      ))}
    </div>
  )
}

/**
 * The accessible substrate under every chart: the same data as a table whose
 * rows link to the same records the marks do. Open by keyboard, screen
 * readers read it, and "View records" never depends on a pointer.
 */
export function ChartDataTable({
  caption,
  columns,
  rows,
}: {
  caption: string
  columns: [string, string]
  rows: { label: string; value: string; href: string | null }[]
}) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-muted hover:text-body">
        View as table
      </summary>
      <div className="relative mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-1.5 pr-3 text-xs font-semibold uppercase text-muted">
                {columns[0]}
              </th>
              <th scope="col" className="py-1.5 text-xs font-semibold uppercase text-muted">
                {columns[1]}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-3 text-body">
                  {row.href ? (
                    <Link href={row.href} className="underline-offset-2 hover:underline">
                      {row.label}
                    </Link>
                  ) : (
                    row.label
                  )}
                </td>
                <td className="py-1.5 tabular-nums text-body">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

/** The empty state every chart shows instead of an axes-only husk. */
export function ChartEmpty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>
}
