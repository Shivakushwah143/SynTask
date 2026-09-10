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
  healthy: 'bg-emerald-100/70 text-emerald-700 dark:bg-emerald-900/45 dark:text-[#9be7bd]',
  overdue: 'bg-red-100/70 text-red-700 dark:bg-red-900/45 dark:text-[#f4aaa0]',
  due_today: 'bg-amber-100/70 text-amber-700 dark:bg-amber-900/45 dark:text-[#f4d28a]',
  extended: 'bg-blue-100/70 text-blue-700 dark:bg-blue-900/45 dark:text-[#9be7bd]',
  // Canonical content lifecycle statuses
  idea: 'bg-stone-100/80 text-stone-700 dark:bg-[var(--color-app-surface-subtle)] dark:text-[var(--color-app-text-secondary)]',
  briefing: 'bg-blue-100/70 text-blue-700 dark:bg-blue-900/45 dark:text-[#9be7bd]',
  script: 'bg-indigo-100/70 text-indigo-700 dark:bg-indigo-900/45 dark:text-[#a5b4fc]',
  production: 'bg-amber-100/70 text-amber-700 dark:bg-amber-900/45 dark:text-[#f4d28a]',
  client_review: 'bg-purple-100/70 text-purple-700 dark:bg-purple-900/45 dark:text-[#c4b5fd]',
  internal_review: 'bg-sky-100/70 text-sky-700 dark:bg-primary-950/55 dark:text-primary-200',
  revision_required: 'bg-orange-100/70 text-orange-700 dark:bg-primary-950/55 dark:text-primary-200',
  ready_to_publish: 'bg-teal-100/70 text-teal-700 dark:bg-teal-900/45 dark:text-[#99f6e4]',
  published: 'bg-emerald-100/70 text-emerald-700 dark:bg-emerald-900/45 dark:text-[#9be7bd]',
}

export function Badge({ label, colorKey, pill = false, className = '' }) {
  const key = String(colorKey || label || '').toLowerCase()
  const shapeClass = pill ? 'rounded-full px-3 py-0.5' : 'rounded-md px-2.5 py-1'
  return (
    <span className={`inline-flex items-center border border-transparent text-xs font-semibold leading-none ${shapeClass} ${COLORS[key] || 'bg-stone-100/80 text-stone-700 dark:bg-[var(--color-app-surface-subtle)] dark:text-[var(--color-app-text-secondary)]'} ${className}`}>
      {label}
    </span>
  )
}
