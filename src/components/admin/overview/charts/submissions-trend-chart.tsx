'use client'

import { useRouter } from 'next/navigation'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_COLORS, ChartDataTable, ChartEmpty, ChartTooltip } from './chart-kit'

export type TrendPoint = {
  /** Monday of the week, Lagos time, yyyy-mm-dd. */
  weekStart: string
  count: number
}

function weekLabel(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00+01:00`)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Lagos',
  })
}

function weekHref(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00+01:00`)
  const end = new Date(start.getTime() + 6 * 86_400_000)
  const endDate = end.toISOString().slice(0, 10)
  return `/admin/applications?submittedFrom=${weekStart}&submittedTo=${endDate}`
}

/**
 * Submissions per Lagos week, zero weeks included — a quiet fortnight renders
 * as two empty columns, not as weeks that silently vanish. Click a column (or
 * use the table) to open exactly that week's applications.
 */
export function SubmissionsTrendChart({ data }: { data: TrendPoint[] }) {
  const router = useRouter()
  const total = data.reduce((sum, point) => sum + point.count, 0)

  if (data.length === 0) {
    return <ChartEmpty>No submissions recorded yet.</ChartEmpty>
  }

  return (
    <div>
      <div aria-hidden className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart accessibilityLayer={false} data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <XAxis
              dataKey="weekStart"
              tickFormatter={weekLabel}
              tick={{ fontSize: 11, fill: CHART_COLORS.muted }}
              axisLine={{ stroke: CHART_COLORS.line }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: CHART_COLORS.muted }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: CHART_COLORS.line, opacity: 0.4 }}
              content={({ active, payload }) => (
                <ChartTooltip
                  active={active}
                  label={
                    payload?.[0] ? `Week of ${weekLabel(String(payload[0].payload.weekStart))}` : undefined
                  }
                  rows={
                    payload?.[0]
                      ? [{ name: 'Submitted', value: String(payload[0].value), tone: 'primary' }]
                      : []
                  }
                />
              )}
            />
            <Bar
              dataKey="count"
              fill={CHART_COLORS.primary}
              radius={[3, 3, 0, 0]}
              className="cursor-pointer"
              onClick={(entry) => {
                const weekStart = (entry as unknown as { weekStart?: string }).weekStart
                if (weekStart) router.push(weekHref(weekStart))
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="sr-only">
        {total} application{total === 1 ? '' : 's'} submitted in the last {data.length} weeks.
      </p>
      <ChartDataTable
        caption={`Applications submitted per week (last ${data.length} weeks, Lagos time)`}
        columns={['Week starting', 'Submitted']}
        rows={data.map((point) => ({
          label: weekLabel(point.weekStart),
          value: String(point.count),
          href: weekHref(point.weekStart),
        }))}
      />
    </div>
  )
}
