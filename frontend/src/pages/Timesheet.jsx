import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import {
  Clock, TrendingUp, CheckCircle2, Timer, AlertTriangle,
  LogIn, LogOut, Coffee, BarChart2, ChevronLeft, ChevronRight
} from 'lucide-react'
import { timesheetApi } from '../api/timesheet'
import { attendanceAPI } from '../api/attendance'
import { Badge, Button, EmptyState, FormField, inputClassName, PageHeader, SkeletonTable, Table } from '../components/ui'
import { asArray, formatDate, toFormData } from './phase4Utils'
import { addWeeks, eachDayOfInterval, endOfWeek, format, parseISO, startOfWeek, isSameDay } from 'date-fns'
import { timeService } from '@/services/timeService'

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
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">Today&apos;s Attendance Summary</h2>
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
  const today = timeService.toUtcISOString(timeService.now()).slice(0, 10)
  const [form, setForm] = useState({
    date: today,
    hours_spent_today: 1,
    miscellaneous_description: 'General work',
    is_miscellaneous: true
  })
  const [errors, setErrors] = useState({})
  const [attendanceSummary, setAttendanceSummary] = useState(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [weeklyDraft, setWeeklyDraft] = useState({})
  const [savingWeek, setSavingWeek] = useState(false)

  const mine = useQuery('my-timesheet', timesheetApi.getMine)
  const entries = asArray(mine.data, ['entries', 'timesheet'])
  const weekStart = useMemo(() => startOfWeek(addWeeks(timeService.now(), weekOffset), { weekStartsOn: 1 }), [weekOffset])
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) }), [weekStart])
  const rows = useMemo(() => {
    const map = new Map()
    entries.forEach((entry) => {
      const label = entry.project_name || entry.task_title || entry.miscellaneous_description || entry.meeting_title || 'Unassigned'
      if (!map.has(label)) {
        map.set(label, { label, entries: [] })
      }
      map.get(label).entries.push(entry)
    })
    return Array.from(map.values())
  }, [entries])

  useEffect(() => {
    const nextDraft = {}
    rows.forEach((row) => {
      weekDays.forEach((day) => {
        const entry = row.entries.find((item) => isSameDay(timeService.instant(item.date), day))
        nextDraft[`${row.label}-${timeService.toUtcISOString(day).slice(0, 10)}`] = entry ? String(entry.hours_spent_today || entry.hours_spent || '') : ''
      })
    })
    setWeeklyDraft(nextDraft)
  }, [rows, weekDays])

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

  const weekEntryFor = (row, day) => row.entries.find((entry) => isSameDay(timeService.instant(entry.date), day))
  const weeklyTotal = (day) => rows.reduce((sum, row) => {
    const entry = weekEntryFor(row, day)
    return sum + Number(entry?.hours_spent_today || entry?.hours_spent || 0)
  }, 0)

  const handleWeekSave = async () => {
    try {
      setSavingWeek(true)
      const payloads = []
      rows.forEach((row) => {
        weekDays.forEach((day) => {
          const key = `${row.label}-${timeService.toUtcISOString(day).slice(0, 10)}`
          const hours = Number(weeklyDraft[key] || 0)
          if (hours > 0) {
            payloads.push({
              date: timeService.toUtcISOString(day).slice(0, 10),
              hours_spent_today: hours,
              miscellaneous_description: row.label,
              is_miscellaneous: true,
            })
          }
        })
      })

      for (const payload of payloads) {
        // Existing API creates a daily entry; save one entry per filled cell.
        // This keeps the weekly grid aligned with the current backend contract.
        await timesheetApi.createEntry(toFormData(payload))
      }

      toast.success('Weekly timesheet saved')
      await queryClient.invalidateQueries('my-timesheet')
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to save weekly timesheet')
    } finally {
      setSavingWeek(false)
    }
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

      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-gray-100">Weekly Grid</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">{format(weekStart, 'MMM d, yyyy')} - {format(weekDays[6], 'MMM d, yyyy')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setWeekOffset((value) => value - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setWeekOffset(0)}>
              Current Week
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setWeekOffset((value) => value + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={handleWeekSave} loading={savingWeek}>
              Save Week
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[240px_repeat(7,minmax(110px,1fr))] gap-2 border-b border-gray-200 pb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <div>Project / Task</div>
              {weekDays.map((day) => <div key={timeService.toUtcISOString(day)} className="text-center">{format(day, 'EEE dd')}</div>)}
            </div>
            <div className="space-y-2 pt-3">
              {rows.length ? rows.map((row) => (
                <div key={row.label} className="grid grid-cols-[240px_repeat(7,minmax(110px,1fr))] gap-2">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm font-medium text-gray-800 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100">
                    {row.label}
                  </div>
                  {weekDays.map((day) => {
                    const key = `${row.label}-${timeService.toUtcISOString(day).slice(0, 10)}`
                    return (
                      <input
                        key={timeService.toUtcISOString(day)}
                        className={`${inputClassName} text-center`}
                        type="number"
                        min="0"
                        step="0.25"
                        value={weeklyDraft[key] ?? ''}
                        onChange={(event) => setWeeklyDraft((state) => ({ ...state, [key]: event.target.value }))}
                        placeholder="0"
                      />
                    )
                  })}
                </div>
              )) : (
                <EmptyState icon={Clock} title="No weekly rows" description="Log entries to populate the weekly grid." />
              )}
            </div>
            <div className="mt-3 grid grid-cols-[240px_repeat(7,minmax(110px,1fr))] gap-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="font-medium">Daily total</div>
              {weekDays.map((day) => <div key={timeService.toUtcISOString(day)} className="text-center font-semibold">{weeklyTotal(day)}</div>)}
            </div>
          </div>
        </div>
      </section>

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
