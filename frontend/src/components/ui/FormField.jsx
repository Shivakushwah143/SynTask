export function FormField({ label, error, children, htmlFor, required = false }) {
  return (
    <label className="block" htmlFor={htmlFor}>
      {label ? (
        <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
          {label}
          {required ? <span className="ml-1 text-red-600" aria-hidden="true">*</span> : null}
        </span>
      ) : null}
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600" role="alert">{error}</span> : null}
    </label>
  )
}

export const inputClassName =
  'w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500'
