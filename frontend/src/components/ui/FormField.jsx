export function FormField({ label, error, children, htmlFor, required = false }) {
  return (
    <label className="block" htmlFor={htmlFor}>
      {label ? (
        <span className="mb-1.5 block text-sm font-semibold text-[var(--color-app-text-secondary)]">
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
  'w-full rounded-xl border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-3.5 py-2.5 text-sm text-[var(--color-app-text)] shadow-sm outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:placeholder:text-gray-500'

