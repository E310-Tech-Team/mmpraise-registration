'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ComboboxOption = { value: string; label: string; hint?: string }

/**
 * Searchable single-select, built to the WAI-ARIA combobox pattern
 * (editable input + popup listbox).
 *
 * Used for long lists — countries, states, RCCG provinces, parishes — where a
 * plain <select> becomes unusable. Keyboard support: type to filter, Up/Down to
 * move, Home/End to jump, Enter to choose, Escape to close, Tab to leave.
 *
 * Options can be supplied up front or fetched on demand via `onSearch`, so the
 * initial page never has to download every reference record.
 */
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = 'Search…',
  invalid,
  disabled,
  loading = false,
  emptyMessage = 'No matches found',
  describedBy,
  onSearch,
  allowClear = true,
  name,
}: {
  id: string
  options: ComboboxOption[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  invalid?: boolean
  disabled?: boolean
  loading?: boolean
  emptyMessage?: string
  describedBy?: string
  /** Provide for server-side search; omit to filter the supplied options locally. */
  onSearch?: (query: string) => void
  allowClear?: boolean
  name?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = `${useId()}-listbox`

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value])

  const filtered = useMemo(() => {
    if (onSearch || !query.trim()) return options
    const q = query.trim().toLowerCase()
    // Prefix matches first — typing "ni" should surface Nigeria before Benin.
    const starts: ComboboxOption[] = []
    const contains: ComboboxOption[] = []
    for (const option of options) {
      const label = option.label.toLowerCase()
      if (label.startsWith(q)) starts.push(option)
      else if (label.includes(q)) contains.push(option)
    }
    return [...starts, ...contains]
  }, [options, query, onSearch])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  function choose(option: ComboboxOption) {
    onChange(option.value)
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((i) => {
        const next = i + delta
        if (next < 0) return filtered.length - 1
        if (next >= filtered.length) return 0
        return next
      })
      return
    }

    if (event.key === 'Home' && open) {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End' && open) {
      event.preventDefault()
      setActiveIndex(Math.max(0, filtered.length - 1))
    } else if (event.key === 'Enter') {
      if (open && filtered[activeIndex]) {
        event.preventDefault()
        choose(filtered[activeIndex])
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        setOpen(false)
        setQuery('')
      }
    }
  }

  const displayValue = open ? query : (selected?.label ?? '')

  return (
    <div ref={rootRef} className="relative">
      {name && <input type="hidden" name={name} value={value ?? ''} />}

      <div
        className={cn(
          'flex items-center rounded-field border bg-surface transition-colors',
          invalid ? 'border-danger' : 'border-line-strong focus-within:border-primary hover:border-muted',
          disabled && 'bg-surface-sunken',
        )}
      >
        <Search aria-hidden className="ml-3 size-4 shrink-0 text-muted" />
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          disabled={disabled}
          className="min-h-11 w-full bg-transparent px-3 py-3 text-base text-body outline-none placeholder:text-muted/70 disabled:cursor-not-allowed"
          placeholder={selected ? selected.label : placeholder}
          value={displayValue}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            // Reset the highlighted option here rather than in an effect: the
            // filtered list changes with the query, so index 0 is the only
            // sensible position and deriving it avoids a cascading render.
            setActiveIndex(0)
            setOpen(true)
            onSearch?.(event.target.value)
          }}
          onKeyDown={onKeyDown}
        />

        {loading && <Loader2 aria-hidden className="mr-2 size-4 animate-spin text-muted" />}

        {allowClear && selected && !disabled && (
          <button
            type="button"
            onClick={() => {
              onChange(null)
              setQuery('')
              inputRef.current?.focus()
            }}
            className="mr-1 flex size-9 items-center justify-center rounded-field text-muted hover:text-ink"
            aria-label={`Clear selection: ${selected.label}`}
          >
            <X aria-hidden className="size-4" />
          </button>
        )}

        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          disabled={disabled}
          onClick={() => {
            setOpen((o) => !o)
            inputRef.current?.focus()
          }}
          className="mr-2 flex size-8 items-center justify-center text-muted"
        >
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-card border border-line bg-surface py-1 shadow-[var(--shadow-raised)]"
        >
          {loading && filtered.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted">Loading…</li>
          )}

          {!loading && filtered.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted">{emptyMessage}</li>
          )}

          {filtered.map((option, index) => {
            const isSelected = option.value === value
            const isActive = index === activeIndex
            return (
              <li
                key={`${option.value}-${option.hint ?? index}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault()
                  choose(option)
                }}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm',
                  isActive && 'bg-primary-subtle',
                  isSelected && 'font-semibold text-ink',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate">{option.label}</span>
                  {option.hint && <span className="block truncate text-xs text-muted">{option.hint}</span>}
                </span>
                {isSelected && <Check aria-hidden className="size-4 shrink-0 text-primary" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
