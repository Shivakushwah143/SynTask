import { CheckCircle2, Clock, Coffee, Play } from 'lucide-react'

/**
 * Canonical frontend attendance statuses. The backend normalizes its attendance
 * enum values into these strings in every `/attendance` response, so UI logic
 * must only ever reason about these four values.
 */
export const ATTENDANCE_STATUS = {
  NOT_CHECKED_IN: 'not_checked_in',
  WORKING: 'working',
  ON_BREAK: 'on_break',
  CHECKED_OUT: 'checked_out',
}

/**
 * Normalize any value coming from the API into a canonical status string.
 * Unknown / missing values fall back to `not_checked_in`.
 */
export function normalizeAttendanceStatus(value) {
  if (value === ATTENDANCE_STATUS.WORKING) return ATTENDANCE_STATUS.WORKING
  if (value === ATTENDANCE_STATUS.ON_BREAK) return ATTENDANCE_STATUS.ON_BREAK
  if (value === ATTENDANCE_STATUS.CHECKED_OUT) return ATTENDANCE_STATUS.CHECKED_OUT
  return ATTENDANCE_STATUS.NOT_CHECKED_IN
}

/**
 * Single source of truth for how each status looks and reads across the app.
 * `badge` is the page badge style, `pill` is the compact navbar pill style,
 * and `dot` is the small status dot shown in the navbar.
 */
export const attendanceStatusMeta = {
  [ATTENDANCE_STATUS.NOT_CHECKED_IN]: {
    label: 'Not Checked In',
    icon: Clock,
    badge: 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200',
    pill: 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white',
    dot: 'bg-gray-400',
    timerLabel: 'Net working time',
    help: 'Start tracking your working time for today.',
    title: 'Attendance | SynTask',
  },
  [ATTENDANCE_STATUS.WORKING]: {
    label: 'Working',
    icon: Play,
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    pill: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70',
    dot: 'bg-emerald-500',
    timerLabel: 'Net working time',
    title: 'Working | SynTask',
  },
  [ATTENDANCE_STATUS.ON_BREAK]: {
    label: 'On Break',
    icon: Coffee,
    badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    pill: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/70',
    dot: 'bg-amber-500',
    timerLabel: 'Current break',
    title: 'On Break | SynTask',
  },
  [ATTENDANCE_STATUS.CHECKED_OUT]: {
    label: 'Day Completed',
    icon: CheckCircle2,
    badge: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
    pill: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-950/70',
    dot: 'bg-sky-500',
    timerLabel: 'Total working time',
    help: 'Your attendance has been saved for today.',
    title: 'Completed | SynTask',
  },
}

export function getAttendanceMeta(status) {
  return attendanceStatusMeta[normalizeAttendanceStatus(status)] || attendanceStatusMeta[ATTENDANCE_STATUS.NOT_CHECKED_IN]
}

/**
 * Extract the normalized attendance record from an attendance API response.
 *
 * The API methods in `api/attendance.js` return the response body
 * `{ success: true, data: { ...record } }`, so the record lives at `response.data`.
 * `received_at` is attached here so the Attendance page timer can correct for
 * client/server clock skew using `server_time` (kept from the original page).
 */
export function extractAttendanceRecord(response) {
  if (!response || typeof response !== 'object') return null
  const record = response && typeof response === 'object' && 'data' in response ? response.data : response
  if (!record || typeof record !== 'object') return null
  return {
    ...record,
    status: normalizeAttendanceStatus(record.status),
    received_at: Date.now(),
  }
}
