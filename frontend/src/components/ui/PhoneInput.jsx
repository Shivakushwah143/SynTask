import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { inputClassName } from './FormField'
import { phoneValidationMessage, sanitizeLocalPhone, parsePhonePaste } from './phoneUtils'

const COUNTRIES = [
  { code: '+91', name: 'India' },
  { code: '+1', name: 'USA / Canada' },
  { code: '+44', name: 'United Kingdom' },
  { code: '+61', name: 'Australia' },
  { code: '+971', name: 'United Arab Emirates' },
  { code: '+65', name: 'Singapore' },
  { code: '+49', name: 'Germany' },
  { code: '+33', name: 'France' },
  { code: '+81', name: 'Japan' },
  { code: '+86', name: 'China' },
]

const getCountry = (code) => COUNTRIES.find((country) => country.code === code) || COUNTRIES[0]

const getSplitFromCombined = (combined, fallbackCountry = '+91') => {
  const clean = String(combined || '').trim()
  const match = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length).find((country) => clean.startsWith(country.code))
  if (!match) return { countryCode: fallbackCountry, phoneNumber: sanitizeLocalPhone(clean) }
  return { countryCode: match.code, phoneNumber: sanitizeLocalPhone(clean.slice(match.code.length)) }
}

const makeEvent = (name, value) => ({ target: { name, value } })

export function PhoneInput({
  name,
  value,
  defaultValue = '',
  onChange,
  onBlur,
  countryCode,
  phoneNumber,
  onCountryCodeChange,
  onPhoneNumberChange,
  required = false,
  disabled = false,
  placeholder = '9876543210',
  error,
}) {
  const isCombinedControlled = value !== undefined
  const isSplitControlled = countryCode !== undefined || phoneNumber !== undefined
  const initial = getSplitFromCombined(value ?? defaultValue)
  const [internalCountry, setInternalCountry] = useState(initial.countryCode)
  const [internalPhone, setInternalPhone] = useState(initial.phoneNumber)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [touched, setTouched] = useState(false)
  const rootRef = useRef(null)
  const phoneRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    if (!isCombinedControlled) return
    const next = getSplitFromCombined(value)
    setInternalCountry(next.countryCode)
    setInternalPhone(next.phoneNumber)
  }, [isCombinedControlled, value])

  const currentCountry = isSplitControlled ? (countryCode || '+91') : internalCountry
  const currentPhone = isSplitControlled ? (phoneNumber || '') : internalPhone
  const combinedValue = `${currentCountry}${currentPhone}`
  const selectedCountry = getCountry(currentCountry)
  const validationMessage = error || phoneValidationMessage(combinedValue, required)
  const showError = Boolean((touched || error) && validationMessage)

  const filteredCountries = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return COUNTRIES
    return COUNTRIES.filter((country) => `${country.code} ${country.name}`.toLowerCase().includes(needle))
  }, [query])

  const commit = (nextCountry, nextPhone, sourceName = name) => {
    const cleanPhone = sanitizeLocalPhone(nextPhone)
    if (!isSplitControlled) {
      setInternalCountry(nextCountry)
      setInternalPhone(cleanPhone)
    }
    onCountryCodeChange?.(nextCountry)
    onPhoneNumberChange?.(cleanPhone)
    onChange?.(makeEvent(sourceName, `${nextCountry}${cleanPhone}`))
  }

  const handleCountrySelect = (nextCountry) => {
    commit(nextCountry, currentPhone)
    setOpen(false)
    setQuery('')
    requestAnimationFrame(() => phoneRef.current?.focus())
  }

  const handlePaste = (event) => {
    event.preventDefault()
    const pastedText = event.clipboardData?.getData('text') || ''
    if (!pastedText) return
    const { countryCode: detectedCountry, phoneNumber: cleanPhone } = parsePhonePaste(
      pastedText,
      COUNTRIES.map((c) => c.code)
    )
    const nextCountry = detectedCountry || currentCountry
    commit(nextCountry, cleanPhone)
  }

  const handlePhoneChange = (event) => {
    const input = event.target
    const before = input.value
    const selectionStart = input.selectionStart ?? before.length
    const { countryCode: detectedCountry, phoneNumber: nextPhone } = parsePhonePaste(
      before,
      COUNTRIES.map((c) => c.code)
    )
    const nextCountry = detectedCountry || currentCountry
    const removedBeforeCursor = before.slice(0, selectionStart).length - sanitizeLocalPhone(before.slice(0, selectionStart)).length
    commit(nextCountry, nextPhone)
    requestAnimationFrame(() => {
      const nextCursor = Math.max(0, Math.min(nextPhone.length, selectionStart - removedBeforeCursor))
      phoneRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const handlePhoneBlur = () => {
    setTouched(true)
    onBlur?.(makeEvent(name, combinedValue))
  }

  const blockInvalidKey = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key.length === 1 && !/\d/.test(event.key)) event.preventDefault()
  }

  return (
    <div ref={rootRef} className="space-y-1.5">
      <div className={`flex min-h-11 w-full min-w-0 items-stretch overflow-visible rounded-2xl border border-gray-300/90 bg-white text-sm text-gray-900 shadow-sm transition focus-within:border-primary-500 focus-within:ring-4 focus-within:ring-primary-500/10 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] dark:text-[var(--color-app-text)] ${disabled ? 'opacity-60' : ''}`}>
        <div className="relative flex-none">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((state) => !state)}
            className="flex h-full min-h-11 items-center gap-1 border-r border-gray-200 px-3 font-semibold text-gray-900 transition-colors hover:bg-gray-50 focus:outline-none dark:border-[var(--color-app-border)] dark:text-[var(--color-app-text)] dark:hover:bg-[var(--color-app-surface-subtle)]"
            aria-haspopup="listbox"
            aria-expanded={open}
            title={`${selectedCountry.code} ${selectedCountry.name}`}
          >
            <span>{selectedCountry.code}</span>
            <ChevronDown className="h-3.5 w-3.5 flex-none text-gray-400" aria-hidden="true" />
          </button>
          {open ? (
            <div className="absolute left-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
              <div className="relative border-b border-gray-100 p-2 dark:border-[var(--color-app-border)]">
                <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input
                  className={`${inputClassName} min-h-10 pl-9`}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search country code"
                  autoFocus
                />
              </div>
              <div className="max-h-56 overflow-y-auto py-1" role="listbox">
                {filteredCountries.map((country) => (
                  <button
                    key={`${country.code}-${country.name}`}
                    type="button"
                    role="option"
                    aria-selected={country.code === currentCountry}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-primary-50 dark:text-[var(--color-app-text)] dark:hover:bg-[var(--color-app-surface-subtle)]"
                    onClick={() => handleCountrySelect(country.code)}
                  >
                    <span className="font-semibold">{country.code}</span>
                    <span className="truncate">{country.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <input
          ref={phoneRef}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          maxLength={30}
          minLength={required ? 10 : undefined}
          title="Enter phone number."
          required={required}
          disabled={disabled}
          value={currentPhone}
          onChange={handlePhoneChange}
          onPaste={handlePaste}
          onKeyDown={blockInvalidKey}
          onBlur={handlePhoneBlur}
          className="min-h-11 min-w-0 flex-1 border-0 bg-transparent px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-[var(--color-app-text)] dark:placeholder:text-[#8f8374]"
          placeholder={placeholder}
          aria-invalid={showError || undefined}
        />
      </div>
      {name ? <input type="hidden" name={name} value={combinedValue} /> : null}
      {showError ? <p className="text-xs text-red-600" role="alert">{validationMessage}</p> : null}
    </div>
  )
}
