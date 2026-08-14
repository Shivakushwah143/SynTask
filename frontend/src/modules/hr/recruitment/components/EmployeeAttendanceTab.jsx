import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Clock,
  Coffee,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { attendanceAPI } from '../../../../api/attendance'
import { Button, EmptyState, Skeleton } from '../../../../components/ui'
import { HR_STATUS_META, HR_ATTENDANCE_STATUS } from '../../../../features/attendance/attendanceStatus'

const MONTH_FORMATS = { month: 'short', year: 'numeric' }

const formatDate = (value) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-')
const formatMinutes = (minutes) => {
  const total = Math.max(0, Math.round(Number(minutes) || 0))
  const hours = Math.floor(total / 60)
  const mins = total % 60
  if (!hours) return `${mins}m`
  return `${hours}h ${mins}m`
}

/**
 * Employee Detail → Attendance.
 *
 * Uses the Phase 4 payroll attendance adapter (GET /attendance/payroll-summary),
 * the SAME normalized status source as the Attendance page, payroll readiness
 * and the HR dashboard — one attendance truth for a given employee/date.
 *
 * Identity: Attendance records are keyed by User id, so this tab is fed the
 * employee's `user_id` (resolved by the parent page).
 */
export default function EmployeeAttendanceTab({ employeeId }) {
  const today = useMemo(() => new Date(), [])
  const [month, setMonth] = useState(today.toISOString().slice(0, 7)) // YYYY-MM
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)
    setError(null)
    const [year, monthIndex] = month.split('-').map(Number)
    const start = new Date(Date.UTC(year, monthIndex - 1, 1))
    const end = new Date(Date.UTC(year, monthIndex, 0)) // last day of month
    const startDate = start.toISOString().slice(0, 10)
    const endDate = end.toISOString().slice(0, 10)
    try {
      const response = await attendanceAPI.getPayrollSummary(startDate, endDate, employeeId)
      const payload = response?.data?.data || response?.data || {}
      setData(payload)
    } catch (err) {
      if (err?.response?.status === 403) {
        setError('You do not have permission to view this employee\u2019s attendance.')
      } else {
        setError(err?.response?.data?.detail || 'Failed to load attendance')
      }
    } finally {
      setLoading(false)
    }
  }, [employeeId, month])

  useEffect(() => { load() }, [load])

  const summary = data?.summary || {}
  const dayRecords = data?.day_records || []

  const monthLabel = useMemo(
    () => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', MONTH_FORMATS),
    [month],
  )

  const stats = [
    { key: 'present_days', label: 'Present', value: summary.present_days, color: 'text-green-600 dark:text-green-400', icon: CheckCircle2 },
    { key: 'paid_leave_days', label: 'Paid Leave', value: summary.paid_leave_days, color: 'text-blue-600 dark:text-blue-400', icon: CalendarDays },
    { key: 'unpaid_leave_days', label: 'Unpaid Leave', value: summary.unpaid_leave_days, color: 'text-orange-600 dark:text-orange-400', icon: CalendarDays },
    { key: 'half_days', label: 'Half Days', value: summary.half_days, color: 'text-yellow-600 dark:text-yellow-400', icon: CalendarDays },
    { key: 'absent_days', label: 'Absent', value: summary.absent_days, color: 'text-red-600 dark:text-red-400', icon: AlertCircle },
    { key: 'holiday_days', label: 'Holidays', value: summary.holiday_days, color: 'text-purple-600 dark:text-purple-400', icon: CalendarDays },
    { key: 'week_off_days', label: 'Week Offs', value: summary.week_off_days, color: 'text-gray-500 dark:text-gray-400', icon: Coffee },
    { key: 'payable_days', label: 'Payable Days', value: summary.payable_days, color: 'text-indigo-600 dark:text-indigo-400', icon: CalendarRange },
    { key: 'work_minutes', label: 'Work Time', value: formatMinutes(summary.total_work_minutes), color: 'text-emerald-600 dark:text-emerald-400', icon: Clock },
    { key: 'late_count', label: 'Late Days', value: summary.late_count, color: 'text-amber-600 dark:text-amber-400', icon: Clock },
  ]

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <EmptyState
          icon={error.startsWith('You do not have permission') ? ShieldAlert : AlertCircle}
          title={error.startsWith('You do not have permission') ? 'Attendance permission required' : 'Failed to load attendance'}
          description={error}
          action={<Button variant="secondary" onClick={load}><RefreshCw className="h-4 w-4" /> Retry</Button>}
        />
      </div>
    )
  }

  if (!data || (!dayRecords.length && !summary.calendar_days)) {
    return (
      <div className="p-4">
        <EmptyState
          icon={CalendarDays}
          title="No attendance for this period"
          description="No attendance records or approved leave fall inside this month."
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Attendance — {monthLabel}</h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Normalized HR status from the payroll attendance adapter{data.employment_start || data.employment_end ? ' · constrained to employment period' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.key} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{stat.label}</p>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <p className={`mt-1.5 text-xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          )
        })}
      </div>

      {summary.unclassified_leave_days > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {summary.unclassified_leave_days} day(s) of approved leave could not be classified as paid or unpaid
            (missing leave type configuration). These days are treated as unpaid — please fix the leave type to avoid payroll surprises.
          </span>
        </div>
      ) : null}

      {/* Day table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Work Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Overtime</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Flags</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Payable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {dayRecords.map((day) => {
                const meta = HR_STATUS_META[day.status] || HR_STATUS_META[HR_ATTENDANCE_STATUS.NO_RECORD]
                const Icon = meta.icon
                const flags = []
                if (day.is_holiday && day.holiday_name) flags.push(day.holiday_name)
                if (day.is_week_off) flags.push('Week off')
                if (day.is_late) flags.push(`Late ${Math.round(day.late_minutes)}m`)
                if (day.is_early_departure) flags.push(`Early ${Math.round(day.early_departure_minutes)}m`)
                return (
                  <tr key={day.date} className="transition-colors hover:bg-gray-50/70 dark:hover:bg-gray-800/50">
                    <td className="whitespace-nowrap px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-white">{formatDate(day.date)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                      {day.leave?.leave_type_name ? (
                        <span className="ml-1.5 text-xs text-gray-500 dark:text-gray-400">{day.leave.leave_type_name}</span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{formatMinutes(day.actual_work_minutes)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{day.overtime_minutes > 0 ? formatMinutes(day.overtime_minutes) : '—'}</td>
                    <td className="px-4 py-2.5">
                      {flags.length ? (
                        <div className="flex flex-wrap gap-1">
                          {flags.map((flag) => (
                            <span key={flag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700/60 dark:text-gray-300">{flag}</span>
                          ))}
                        </div>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm font-medium text-indigo-600 dark:text-indigo-400">{day.payable_factor}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
