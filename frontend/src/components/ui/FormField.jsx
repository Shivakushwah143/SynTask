export function FormField({ label, error, helperText, children, htmlFor, required = false, className = '' }) {
  return (
    <label className={`block space-y-1.5 ${className}`} htmlFor={htmlFor}>
      {label ? (
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">
          {label}
          {required ? <span className="ml-1 text-red-600" aria-hidden="true">*</span> : null}
        </span>
      ) : null}
      {helperText ? <span className="block text-xs leading-5 text-gray-500 dark:text-gray-400">{helperText}</span> : null}
      {children}
      {error ? <span className="block text-xs text-red-600" role="alert">{error}</span> : null}
    </label>
  )
}

export const inputClassName =
  'w-full rounded-2xl border border-gray-300/90 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500'
