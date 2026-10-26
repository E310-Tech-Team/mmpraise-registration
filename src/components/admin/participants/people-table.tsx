'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/primitives'
import { formatDate } from '@/lib/utils'
import { ContactLogDialog } from './contact-log-dialog'

export type PersonRow = {
  id: string
  name: string
  email: string
  phone: string | null
  mmpCode: string | null
  editions: string[]
  previousDepartments: string[]
  stage: string
  stageLabel: string
  stageTone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'
  invitedAt: string | null
  profileReviewedAt: string | null
  lastContact: {
    outcome: string
    outcomeLabel: string
    contactedAt: string
    nextFollowUpAt: string | null
  } | null
}

/**
 * The person-level table, with explicit selection semantics.
 *
 * Ticked rows and "everyone matching the filters" are different intents with
 * different counts; the bulk bar states which one is armed and exactly how
 * many people it covers. Only this page's rows ever reach the browser —
 * selecting the whole filtered set sends the *filters*, not 14,000 ids.
 */
export function PeopleTable({
  rows,
  total,
  filters,
  canFollowUp,
}: {
  rows: PersonRow[]
  total: number
  filters: Record<string, string>
  canFollowUp: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const allOnPage = rows.length > 0 && rows.every((row) => selected.has(row.id))

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePage() {
    setSelected((current) => {
      if (allOnPage) {
        const next = new Set(current)
        for (const row of rows) next.delete(row.id)
        return next
      }
      return new Set([...current, ...rows.map((row) => row.id)])
    })
  }

  return (
    <div className="space-y-3">
      {canFollowUp && (
        <div className="flex flex-wrap items-center gap-3">
          {selected.size > 0 && (
            <ContactLogDialog
              selection={{ mode: 'ids', ids: [...selected] }}
              triggerLabel={`Log contact — ${selected.size} selected`}
              triggerVariant="secondary"
            />
          )}
          {total > 0 && (
            <ContactLogDialog
              selection={{ mode: 'filter', filters, total }}
              triggerLabel={`Log contact — all ${total} matching`}
            />
          )}
          {selected.size > 0 && (
            <button
              type="button"
              className="text-sm text-muted underline-offset-2 hover:underline"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </button>
          )}
        </div>
      )}

      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
          <caption className="sr-only">Previous participants</caption>
          <thead>
            <tr className="border-b border-line bg-surface-sunken">
              {canFollowUp && (
                <th scope="col" className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select every row on this page"
                    checked={allOnPage}
                    onChange={togglePage}
                    className="size-4 accent-[var(--color-primary)]"
                  />
                </th>
              )}
              <Th>Person</Th>
              <Th>Served</Th>
              <Th>Stage</Th>
              <Th>Invited</Th>
              <Th>Last contact</Th>
              <Th>Next follow-up</Th>
              {canFollowUp && <Th>Log</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0 hover:bg-surface-sunken">
                {canFollowUp && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.name}`}
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      className="size-4 accent-[var(--color-primary)]"
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/previous-participants/people/${row.id}`}
                    className="font-medium text-ink underline-offset-2 hover:underline"
                  >
                    {row.name}
                  </Link>
                  <p className="text-xs text-muted">
                    {row.mmpCode ? `${row.mmpCode} · ` : ''}
                    {row.email}
                    {row.phone ? ` · ${row.phone}` : ''}
                  </p>
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {row.editions.join(', ') || '—'}
                  {row.previousDepartments.length > 0 && (
                    <span className="block">{row.previousDepartments.join(', ')}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={row.stageTone}>{row.stageLabel}</Badge>
                  {row.profileReviewedAt && (
                    <span className="mt-1 block text-xs text-muted">Profile reviewed</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {row.invitedAt ? formatDate(row.invitedAt) : 'Never'}
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {row.lastContact ? (
                    <>
                      {row.lastContact.outcomeLabel}
                      <span className="block">{formatDate(row.lastContact.contactedAt)}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {row.lastContact?.nextFollowUpAt
                    ? formatDate(row.lastContact.nextFollowUpAt, true)
                    : '—'}
                </td>
                {canFollowUp && (
                  <td className="px-4 py-3">
                    <ContactLogDialog
                      selection={{ mode: 'single', userId: row.id, name: row.name }}
                      triggerLabel="Log"
                      triggerVariant="ghost"
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="px-4 py-3 font-display text-xs font-bold uppercase tracking-wide text-ink">
      {children}
    </th>
  )
}
