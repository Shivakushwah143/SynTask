export function FormField({ label, error, helperText, children, htmlFor, required = false, className = '' }) {
  return (
    <label className={`block space-y-1.5 ${className}`} htmlFor={htmlFor}>
      {label ? (
        <span className="block text-sm font-medium text-gray-700 dark:text-[var(--color-app-text-secondary)]">
          {label} 
          {required ? <span className="ml-1 text-red-600" aria-hidden="true">*</span> : null}
        </span>
      ) : null}
      {helperText ? <span className="block text-xs leading-5 text-gray-500 dark:text-[var(--color-app-text-muted)]">{helperText}</span> : null}
      {children}
      {error ? <span className="block text-xs text-red-600" role="alert">{error}</span> : null}
    </label>
  )
}

export const inputClassName =
  'min-h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 dark:border-gray-700 dark:bg-gray-800/80 dark:text-white dark:placeholder:text-gray-400'
