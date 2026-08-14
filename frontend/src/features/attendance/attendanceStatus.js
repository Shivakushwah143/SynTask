import { CheckCircle2, Clock, Coffee, Play, CalendarDays, Ban, MinusCircle, AlertTriangle } from 'lucide-react'

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
 * Phase 4: HR/Payroll-ready attendance statuses.
 */
export const HR_ATTENDANCE_STATUS = {
  PRESENT: 'present',
  ABSENT: 'absent',
  PAID_LEAVE: 'paid_leave',
  UNPAID_LEAVE: 'unpaid_leave',
  HALF_DAY: 'half_day',
  HOLIDAY: 'holiday',
  WEEK_OFF: 'week_off',
  IN_PROGRESS: 'in_progress',
  NO_RECORD: 'no_record',
}

export const HR_STATUS_META = {
  [HR_ATTENDANCE_STATUS.PRESENT]: {
    label: 'Present',
    badge: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
    icon: CheckCircle2,
  },
  [HR_ATTENDANCE_STATUS.ABSENT]: {
    label: 'Absent',
    badge: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    icon: Ban,
  },
  [HR_ATTENDANCE_STATUS.PAID_LEAVE]: {
    label: 'Paid Leave',
    badge: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    icon: CalendarDays,
  },
  [HR_ATTENDANCE_STATUS.UNPAID_LEAVE]: {
    label: 'Unpaid Leave',
    badge: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
    icon: CalendarDays,
  },
  [HR_ATTENDANCE_STATUS.HALF_DAY]: {
    label: 'Half Day',
    badge: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300',
    icon: MinusCircle,
  },
  [HR_ATTENDANCE_STATUS.HOLIDAY]: {
    label: 'Holiday',
    badge: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
    icon: CalendarDays,
  },
  [HR_ATTENDANCE_STATUS.WEEK_OFF]: {
    label: 'Week Off',
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    icon: Coffee,
  },
  [HR_ATTENDANCE_STATUS.IN_PROGRESS]: {
    label: 'In Progress',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    icon: Play,
  },
  [HR_ATTENDANCE_STATUS.NO_RECORD]: {
    label: 'No Record',
    badge: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    icon: Clock,
  },
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
