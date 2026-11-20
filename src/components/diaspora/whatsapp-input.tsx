'use client'

import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { flagEmoji } from '@/lib/validation/diaspora'

export type DialCountry = { name: string; phoneCode: string; iso2: string }

/**
 * A WhatsApp number: country code and local number in one control.
 *
 * The pattern Revolut, Uber and Delphi use — the dial code is a prefix inside
 * the field, not a separate question — so people read it as one number. The
 * prefix is a real <select>, transparent over the flag and code, which keeps
 * the native picker (searchable by typing, full-screen on phones) and its
 * accessibility while showing only "🇬🇧 +44".
 */
export function WhatsAppInput({
  id,
  countries,
  dialIso,
  local,
  placeholder,
  invalid,
  describedBy,
  onDialChange,
  onLocalChange,
}: {
  id: string
  countries: DialCountry[]
  dialIso: string
  local: string
  placeholder: string
  invalid: boolean
  describedBy?: string
  onDialChange: (iso2: string) => void
  onLocalChange: (local: string) => void
}) {
  const selected = countries.find((c) => c.iso2 === dialIso)

  return (
    <div
      className={cn(
        'flex min-h-12 items-stretch overflow-hidden rounded-field border bg-surface transition-colors focus-within:ring-2 focus-within:ring-primary/25',
        invalid ? 'border-danger' : 'border-line-strong hover:border-muted focus-within:border-primary',
      )}
    >
      <div className="relative flex shrink-0 items-center gap-1.5 border-r border-line bg-surface-sunken px-3 text-base text-ink">
        <span aria-hidden>{flagEmoji(selected?.iso2) || '🌐'}</span>
        <span aria-hidden className="tabular-nums">{selected ? `+${selected.phoneCode}` : 'Code'}</span>
        <ChevronDown aria-hidden className="size-4 text-muted" />
        <select
          aria-label="Country code"
          value={dialIso}
          onChange={(event) => onDialChange(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          <option value="">Choose a country code</option>
          {countries.map((country) => (
            <option key={country.iso2} value={country.iso2}>
              {country.name} (+{country.phoneCode})
            </option>
          ))}
        </select>
      </div>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={local}
        placeholder={placeholder}
        onChange={(event) => onLocalChange(event.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="min-w-0 flex-1 bg-transparent px-4 text-base text-ink placeholder:text-muted/70 focus:outline-none"
      />
    </div>
  )
}
