const COLORS = {
  active: 'bg-green-100/70 text-green-700 dark:bg-green-950/60 dark:text-green-200',
  approved: 'bg-green-100/70 text-green-700 dark:bg-green-950/60 dark:text-green-200',
  completed: 'bg-green-100/70 text-green-700 dark:bg-green-950/60 dark:text-green-200',
  won: 'bg-green-100/70 text-green-700 dark:bg-green-950/60 dark:text-green-200',
  in_progress: 'bg-sky-100/70 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200',
  scheduled: 'bg-sky-100/70 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200',
  submitted: 'bg-sky-100/70 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200',
  trial: 'bg-sky-100/70 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200',
  pending: 'bg-amber-100/70 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200',
  draft: 'bg-stone-100/80 text-stone-700 dark:bg-gray-800 dark:text-gray-200',
  low: 'bg-green-100/70 text-green-700 dark:bg-green-950/60 dark:text-green-200',
  medium: 'bg-amber-100/70 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200',
  high: 'bg-orange-100/70 text-orange-700 dark:bg-orange-950/60 dark:text-orange-200',
  critical: 'bg-red-100/70 text-red-700 dark:bg-red-950/60 dark:text-red-200',
  lost: 'bg-red-100/70 text-red-700 dark:bg-red-950/60 dark:text-red-200',
  suspended: 'bg-red-100/70 text-red-700 dark:bg-red-950/60 dark:text-red-200',
  cancelled: 'bg-red-100/70 text-red-700 dark:bg-red-950/60 dark:text-red-200',
  ai: 'bg-amber-100/70 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200',
  new: 'bg-primary-100/70 text-primary-700 dark:bg-primary-950/60 dark:text-primary-200',
}

export function Badge({ label, colorKey, className = '' }) {
  const key = String(colorKey || label || '').toLowerCase()
  return (
    <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${COLORS[key] || 'bg-stone-100/80 text-stone-700 dark:bg-gray-800 dark:text-gray-200'} ${className}`}>
      {label}
    </span>
  )
}
