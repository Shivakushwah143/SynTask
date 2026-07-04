import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import {
  Clock, TrendingUp, CheckCircle2, Timer, AlertTriangle,
  LogIn, LogOut, Coffee, BarChart2
} from 'lucide-react'
import { timesheetApi } from '../api/timesheet'
import { attendanceAPI } from '../api/attendance'
import { Badge, Button, EmptyState, FormField, inputClassName, PageHeader, SkeletonTable, Table } from '../components/ui'
import { asArray, formatDate, toFormData } from './phase4Utils'
import { format, parseISO } from 'date-fns'

const STANDARD_WORK_SECONDS = 8 * 3600

const formatSeconds = (totalSeconds) => {
  if (!totalSeconds || totalSeconds <= 0) return '0h 0m'
  const s = Math.floor(totalSeconds)
  const hrs = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  return `${hrs}h ${mins}m`
}

const WorkTypeBadge = ({ workType }) => {
  if (!workType) return null
  if (workType === 'Overtime') {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
        <TrendingUp className="h-3 w-3 mr-1" /> Overtime
      </span>
    )
  }
  if (workType === 'Full Time') {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Full Time
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
      <Timer className="h-3 w-3 mr-1" /> Under Time
    </span>
  )
}

const AttendanceSummaryBlock = ({ summary }) => {
  if (!summary) return null

  const progressPct = Math.min(100, ((summary.total_working_seconds || 0) / STANDARD_WORK_SECONDS) * 100)
  const statusColorKey = summary.status === 'Working' ? 'completed' :
    summary.status === 'On Break' ? 'hold' :
    summary.status === 'Absent' ? 'rejected' : 'default'

  return (
    <section className="mb-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-950">
        <div className="flex items-center space-x-2">
          <BarChart2 className="h-4.5 w-4.5 text-primary-500" />
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">Today's Attendance Summary</h2>
        </div>
        <div className="flex items-center space-x-2">
          {summary.is_late && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
              <AlertTriangle className="h-3 w-3 mr-1" /> Late Clock-in
            </span>
          )}
          <Badge label={summary.status} colorKey={statusColorKey} />
          <WorkTypeBadge workType={summary.work_type} />
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>0h</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {formatSeconds(summary.total_working_seconds)} / 8h standard
          </span>
          <span>8h</span>
        </div>
        <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              summary.work_type === 'Overtime' ? 'bg-amber-500' :
              summary.work_type === 'Full Time' ? 'bg-emerald-500' : 'bg-rose-500'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-y divide-gray-100 dark:divide-gray-800 border-t border-gray-100 dark:border-gray-800 mt-3">
        <div className="px-4 py-3">
          <div className="flex items-center text-xs font-semibold text-gray-500 uppercase mb-1">
            <LogIn className="h-3.5 w-3.5 mr-1 text-emerald-500" /> Login
          </div>
          <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
            {summary.login_time
              ? format(parseISO(summary.login_time), 'hh:mm:ss a')
              : '—'}
          </p>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center text-xs font-semibold text-gray-500 uppercase mb-1">
            <LogOut className="h-3.5 w-3.5 mr-1 text-rose-500" /> Logout
          </div>
          <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
            {summary.logout_time
              ? format(parseISO(summary.logout_time), 'hh:mm:ss a')
              : summary.status === 'Offline' ? '—' : 'Active'}
          </p>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center text-xs font-semibold text-gray-500 uppercase mb-1">
            <Clock className="h-3.5 w-3.5 mr-1 text-primary-500" /> Total
          </div>
          <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
            {formatSeconds(summary.total_working_seconds)}
          </p>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center text-xs font-semibold text-gray-500 uppercase mb-1">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-500" /> Regular
          </div>
          <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
            {formatSeconds(summary.regular_seconds)}
          </p>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center text-xs font-semibold text-gray-500 uppercase mb-1">
            <TrendingUp className="h-3.5 w-3.5 mr-1 text-amber-500" /> Overtime
          </div>
          <p className={`text-sm font-bold ${
            (summary.overtime_seconds || 0) > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-gray-400'
          }`}>
            {formatSeconds(summary.overtime_seconds)}
          </p>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center text-xs font-semibold text-gray-500 uppercase mb-1">
            <Coffee className="h-3.5 w-3.5 mr-1 text-sky-500" /> Break
          </div>
          <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
            {formatSeconds(summary.break_seconds)}
          </p>
        </div>
      </div>
    </section>
  )
}

