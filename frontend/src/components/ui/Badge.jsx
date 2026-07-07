const COLORS = {
  active: 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200',
  won: 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200',
  scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200',
  trial: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-200',
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  low: 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-200',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-200',
  critical: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200',
  lost: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200',
  suspended: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200',
  ai: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200',
  new: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-200',
}

export function Badge({ label, colorKey, className = '' }) {
  const key = String(colorKey || label || '').toLowerCase()
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${COLORS[key] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'} ${className}`}>
      {label}
    </span>
  )
}
