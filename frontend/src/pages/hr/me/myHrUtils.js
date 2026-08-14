// Phase 8 — My HR shared display helpers.

export const formatCurrency = (value) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(Number(value) || 0)

export const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '-'

export const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-'

export const formatTime = (value) =>
  value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-'

export const formatDuration = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (!hours) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

export const EMPLOYMENT_STATUS_LABELS = {
  onboarding: 'Onboarding',
  probation: 'Probation',
  active: 'Active',
  notice_period: 'Notice Period',
  exited: 'Exited',
}

export const EMPLOYMENT_STATUS_BADGES = {
  onboarding: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  probation: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  active: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  notice_period: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  exited: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

export const LEAVE_STATUS_BADGES = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  forwarded: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
}

export const EXPIRY_STATE_META = {
  no_expiry: { label: 'No Expiry', badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  valid: { label: 'Valid', badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  expiring_soon: { label: 'Expiring Soon', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  expired: { label: 'Expired', badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
}

export const CORRECTION_STATUS_BADGES = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
}

export const CORRECTION_TYPE_LABELS = {
  missing_check_in: 'Missing Check-in',
  missing_check_out: 'Missing Check-out',
  change_check_in: 'Change Check-in',
  change_check_out: 'Change Check-out',
  break_correction: 'Break Correction',
  status_correction: 'Status Correction',
}
