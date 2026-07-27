import React, { useEffect, useRef, useState } from 'react'

export function CreatableSelectField({
  id,
  name,
  label,
  value,
  onChange,
  children,
  disabled = false,
  required = false,
  className = 'input',
  createLabel = 'Create new',
  onCreate,
  canCreate = true,
  helper,
  placeholder = '',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  const options = React.Children.toArray(children)
    .filter(Boolean)
    .map((child) => {
      try {
        return { value: child.props.value, label: child.props.children }
      } catch (e) {
        return null
      }
    })
    .filter(Boolean)

  const selected = options.find((o) => String(o.value) === String(value))

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  const filtered = options.filter((o) => String(o.label).toLowerCase().includes(query.toLowerCase()))

  return (
    <div ref={ref} className="relative">
      {label ? (
        <label htmlFor={id || name} className="mb-1 block text-sm font-medium text-gray-700 dark:text-[var(--color-app-text-secondary)]">
          {label}
        </label>
      ) : null}

      <button type="button" disabled={disabled} onClick={() => setOpen((s) => !s)} className={`${className} flex items-center justify-between w-full`}>
        <span className={`truncate ${selected ? '' : 'text-gray-400'}`}>{selected ? selected.label : placeholder || 'Select...'}</span>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
          <div className="p-2">
            <input autoFocus className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm" placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="max-h-48 overflow-auto">
            {canCreate && onCreate ? (
              <button type="button" onClick={() => { setOpen(false); onCreate?.(); }} className="w-full text-left px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">+ {createLabel}</button>
            ) : null}
            {filtered.length ? filtered.map((opt) => (
              <button key={opt.value} type="button" onClick={() => { setOpen(false); onChange?.(opt.value); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                {opt.label}
              </button>
            )) : (
              <div className="px-3 py-2 text-sm text-gray-500">No options</div>
            )}
          </div>
        </div>
      )}

      {helper ? <p className="mt-1 text-xs text-gray-500 dark:text-[var(--color-app-text-muted)]">{helper}</p> : null}
    </div>
  )
}
