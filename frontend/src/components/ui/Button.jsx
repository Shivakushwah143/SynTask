import { LoadingSpinner } from './LoadingSpinner'

const VARIANTS = {
  primary: 'bg-primary-600 text-white shadow-lg shadow-primary-200/50 hover:-translate-y-0.5 hover:bg-primary-700 dark:shadow-primary-950/30',
  secondary: 'border border-[var(--color-app-border)] bg-[var(--color-app-surface)] text-[var(--color-app-text)] shadow-sm hover:-translate-y-0.5 hover:bg-[var(--color-app-accent-soft)] hover:text-[var(--color-app-accent)]',
  danger: 'bg-red-600 text-white shadow-lg shadow-red-200/40 hover:-translate-y-0.5 hover:bg-red-700 dark:shadow-red-950/30',
  ghost: 'text-[var(--color-app-text-secondary)] hover:bg-[var(--color-app-accent-soft)] hover:text-[var(--color-app-accent)]',
}

const SIZES = {
  sm: 'min-h-9 px-3 py-1.5 text-sm',
  md: 'min-h-10 px-4 py-2 text-sm',
  lg: 'min-h-12 px-6 py-3 text-base',
}

export function Button({ variant = 'primary', size = 'md', loading, disabled, className = '', children, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoadingSpinner size="sm" label="" /> : null}
      {children}
    </button>
  )
}

