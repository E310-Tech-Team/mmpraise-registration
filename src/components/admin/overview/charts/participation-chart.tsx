'use client'

import { useRouter } from 'next/navigation'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_COLORS, ChartDataTable, ChartEmpty, ChartTooltip, type ChartTone } from './chart-kit'

export type ParticipationRow = {
  key: string
  label: string
  count: number
  tone: ChartTone
  href: string
}

/**
 * This edition's participation, as horizontal bars — mutually exclusive
 * statuses within the confirmed population, with Withdrawn drawn in its own
 * (danger) tone beneath them. Click a bar or its table row for the people.
 */
export function ParticipationChart({ rows }: { rows: ParticipationRow[] }) {
  const router = useRouter()
  const total = rows.reduce((sum, row) => sum + row.count, 0)

  if (total === 0) {
    return <ChartEmpty>Nobody has confirmed for this edition yet.</ChartEmpty>
  }

  return (
    <div>
      <div aria-hidden style={{ height: rows.length * 36 + 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart accessibilityLayer={false} data={rows} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 8 }}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={150}
              tick={{ fontSize: 12, fill: CHART_COLORS.muted }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: CHART_COLORS.line, opacity: 0.4 }}
              content={({ active, payload }) => (
                <ChartTooltip
                  active={active}
                  rows={
                    payload?.[0]
                      ? [
                          {
                            name: String(payload[0].payload.label),
                            value: String(payload[0].value),
                            tone: payload[0].payload.tone as ChartTone,
                          },
                        ]
                      : []
                  }
                />
              )}
            />
            <Bar
              dataKey="count"
              radius={[0, 3, 3, 0]}
              className="cursor-pointer"
              label={{ position: 'right', fontSize: 11, fill: CHART_COLORS.muted }}
              onClick={(entry) => {
                const href = (entry as unknown as { href?: string }).href
                if (href) router.push(href)
              }}
            >
              {rows.map((row) => (
                <Cell key={row.key} fill={CHART_COLORS[row.tone]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ChartDataTable
        caption="This edition's participation by status"
        columns={['Status', 'People']}
        rows={rows.map((row) => ({ label: row.label, value: String(row.count), href: row.href }))}
      />
    </div>
  )
}
