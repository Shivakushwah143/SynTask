const COLORS = {
  active: 'bg-green-100/70 text-green-700 dark:bg-green-900/45 dark:text-[#9be7bd]',
  approved: 'bg-green-100/70 text-green-700 dark:bg-green-900/45 dark:text-[#9be7bd]',
  completed: 'bg-green-100/70 text-green-700 dark:bg-green-900/45 dark:text-[#9be7bd]',
  won: 'bg-green-100/70 text-green-700 dark:bg-green-900/45 dark:text-[#9be7bd]',
  in_progress: 'bg-sky-100/70 text-sky-700 dark:bg-primary-950/55 dark:text-primary-200',
  scheduled: 'bg-sky-100/70 text-sky-700 dark:bg-primary-950/55 dark:text-primary-200',
  submitted: 'bg-sky-100/70 text-sky-700 dark:bg-primary-950/55 dark:text-primary-200',
  trial: 'bg-sky-100/70 text-sky-700 dark:bg-primary-950/55 dark:text-primary-200',
  pending: 'bg-amber-100/70 text-amber-700 dark:bg-amber-900/45 dark:text-[#f4d28a]',
  draft: 'bg-stone-100/80 text-stone-700 dark:bg-[var(--color-app-surface-subtle)] dark:text-[var(--color-app-text-secondary)]',
  low: 'bg-green-100/70 text-green-700 dark:bg-green-900/45 dark:text-[#9be7bd]',
  medium: 'bg-amber-100/70 text-amber-700 dark:bg-amber-900/45 dark:text-[#f4d28a]',
  high: 'bg-orange-100/70 text-orange-700 dark:bg-primary-950/55 dark:text-primary-200',
  critical: 'bg-red-100/70 text-red-700 dark:bg-red-900/45 dark:text-[#f4aaa0]',
  lost: 'bg-red-100/70 text-red-700 dark:bg-red-900/45 dark:text-[#f4aaa0]',
  suspended: 'bg-red-100/70 text-red-700 dark:bg-red-900/45 dark:text-[#f4aaa0]',
  cancelled: 'bg-red-100/70 text-red-700 dark:bg-red-900/45 dark:text-[#f4aaa0]',
  ai: 'bg-amber-100/70 text-amber-700 dark:bg-amber-900/45 dark:text-[#f4d28a]',
  new: 'bg-primary-100/70 text-primary-700 dark:bg-primary-950/55 dark:text-primary-200',
}

export function Badge({ label, colorKey, className = '' }) {
  const key = String(colorKey || label || '').toLowerCase()
  return (
    <span className={`inline-flex items-center rounded-md border border-transparent px-2.5 py-1 text-xs font-semibold leading-none ${COLORS[key] || 'bg-stone-100/80 text-stone-700 dark:bg-[var(--color-app-surface-subtle)] dark:text-[var(--color-app-text-secondary)]'} ${className}`}>
      {label}
    </span>
  )
}
