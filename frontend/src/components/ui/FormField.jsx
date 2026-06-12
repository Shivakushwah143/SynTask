export function FormField({ label, error, children, htmlFor }) {
  return (
    <label className="block" htmlFor={htmlFor}>
      {label ? <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span> : null}
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  )
}

export const inputClassName =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20'
