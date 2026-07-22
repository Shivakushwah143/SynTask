import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import {
  Clock, TrendingUp, CheckCircle2, Timer, AlertTriangle,
  LogIn, LogOut, Coffee, BarChart2, ChevronLeft, ChevronRight,
  Calendar, User, Briefcase, Zap, Award, Target, Activity,
  PieChart, Users, FileText, Save
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

// Stat Card Component
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
    gray: 'from-gray-500 to-stone-500',
    teal: 'from-teal-500 to-cyan-500',
  }

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  )
}

const WorkTypeBadge = ({ workType }) => {
  if (!workType) return null
  if (workType === 'Overtime') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
        <TrendingUp className="h-3 w-3 mr-1.5" /> Overtime
      </span>
    )
  }
  if (workType === 'Full Time') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
        <CheckCircle2 className="h-3 w-3 mr-1.5" /> Full Time
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
      <Timer className="h-3 w-3 mr-1.5" /> Under Time
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
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {/* Decorative gradient bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
      
      <div className="p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-50 p-2.5 dark:bg-indigo-950/30">
              <BarChart2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Today's Attendance</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Real-time tracking</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {summary.is_late && (
              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Late Clock-in
              </span>
            )}
            <Badge label={summary.status} colorKey={statusColorKey} />
            <WorkTypeBadge workType={summary.work_type} />
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            <span>0h</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {formatSeconds(summary.total_working_seconds)} / 8h standard
            </span>
            <span>8h</span>
          </div>
          <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                summary.work_type === 'Overtime' ? 'bg-gradient-to-r from-amber-500 to-orange-500' :
                summary.work_type === 'Full Time' ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-rose-500 to-pink-500'
              }`}
              style={{ width: `${Math.min(progressPct, 100)}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/50">
            <div className="flex items-center text-xs font-semibold text-gray-500 uppercase mb-1">
              <LogIn className="h-3.5 w-3.5 mr-1 text-emerald-500" /> Login
            </div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">
              {summary.login_time
                ? format(parseISO(summary.login_time), 'hh:mm:ss a')
                : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/50">
            <div className="flex items-center text-xs font-semibold text-gray-500 uppercase mb-1">
              <LogOut className="h-3.5 w-3.5 mr-1 text-rose-500" /> Logout
            </div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">
              {summary.logout_time
                ? format(parseISO(summary.logout_time), 'hh:mm:ss a')
                : summary.status === 'Offline' ? '—' : 'Active'}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/50">
            <div className="flex items-center text-xs font-semibold text-gray-500 uppercase mb-1">
              <Clock className="h-3.5 w-3.5 mr-1 text-indigo-500" /> Total
            </div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">
              {formatSeconds(summary.total_working_seconds)}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/50">
            <div className="flex items-center text-xs font-semibold text-gray-500 uppercase mb-1">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-500" /> Regular
            </div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">
              {formatSeconds(summary.regular_seconds)}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/50">
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
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/50">
            <div className="flex items-center text-xs font-semibold text-gray-500 uppercase mb-1">
              <Coffee className="h-3.5 w-3.5 mr-1 text-sky-500" /> Break
            </div>
            <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
              {formatSeconds(summary.break_seconds)}
            </p>
          </div>
        </div>
      </div>
    </div>
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

  useEffect(() => {
    attendanceAPI.getTimesheetSummary()
      .then(res => {
        if (res?.data) setAttendanceSummary(res.data)
      })
      .catch(() => {})
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

  // Calculate totals
  const totalHours = entries.reduce((sum, e) => sum + Number(e.hours_spent_today || e.hours_spent || 0), 0)
  const totalEntries = entries.length

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
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">Timesheet</h1>
              <p className="mt-1 text-indigo-100">Log weekly work, review attendance summary, and track approval status.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Hours"
          value={`${totalHours.toFixed(1)}h`}
          icon={Clock}
          color="indigo"
          subtitle={`${totalEntries} entries logged`}
        />
        <StatCard
          label="This Week"
          value={`${weekDays.reduce((sum, day) => sum + weeklyTotal(day), 0).toFixed(1)}h`}
          icon={Calendar}
          color="blue"
          subtitle="Current week total"
        />
        <StatCard
          label="Approved"
          value={entries.filter(e => e.status === 'approved').length}
          icon={CheckCircle2}
          color="emerald"
          subtitle="Approved entries"
        />
        <StatCard
          label="Pending"
          value={entries.filter(e => e.status === 'pending' || e.status === 'draft').length}
          icon={AlertTriangle}
          color="amber"
          subtitle="Awaiting approval"
        />
      </div>

      {/* Attendance Summary Block */}
      <AttendanceSummaryBlock summary={attendanceSummary} />

      {/* Weekly Grid */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-gray-900/50 dark:to-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                <Calendar className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Weekly Grid</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {format(weekStart, 'MMM d, yyyy')} - {format(weekDays[6], 'MMM d, yyyy')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setWeekOffset((value) => value - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setWeekOffset(0)}>
                Current
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setWeekOffset((value) => value + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={handleWeekSave} loading={savingWeek} className="gap-2">
                <Save className="h-4 w-4" />
                Save Week
              </Button>
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[240px_repeat(7,minmax(110px,1fr))] gap-2 border-b border-gray-200 pb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <div>Project / Task</div>
                {weekDays.map((day) => (
                  <div key={day.toISOString()} className={`text-center ${isSameDay(day, new Date()) ? 'text-indigo-600 dark:text-indigo-400' : ''}`}>
                    {format(day, 'EEE dd')}
                    {isSameDay(day, new Date()) && <span className="block text-[8px] text-indigo-400">Today</span>}
                  </div>
                ))}
              </div>
              <div className="space-y-2 pt-3">
                {rows.length ? rows.map((row) => (
                  <div key={row.label} className="grid grid-cols-[240px_repeat(7,minmax(110px,1fr))] gap-2">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm font-medium text-gray-800 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-100 truncate">
                      {row.label}
                    </div>
                    {weekDays.map((day) => {
                      const key = `${row.label}-${day.toISOString().slice(0, 10)}`
                      const isToday = isSameDay(day, new Date())
                      return (
                        <input
                          key={day.toISOString()}
                          className={`${inputClassName} text-center ${isToday ? 'border-indigo-300 dark:border-indigo-700' : ''}`}
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
                  <div className="py-8 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                      <Clock className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No weekly rows</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Log entries to populate the weekly grid.</p>
                  </div>
                )}
              </div>
              <div className="mt-4 grid grid-cols-[240px_repeat(7,minmax(110px,1fr))] gap-2 border-t border-gray-200 pt-3 text-xs dark:border-gray-700">
                <div className="font-semibold text-gray-700 dark:text-gray-300">Daily total</div>
                {weekDays.map((day) => (
                  <div key={day.toISOString()} className={`text-center font-bold ${isSameDay(day, new Date()) ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    {weeklyTotal(day).toFixed(1)}h
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Entry Form */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 bg-gradient-to-r from-emerald-50/50 to-white p-4 dark:border-gray-700 dark:from-emerald-900/20 dark:to-gray-800">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/30">
              <Zap className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">Quick Entry</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Log your hours quickly</p>
            </div>
          </div>
        </div>
        
        <div className="p-4">
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
            <div className="flex items-end">
              <label className="flex min-h-[42px] w-full items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-300 dark:hover:bg-gray-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_miscellaneous}
                  onChange={e => update('is_miscellaneous', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700"
                />
                Miscellaneous work
              </label>
            </div>
          </div>
          <Button className="mt-4" loading={create.isLoading} onClick={submit}>
            <Clock className="h-4 w-4 mr-2" />
            Save Hours
          </Button>
        </div>
      </div>

      {/* Entries Table */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-blue-50/50 to-white p-4 dark:border-gray-700 dark:from-blue-900/20 dark:to-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">My Entries</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{entries.length} entries logged</p>
              </div>
            </div>
            <Badge label={`${totalHours.toFixed(1)}h total`} colorKey="primary" />
          </div>
        </div>

        <div className="p-4">
          {mine.isLoading
            ? <SkeletonTable rows={6} cols={5} />
            : entries.length
              ? <Table columns={columns} data={entries} />
              : <div className="py-8 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <Clock className="h-6 w-6 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No timesheet entries</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Log hours to build your weekly timesheet.</p>
                </div>
          }
        </div>
      </div>
    </div>
  )
}