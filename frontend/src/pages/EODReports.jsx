import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ClipboardCheck, Edit3, Search, Send, Clock, Calendar, Users, Activity, CheckCircle2, AlertCircle, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { eodAPI } from '../api/eod'
import { Badge, Button, EmptyState, FormField, PageHeader, SkeletonCard, inputClassName } from '../components/ui'
import { ROLE, normalizeRole } from '../utils/roles'
import { useAuthStore } from '../store/authStore'
import { timeService } from '@/services/timeService'

const todayIso = () => timeService.toUtcISOString(timeService.now()).slice(0, 10)

export const canReviewEODReports = (role) => [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.MANAGER, ROLE.LEAD].includes(normalizeRole(role))

export const canSubmitOwnEODReport = (role) => ![ROLE.SUPER_ADMIN, ROLE.ADMIN].includes(normalizeRole(role))

// Stat Card Component
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
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

export default function EODReports() {
  const { user } = useAuthStore()
  const canReview = canReviewEODReports(user?.role)
  const canSubmitOwnReport = canSubmitOwnEODReport(user?.role)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mine, setMine] = useState(null)
  const [form, setForm] = useState({ worked_on: '', blockers: '', tomorrow_plan: '' })
  const [filters, setFilters] = useState({ report_date: todayIso(), search: '', team: '' })
  const [reports, setReports] = useState([])
  const [pending, setPending] = useState([])

  const loadMine = useCallback(async () => {
    const data = await eodAPI.today()
    setMine(data)
    setForm({
      worked_on: data.report?.worked_on || '',
      blockers: data.report?.blockers || '',
      tomorrow_plan: data.report?.tomorrow_plan || '',
    })
  }, [])

  const loadReview = useCallback(async () => {
    if (!canReview) return
    const [reportData, pendingData] = await Promise.all([
      eodAPI.list({ start_date: filters.report_date, end_date: filters.report_date, search: filters.search || undefined, team: filters.team || undefined }),
      eodAPI.pending({ report_date: filters.report_date, search: filters.search || undefined, team: filters.team || undefined }),
    ])
    setReports(reportData.reports || [])
    setPending(pendingData.pending || [])
  }, [canReview, filters.report_date, filters.search, filters.team])

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        setLoading(true)
        if (canSubmitOwnReport) await loadMine()
        if (active) await loadReview()
      } catch (error) {
        console.error(error)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [canReview, canSubmitOwnReport, loadMine, loadReview])

  useEffect(() => {
    loadReview().catch((error) => console.error(error))
  }, [filters.report_date, loadReview])

  const autoSummary = useMemo(() => mine?.auto_summary || {}, [mine?.auto_summary])
  const status = mine?.status || 'not_submitted'
  const statusLabel = status === 'not_submitted' ? 'Not Submitted' : status === 'leave' ? 'Leave' : 'Submitted'
  const isLeave = status === 'leave'
  const canSubmit = !isLeave && form.worked_on.trim()

  // Calculate stats for review section
  const totalSubmitted = reports.length
  const totalPending = pending.length

  const taskGroups = useMemo(() => ([
    ['Completed Tasks Today', autoSummary.completed_tasks || []],
    ['Tasks In Progress', autoSummary.in_progress_tasks || []],
    ['Tasks Assigned Today', autoSummary.assigned_today_tasks || []],
  ]), [autoSummary])

  const submit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    try {
      setSaving(true)
      await eodAPI.submit({ report_date: todayIso(), ...form })
      toast.success(status === 'submitted' ? 'EOD updated' : 'EOD submitted')
      await loadMine()
      await loadReview()
    } catch (error) {
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-500 dark:text-gray-400">Loading your EOD report...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">Daily Work Report</h1>
              <p className="mt-1 text-indigo-100">
                {canSubmitOwnReport ? 'Submit one simple end-of-day summary for today.' : 'Review submitted and pending end-of-day reports for your company.'}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {canSubmitOwnReport && (
              <span className={`inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium backdrop-blur-sm ${
                status === 'submitted' 
                  ? 'bg-emerald-500/30 text-emerald-100' 
                  : status === 'leave'
                  ? 'bg-amber-500/30 text-amber-100'
                  : 'bg-gray-500/30 text-gray-100'
              }`}>
                {status === 'submitted' && <CheckCircle2 className="h-4 w-4 mr-2" />}
                {status === 'leave' && <AlertCircle className="h-4 w-4 mr-2" />}
                {statusLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      {canSubmitOwnReport ? (
        <>
          {/* Stats for employee view */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Working Hours"
              value={formatSeconds(autoSummary.total_working_seconds)}
              icon={Clock}
              color="indigo"
              subtitle="Today's work"
            />
            <StatCard
              label="Completed"
              value={autoSummary.completed_tasks?.length || 0}
              icon={CheckCircle2}
              color="emerald"
              subtitle="Tasks done"
            />
            <StatCard
              label="In Progress"
              value={autoSummary.in_progress_tasks?.length || 0}
              icon={Activity}
              color="amber"
              subtitle="Ongoing tasks"
            />
            <StatCard
              label="Assigned"
              value={autoSummary.assigned_today_tasks?.length || 0}
              icon={TrendingUp}
              color="blue"
              subtitle="New tasks"
            />
          </div>

          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            {/* Submit Form */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                    <ClipboardCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900 dark:text-white">Today's EOD</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{format(new Date(), 'EEEE, MMM d, yyyy')}</p>
                  </div>
                </div>
                {status === 'submitted' && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit
                  </span>
                )}
              </div>

              {isLeave ? (
                <div className="mt-6 py-8 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
                    <Calendar className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">You're on Leave Today</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">An EOD report is not required.</p>
                </div>
              ) : (
                <form onSubmit={submit} className="mt-5 space-y-4">
                  <FormField label="What did you work on today?" required>
                    <textarea 
                      className={`${inputClassName} min-h-32 resize-y bg-gray-50 dark:bg-gray-900/50`} 
                      value={form.worked_on} 
                      onChange={(event) => setForm({ ...form, worked_on: event.target.value })} 
                      placeholder="Describe your accomplishments, tasks completed, and progress made..."
                    />
                  </FormField>
                  <FormField label="Any blockers?">
                    <textarea 
                      className={`${inputClassName} min-h-24 resize-y bg-gray-50 dark:bg-gray-900/50`} 
                      value={form.blockers} 
                      onChange={(event) => setForm({ ...form, blockers: event.target.value })} 
                      placeholder="Any obstacles or issues that prevented progress?"
                    />
                  </FormField>
                  <FormField label="Plan for tomorrow">
                    <textarea 
                      className={`${inputClassName} min-h-24 resize-y bg-gray-50 dark:bg-gray-900/50`} 
                      value={form.tomorrow_plan} 
                      onChange={(event) => setForm({ ...form, tomorrow_plan: event.target.value })} 
                      placeholder="What are your priorities for tomorrow?"
                    />
                  </FormField>
                  <Button type="submit" loading={saving} disabled={!canSubmit} className="w-full gap-2">
                    <Send className="h-4 w-4" />
                    {status === 'submitted' ? "Update Today's EOD" : "Submit Today's EOD"}
                  </Button>
                </form>
              )}
            </div>

            {/* Auto Summary */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="border-b border-gray-100 pb-3 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
                    <Activity className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900 dark:text-white">Auto Summary</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Pulled from tasks and attendance</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Working Hours</p>
                  <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{formatSeconds(autoSummary.total_working_seconds)}</p>
                </div>
                {taskGroups.slice(0, 2).map(([label, tasks]) => (
                  <div key={label} className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/50">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
                    <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{tasks.length}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-4">
                {taskGroups.map(([label, tasks]) => (
                  <div key={label}>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
                    <div className="mt-2 space-y-2">
                      {tasks.length ? tasks.slice(0, 5).map((task) => (
                        <div key={task.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-300">
                          {task.title}
                        </div>
                      )) : <p className="text-sm text-gray-400 dark:text-gray-500">No tasks found.</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}

      {canReview ? (
        <>
          {/* Stats for review section */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Submitted"
              value={totalSubmitted}
              icon={CheckCircle2}
              color="emerald"
              subtitle="Reports submitted"
            />
            <StatCard
              label="Pending"
              value={totalPending}
              icon={AlertCircle}
              color="amber"
              subtitle="Awaiting submission"
            />
            <StatCard
              label="Total"
              value={totalSubmitted + totalPending}
              icon={Users}
              color="indigo"
              subtitle="All reports"
            />
            <StatCard
              label="Completion"
              value={`${totalSubmitted + totalPending > 0 ? Math.round((totalSubmitted / (totalSubmitted + totalPending)) * 100) : 0}%`}
              icon={TrendingUp}
              color="blue"
              subtitle="Team completion rate"
            />
          </div>

          <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                    <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900 dark:text-white">Manager Review</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Submitted and pending EODs for your visible team</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <input 
                  className={`${inputClassName} md:w-48 bg-gray-50 dark:bg-gray-900/50`} 
                  type="date" 
                  value={filters.report_date} 
                  onChange={(event) => setFilters({ ...filters, report_date: event.target.value })} 
                />
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                  <input 
                    className={`${inputClassName} pl-9 bg-gray-50 dark:bg-gray-900/50`} 
                    placeholder="Search employees..." 
                    value={filters.search} 
                    onChange={(event) => setFilters({ ...filters, search: event.target.value })} 
                    onBlur={() => loadReview()} 
                  />
                </div>
                <input 
                  className={`${inputClassName} md:w-40 bg-gray-50 dark:bg-gray-900/50`} 
                  placeholder="Team" 
                  value={filters.team} 
                  onChange={(event) => setFilters({ ...filters, team: event.target.value })} 
                  onBlur={() => loadReview()} 
                />
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Submitted
                  </h3>
                  <div className="mt-3 space-y-3">
                    {reports.length ? reports.map((item) => (
                      <div key={item.id} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 transition hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-900/30 dark:hover:border-indigo-700">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{item.employee_name || 'Employee'}</p>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{item.worked_on}</p>
                          </div>
                          <Badge label="Submitted" colorKey="submitted" />
                        </div>
                      </div>
                    )) : <div className="py-8 text-center text-gray-500 dark:text-gray-400">No submitted EODs found.</div>}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    Pending
                  </h3>
                  <div className="mt-3 space-y-3">
                    {pending.length ? pending.map((item) => (
                      <div key={item.employee_id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{item.employee_name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{item.email}</p>
                        </div>
                        <Badge label={item.status === 'leave' ? 'Leave' : 'Pending'} colorKey={item.status === 'leave' ? 'pending' : 'draft'} />
                      </div>
                    )) : <div className="py-8 text-center text-gray-500 dark:text-gray-400">No pending EODs. Everyone has submitted or is on leave.</div>}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}

function SummaryStat({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  )
}

function formatSeconds(seconds = 0) {
  const total = Number(seconds || 0)
  const hrs = Math.floor(total / 3600)
  const mins = Math.floor((total % 3600) / 60)
  return `${hrs}h ${mins}m`
}