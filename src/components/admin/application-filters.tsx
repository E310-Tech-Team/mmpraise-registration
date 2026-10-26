'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { Button, Spinner } from '@/components/ui/primitives'
import { SelectInput } from '@/components/ui/form'
import { STATUS_LABELS } from '@/lib/applications/status'
import { AGE_RANGES } from '@/lib/validation/registration'
import type { ApplicationStatus } from '@/generated/prisma/enums'

type Option = { id: string; name: string }

/**
 * Filter bar for the applicant table.
 *
 * State lives in the URL so a filtered view can be bookmarked, shared with a
 * colleague, and used by the export links without a second source of truth.
 * The free-text search is debounced to avoid a query per keystroke.
 */
const STATUSES: ApplicationStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'WAITLISTED',
  'REJECTED',
  'ASSIGNED',
  'CHECKED_IN',
  'COMPLETED',
]

export function ApplicationFilters({
  departments,
  countries,
  regions,
  states,
  provinces,
}: {
  departments: Option[]
  countries: Option[]
  regions: Option[]
  /*
   * Cascading, and empty until their parent is chosen.
   *
   * There are thousands of states and hundreds of provinces across every
   * country and region; listing them all would be a scroll, not a filter.
   * Both are fetched on the server for the chosen parent, so the dropdown only
   * ever offers values that can actually return rows.
   */
  states: Option[]
  provinces: Option[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const firstRender = useRef(true)

  const current = useMemo(
    () => ({
      status: searchParams.get('status') ?? 'all',
      departmentId: searchParams.get('departmentId') ?? 'all',
      countryId: searchParams.get('countryId') ?? 'all',
      stateId: searchParams.get('stateId') ?? 'all',
      churchRegionId: searchParams.get('churchRegionId') ?? 'all',
      churchProvinceId: searchParams.get('churchProvinceId') ?? 'all',
      ageRange: searchParams.get('ageRange') ?? 'all',
      confirmed: searchParams.get('confirmed') ?? 'all',
      participation: searchParams.get('participation') ?? 'all',
    }),
    [searchParams],
  )

  function apply(changes: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === 'all') params.delete(key)
      else params.set(key, value)
    }
    // Any filter change invalidates the current page number.
    params.delete('page')
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }))
  }

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => apply({ q: query }), 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const hasFilters =
    query || Object.values(current).some((value) => value !== 'all')

  return (
    <div className="space-y-4 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <label htmlFor="admin-search" className="mb-1 block text-sm font-semibold text-ink">
            Search
          </label>
          <div className="relative">
            <Search aria-hidden className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              id="admin-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, email, phone or MMP number"
              className="min-h-11 w-full rounded-field border border-line-strong bg-surface pl-9 pr-3 text-base text-body placeholder:text-muted/70 focus:border-primary"
            />
          </div>
        </div>

        {pending && <Spinner className="mb-3 size-4 text-primary" />}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Filter label="Status" id="filter-status" value={current.status} onChange={(v) => apply({ status: v })}>
          <option value="all">All statuses</option>
          {/* The dashboard's combined queue, selectable here so its link round-trips. */}
          <option value="SUBMITTED,UNDER_REVIEW">Awaiting review (both)</option>
          <option value="DRAFT">In progress (draft)</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </Filter>

        <Filter
          label="This edition"
          id="filter-confirmed"
          value={
            current.participation !== 'all'
              ? `p:${current.participation}`
              : current.confirmed !== 'all'
                ? `c:${current.confirmed}`
                : 'all'
          }
          onChange={(v) => {
            if (v === 'all') apply({ confirmed: 'all', participation: 'all' })
            else if (v.startsWith('c:')) apply({ confirmed: v.slice(2), participation: 'all' })
            else apply({ participation: v.slice(2), confirmed: v.slice(2) === 'WITHDRAWN' ? 'all' : '1' })
          }}
        >
          <option value="all">Any participation</option>
          <option value="c:1">Confirmed</option>
          <option value="c:0">Not confirmed</option>
          <option value="p:SIGNED_UP">Confirmed · signed up</option>
          <option value="p:ASSIGNED">Confirmed · assigned to shifts</option>
          <option value="p:CHECKED_IN">Confirmed · checked in</option>
          <option value="p:COMPLETED">Confirmed · completed</option>
          <option value="p:WITHDRAWN">Withdrawn</option>
        </Filter>

        <Filter
          label="Department"
          id="filter-department"
          value={current.departmentId}
          onChange={(v) => apply({ departmentId: v })}
        >
          <option value="all">All departments</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Filter>

        <Filter
          label="Country"
          id="filter-country"
          value={current.countryId}
          // Clearing the child matters: a state from the previous country
          // would filter to nothing and look like an empty result set.
          onChange={(v) => apply({ countryId: v, stateId: 'all' })}
        >
          <option value="all">All countries</option>
          {countries.map((country) => (
            <option key={country.id} value={country.id}>
              {country.name}
            </option>
          ))}
        </Filter>

        {/* Only offered once a country narrows it to a usable list. */}
        {states.length > 0 && (
          <Filter
            label="State/Province"
            id="filter-state"
            value={current.stateId}
            onChange={(v) => apply({ stateId: v })}
          >
            <option value="all">All states</option>
            {states.map((state) => (
              <option key={state.id} value={state.id}>
                {state.name}
              </option>
            ))}
          </Filter>
        )}

        <Filter
          label="RCCG region"
          id="filter-region"
          value={current.churchRegionId}
          onChange={(v) => apply({ churchRegionId: v, churchProvinceId: 'all' })}
        >
          <option value="all">All regions</option>
          {regions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.name}
            </option>
          ))}
        </Filter>

        {/* Same rule as State: only once a region narrows it. */}
        {provinces.length > 0 && (
          <Filter
            label="RCCG province"
            id="filter-province"
            value={current.churchProvinceId}
            onChange={(v) => apply({ churchProvinceId: v })}
          >
            <option value="all">All provinces</option>
            {provinces.map((province) => (
              <option key={province.id} value={province.id}>
                {province.name}
              </option>
            ))}
          </Filter>
        )}

        <Filter label="Age range" id="filter-age" value={current.ageRange} onChange={(v) => apply({ ageRange: v })}>
          <option value="all">All ages</option>
          {AGE_RANGES.map((range) => (
            <option key={range.value} value={range.value}>
              {range.label}
            </option>
          ))}
        </Filter>
      </div>

      {hasFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setQuery('')
            startTransition(() => router.replace(pathname, { scroll: false }))
          }}
        >
          <X aria-hidden className="size-4" />
          Clear filters
        </Button>
      )}
    </div>
  )
}

function Filter({
  label,
  id,
  value,
  onChange,
  children,
}: {
  label: string
  id: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink">
        {label}
      </label>
      <SelectInput id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </SelectInput>
    </div>
  )
}
