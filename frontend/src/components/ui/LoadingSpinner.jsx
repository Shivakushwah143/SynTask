export function LoadingSpinner({ size = 'md', label = 'Loading' }) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }

  return (
    <span className="inline-flex items-center gap-2 text-sm text-gray-500">
      <span className={`${sizes[size]} animate-spin rounded-full border-2 border-gray-200 border-t-primary-600`} />
      {label ? <span>{label}</span> : null}
    </span>
  )
}

export function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <LoadingSpinner size="lg" label="Loading page" />
    </div>
  )
}
