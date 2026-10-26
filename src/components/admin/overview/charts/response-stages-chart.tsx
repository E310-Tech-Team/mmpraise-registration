'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_COLORS, ChartDataTable, ChartEmpty, ChartTooltip, type ChartTone } from './chart-kit'

export type StageSlice = {
  key: string
  label: string
  count: number
  tone: ChartTone
  href: string
}

/**
 * Where every previous participant stands, as one 100%-stacked bar.
 *
 * The stages are **current states that partition the population** — each
 * person appears in exactly one segment, so the segments genuinely sum to the
 * total. Deliberately not drawn as a funnel: these are not ordered events
 * (someone can confirm without ever being invited), and funnel geometry would
 * imply a sequence the data does not have.
 */
export function ResponseStagesChart({ slices, total }: { slices: StageSlice[]; total: number }) {
  const router = useRouter()

  if (total === 0) {
    return <ChartEmpty>No previous participants have been imported yet.</ChartEmpty>
  }

  const row = Object.fromEntries(slices.map((slice) => [slice.key, slice.count]))
  const percent = (count: number) => Math.round((count / total) * 100)

  return (
    <div>
      <div aria-hidden className="h-16">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart accessibilityLayer={false} data={[{ name: 'stages', ...row }]} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <XAxis type="number" hide domain={[0, total]} />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip
              cursor={false}
              content={({ active }) => (
                <ChartTooltip
                  active={active}
                  rows={slices
                    .filter((slice) => slice.count > 0)
                    .map((slice) => ({
                      name: slice.label,
                      value: `${slice.count} (${percent(slice.count)}%)`,
                      tone: slice.tone,
                    }))}
                />
              )}
            />
            {slices.map((slice, index) => (
              <Bar
                key={slice.key}
                dataKey={slice.key}
                stackId="stages"
                fill={CHART_COLORS[slice.tone]}
                radius={
                  index === 0
                    ? [4, 0, 0, 4]
                    : index === slices.length - 1
                      ? [0, 4, 4, 0]
                      : undefined
                }
                className="cursor-pointer"
                onClick={() => router.push(slice.href)}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 space-y-1">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 rounded-pill"
              style={{ background: CHART_COLORS[slice.tone] }}
            />
            <Link
              href={slice.href}
              className="min-w-0 truncate text-body underline-offset-2 hover:underline"
            >
              {slice.label}
            </Link>
            <span className="ml-auto tabular-nums text-muted">
              {slice.count} · {percent(slice.count)}%
            </span>
          </li>
        ))}
      </ul>

      <ChartDataTable
        caption="Previous participants by response stage"
        columns={['Stage', 'People']}
        rows={slices.map((slice) => ({
          label: slice.label,
          value: `${slice.count} (${percent(slice.count)}%)`,
          href: slice.href,
        }))}
      />
    </div>
  )
}
