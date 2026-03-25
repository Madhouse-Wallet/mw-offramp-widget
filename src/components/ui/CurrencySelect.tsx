import React, { useState, useRef, useEffect } from 'react'

// ─── Country code → flag emoji ────────────────────────────────────────────────
// Converts a 2-letter ISO 3166-1 alpha-2 code to its flag emoji.
// Returns undefined for unknown / non-country codes.
export function countryFlag(code: string): string | undefined {
  if (!/^[A-Za-z]{2}$/.test(code)) return undefined
  const upper = code.toUpperCase()
  // Regional indicator symbols: 🇦 = U+1F1E6, offset from 'A' = 65
  return String.fromCodePoint(
    0x1f1e6 + upper.charCodeAt(0) - 65,
    0x1f1e6 + upper.charCodeAt(1) - 65,
  )
}

// Returns true when every option value in a select field looks like an ISO
// country code (2 uppercase letters), so we know to show flags.
export function isCountryField(keys: string[]): boolean {
  if (keys.length === 0) return false
  return keys.every((k) => /^[A-Z]{2}$/.test(k))
}

export interface CurrencyOption {
  value: string
  label: string
  flag: string
}

interface CurrencySelectProps {
  label?: string
  value: string
  onChange: (value: string) => void
  options: CurrencyOption[]
  required?: boolean
  error?: string
}

export function CurrencySelect({ label, value, onChange, options, required, error }: CurrencySelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value)

  const filtered = search.trim()
    ? options.filter(
        (o) =>
          o.value.toLowerCase().includes(search.toLowerCase()) ||
          o.label.toLowerCase().includes(search.toLowerCase()),
      )
    : options

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Focus search input when opening
  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  // Close on Escape
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); setSearch('') }
  }

  function handleSelect(val: string) {
    onChange(val)
    setOpen(false)
    setSearch('')
  }

  const inputId = label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="space-y-1" ref={containerRef} onKeyDown={handleKeyDown}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="ml-1 text-orange-500">*</span>}
        </label>
      )}

      {/* Trigger button */}
      <button
        id={inputId}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          'w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm text-left',
          'bg-white text-gray-900',
          'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500',
          'transition-colors duration-150',
          error
            ? 'border-red-500'
            : open
              ? 'border-orange-500 ring-2 ring-orange-500'
              : 'border-gray-300 hover:border-gray-400',
        ].join(' ')}
      >
        {selected ? (
          <>
            <span className="text-base leading-none">{selected.flag}</span>
            <span className="flex-1 truncate">{selected.label}</span>
          </>
        ) : (
          <span className="flex-1 text-gray-400">Select currency</span>
        )}
        {/* Chevron */}
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-56 rounded-xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          {/* Options list */}
          <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">No results</li>
            ) : (
              filtered.map((opt) => (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={opt.value === value}
                  onClick={() => handleSelect(opt.value)}
                  className={[
                    'flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer transition-colors',
                    opt.value === value
                      ? 'bg-orange-50 text-orange-700 font-medium'
                      : 'text-gray-800 hover:bg-gray-50',
                  ].join(' ')}
                >
                  <span className="text-base leading-none w-5 text-center">{opt.flag}</span>
                  <span className="flex-1">{opt.label}</span>
                  {opt.value === value && (
                    <svg className="h-3.5 w-3.5 text-orange-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}