export default function Timesheet() {
  const queryClient = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    date: today,
    hours_spent_today: 1,
    miscellaneous_description: 'General work',
    is_miscellaneous: true
  })
  const [errors, setErrors] = useState({})
  const [attendanceSummary, setAttendanceSummary] = useState(null)

  const mine = useQuery('my-timesheet', timesheetApi.getMine)
  const entries = asArray(mine.data, ['entries', 'timesheet'])

  const create = useMutation(
    (payload) => timesheetApi.createEntry(toFormData(payload)),
    {
      onSuccess: () => {
        toast.success('Timesheet saved')
        queryClient.invalidateQueries('my-timesheet')
      }
    }
  )

  // Load today's attendance summary for the summary block
  useEffect(() => {
    attendanceAPI.getTimesheetSummary()
      .then(res => {
        if (res?.data) setAttendanceSummary(res.data)
      })
      .catch(() => {}) // silently ignore — not all roles have attendance
  }, [])

  const update = (key, value) => setForm(state => ({ ...state, [key]: value }))

  const validate = () => {
    const nextErrors = {}
    if (!form.date) nextErrors.date = 'Date is required'
    if (!form.hours_spent_today || Number(form.hours_spent_today) <= 0)
      nextErrors.hours_spent_today = 'Hours must be greater than 0'
    if (form.is_miscellaneous && !form.miscellaneous_description?.trim())
      nextErrors.miscellaneous_description = 'Description is required'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const submit = () => {
    if (!validate()) return
    create.mutate(form)
  }

  const columns = [
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    {
      key: 'project_name',
      header: 'Project / Description',
      render: (row) => row.project_name || row.miscellaneous_description || row.meeting_title || '—'
    },
    { key: 'task_title', header: 'Task', render: (row) => row.task_title || '—' },
    { key: 'hours_spent_today', header: 'Hours', render: (row) => row.hours_spent_today || row.hours_spent || 0 },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge label={row.status || 'draft'} colorKey={row.status || 'draft'} />
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Timesheet"
        description="Log weekly work, review attendance summary, and track approval status."
      />

      {/* Attendance Summary Block */}
      <AttendanceSummaryBlock summary={attendanceSummary} />

      {/* Quick Entry Form */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <h2 className="mb-4 font-bold text-gray-900 dark:text-gray-100">Quick Entry</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <FormField label="Date" required error={errors.date}>
            <input
              className={inputClassName}
              type="date"
              value={form.date}
              onChange={e => update('date', e.target.value)}
              aria-invalid={Boolean(errors.date)}
            />
          </FormField>
          <FormField label="Hours" required error={errors.hours_spent_today}>
            <input
              className={inputClassName}
              type="number"
              min="0.25"
              step="0.25"
              value={form.hours_spent_today}
              onChange={e => update('hours_spent_today', e.target.value)}
              aria-invalid={Boolean(errors.hours_spent_today)}
            />
          </FormField>
          <FormField label="Description" required={form.is_miscellaneous} error={errors.miscellaneous_description}>
            <input
              className={inputClassName}
              value={form.miscellaneous_description}
              onChange={e => update('miscellaneous_description', e.target.value)}
              aria-invalid={Boolean(errors.miscellaneous_description)}
            />
          </FormField>
          <label className="flex min-h-[42px] items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_miscellaneous}
              onChange={e => update('is_miscellaneous', e.target.checked)}
              className="rounded"
            />
            Miscellaneous work
          </label>
        </div>
        <Button className="mt-4" loading={create.isLoading} onClick={submit}>
          Save Hours
        </Button>
      </section>

      {/* Entries Table */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <h2 className="mb-4 font-bold text-gray-900 dark:text-gray-100">My Entries</h2>
        {mine.isLoading
          ? <SkeletonTable rows={6} cols={5} />
          : entries.length
            ? <Table columns={columns} data={entries} />
            : <EmptyState icon={Clock} title="No timesheet entries" description="Log hours to build your weekly timesheet." />
        }
      </section>
    </div>
  )
}
