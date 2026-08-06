import { Link, useLocation } from 'react-router-dom'
import { useAttendanceStore } from '../../store/attendanceStore'
import { attendanceStatusMeta, normalizeAttendanceStatus } from '../../features/attendance/attendanceStatus'

const UNAVAILABLE_CLASSES =
  'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'

const SKELETON_CLASSES =
  'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'

/**
 * Global attendance status indicator rendered in the top navigation bar on
 * every page. It only displays the current status and navigates to /attendance —
 * all attendance actions stay on the Attendance page.
 */
export default function AttendanceStatusPill() {
  const location = useLocation()
  const status = useAttendanceStore((s) => s.status)
  const initialized = useAttendanceStore((s) => s.initialized)
  const loading = useAttendanceStore((s) => s.loading)
  const error = useAttendanceStore((s) => s.error)
  const record = useAttendanceStore((s) => s.record)

  const isAttendancePage = location.pathname === '/attendance' || location.pathname.startsWith('/attendance/')

  // First fetch still in flight → small non-disruptive skeleton.
  if (!initialized && (loading || status == null)) {
    return (
      <Link
        to="/attendance"
        aria-label="Attendance status loading"
        title="Loading attendance status"
        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 ${SKELETON_CLASSES}`}
      >
        <span className="h-2 w-2 animate-pulse rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
        <span className="hidden h-3 w-16 animate-pulse rounded bg-gray-200 sm:block dark:bg-gray-700" aria-hidden="true" />
      </Link>
    )
  }

  // Could not load attendance at all → neutral unavailable state, never a
  // misleading "Not Checked In".
  if (error && !record) {
    return (
      <Link
        to="/attendance"
        aria-current={isAttendancePage ? 'page' : undefined}
        aria-label="Attendance unavailable"
        title="Attendance unavailable — open attendance to retry"
        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-sm font-medium transition-colors sm:px-3 ${UNAVAILABLE_CLASSES}`}
      >
        <span className="h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500" aria-hidden="true" />
        <span className="hidden sm:inline">Attendance</span>
      </Link>
    )
  }

  const meta = attendanceStatusMeta[normalizeAttendanceStatus(status)] || attendanceStatusMeta.not_checked_in
  const Icon = meta.icon

  return (
    <Link
      to="/attendance"
      aria-current={isAttendancePage ? 'page' : undefined}
      aria-label={`Attendance status: ${meta.label}`}
      title={`Attendance: ${meta.label}`}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-sm font-medium transition-colors sm:px-3 ${meta.pill}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="hidden sm:inline">{meta.label}</span>
    </Link>
  )
}
