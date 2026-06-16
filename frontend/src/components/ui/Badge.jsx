const COLORS = {
  active: 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300',
  won: 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  trial: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-300',
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  low: 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
  lost: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
}

export function Badge({ label, colorKey, className = '' }) {
  const key = String(colorKey || label || '').toLowerCase()
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${COLORS[key] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'} ${className}`}>
      {label}
    </span>
  )
}
