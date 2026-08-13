// Shared HR document UI helpers (Phase 2).

export const EXPIRY_STATES = {
  no_expiry: { label: 'No Expiry', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300' },
  valid: { label: 'Valid', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  expiring_soon: { label: 'Expiring Soon', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  expired: { label: 'Expired', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
}

export const VISIBILITY_OPTIONS = [
  { value: 'employee_visible', label: 'Employee visible' },
  { value: 'hr_only', label: 'HR only (confidential)' },
]

export const VISIBILITY_LABELS = {
  employee_visible: 'Employee visible',
  hr_only: 'HR only',
}

export const OWNER_SCOPE_OPTIONS = [
  { value: 'both', label: 'Employees & Candidates' },
  { value: 'employee', label: 'Employees only' },
  { value: 'candidate', label: 'Candidates only' },
]

export const OWNER_SCOPE_LABELS = {
  both: 'Employees & Candidates',
  employee: 'Employees only',
  candidate: 'Candidates only',
}

export const STATUS_LABELS = {
  active: 'Active',
  archived: 'Archived',
}

/** Format a raw byte count as 248 KB / 1.4 MB. */
export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

/** Formats that the browser can preview natively (PDF + images). */
export function isPreviewable(mimeType) {
  return Boolean(mimeType && (mimeType.startsWith('image/') || mimeType === 'application/pdf'))
}

/** Map a document DTO to the shape the preview modal expects. */
export function previewBlobUrl(blob) {
  return window.URL.createObjectURL(blob)
}
