const COLORS = {
  active: 'bg-green-100 text-green-700',
  approved: 'bg-green-100 text-green-700',
  completed: 'bg-green-100 text-green-700',
  won: 'bg-green-100 text-green-700',
  in_progress: 'bg-blue-100 text-blue-700',
  scheduled: 'bg-blue-100 text-blue-700',
  submitted: 'bg-blue-100 text-blue-700',
  trial: 'bg-blue-100 text-blue-700',
  pending: 'bg-yellow-100 text-yellow-700',
  draft: 'bg-gray-100 text-gray-700',
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
  lost: 'bg-red-100 text-red-700',
  suspended: 'bg-red-100 text-red-700',
  cancelled: 'bg-red-100 text-red-700',
}

export function Badge({ label, colorKey, className = '' }) {
  const key = String(colorKey || label || '').toLowerCase()
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${COLORS[key] || 'bg-gray-100 text-gray-700'} ${className}`}>
      {label}
    </span>
  )
}
