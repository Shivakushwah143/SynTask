import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ClipboardCheck, Edit3, Search, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { eodAPI } from '../api/eod'
import { Badge, Button, EmptyState, FormField, PageHeader, SkeletonCard, inputClassName } from '../components/ui'
import { ROLE, normalizeRole } from '../utils/roles'
import { useAuthStore } from '../store/authStore'

const todayIso = () => new Date().toISOString().slice(0, 10)

export default function EODReports() {
  const { user } = useAuthStore()
  const role = normalizeRole(user?.role)
  const canReview = [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.MANAGER, ROLE.LEAD].includes(role)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mine, setMine] = useState(null)
  const [form, setForm] = useState({ worked_on: '', blockers: '', tomorrow_plan: '' })
  const [filters, setFilters] = useState({ report_date: todayIso(), search: '', team: '' })
  const [reports, setReports] = useState([])
  const [pending, setPending] = useState([])

  const loadMine = async () => {
    const data = await eodAPI.today()
    setMine(data)
    setForm({
      worked_on: data.report?.worked_on || '',
      blockers: data.report?.blockers || '',
      tomorrow_plan: data.report?.tomorrow_plan || '',
    })
  }

  const loadReview = async () => {
    if (!canReview) return
    const [reportData, pendingData] = await Promise.all([
      eodAPI.list({ start_date: filters.report_date, end_date: filters.report_date, search: filters.search || undefined, team: filters.team || undefined }),
      eodAPI.pending({ report_date: filters.report_date, search: filters.search || undefined, team: filters.team || undefined }),
    ])
    setReports(reportData.reports || [])
    setPending(pendingData.pending || [])
  }

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        setLoading(true)
        await loadMine()
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
  }, [canReview])

  useEffect(() => {
    loadReview().catch((error) => console.error(error))
  }, [filters.report_date])

  const autoSummary = mine?.auto_summary || {}
  const status = mine?.status || 'not_submitted'
  const statusLabel = status === 'not_submitted' ? 'Not Submitted' : status === 'leave' ? 'Leave' : 'Submitted'
  const isLeave = status === 'leave'
  const canSubmit = !isLeave && form.worked_on.trim()

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
      <div className="space-y-6">
        <PageHeader title="Daily Work Report" description="Loading today's report..." />
        <SkeletonCard lines={8} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily Work Report"
        description="Submit one simple end-of-day summary for today."
        actions={<Badge label={statusLabel} colorKey={status === 'leave' ? 'pending' : status === 'submitted' ? 'submitted' : 'draft'} />}
      />

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Today&apos;s EOD</h2>
              <p className="mt-1 text-sm text-text-muted">{format(new Date(), 'EEEE, MMM d, yyyy')}</p>
            </div>
            {status === 'submitted' ? <Edit3 className="h-5 w-5 text-primary-600" /> : <ClipboardCheck className="h-5 w-5 text-primary-600" />}
          </div>

          {isLeave ? (
            <EmptyState title="Leave" description="You are on approved leave today, so an EOD report is not required." />
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <FormField label="What did you work on today?" required>
                <textarea className={`${inputClassName} min-h-32 resize-y`} value={form.worked_on} onChange={(event) => setForm({ ...form, worked_on: event.target.value })} />
              </FormField>
              <FormField label="Any blockers?">
                <textarea className={`${inputClassName} min-h-24 resize-y`} value={form.blockers} onChange={(event) => setForm({ ...form, blockers: event.target.value })} />
              </FormField>
              <FormField label="Plan for tomorrow">
                <textarea className={`${inputClassName} min-h-24 resize-y`} value={form.tomorrow_plan} onChange={(event) => setForm({ ...form, tomorrow_plan: event.target.value })} />
              </FormField>
              <Button type="submit" loading={saving} disabled={!canSubmit}>
                <Send className="h-4 w-4" />
                {status === 'submitted' ? "Edit Today's EOD" : "Submit Today's EOD"}
              </Button>
            </form>
          )}
        </div>

        <div className="card p-5">
          <h2 className="text-base font-semibold text-text-primary">Auto Summary</h2>
          <p className="mt-1 text-sm text-text-muted">Pulled from tasks and attendance.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <SummaryStat label="Working Hours" value={formatSeconds(autoSummary.total_working_seconds)} />
            {taskGroups.map(([label, tasks]) => <SummaryStat key={label} label={label} value={tasks.length} />)}
          </div>
          <div className="mt-5 space-y-4">
            {taskGroups.map(([label, tasks]) => (
              <div key={label}>
                <p className="text-sm font-medium text-text-secondary">{label}</p>
                <div className="mt-2 space-y-2">
                  {tasks.length ? tasks.slice(0, 5).map((task) => (
                    <div key={task.id} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary">
                      {task.title}
                    </div>
                  )) : <p className="text-sm text-text-muted">No tasks found.</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {canReview ? (
        <section className="card p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Manager Review</h2>
              <p className="mt-1 text-sm text-text-muted">Submitted and pending EODs for your visible team.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className={inputClassName} type="date" value={filters.report_date} onChange={(event) => setFilters({ ...filters, report_date: event.target.value })} />
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-text-muted" />
                <input className={`${inputClassName} pl-9`} placeholder="Search employees" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} onBlur={() => loadReview()} />
              </div>
              <input className={inputClassName} placeholder="Team" value={filters.team} onChange={(event) => setFilters({ ...filters, team: event.target.value })} onBlur={() => loadReview()} />
            </div>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <ReviewList title="Submitted" items={reports} empty="No submitted EODs found." />
            <PendingList items={pending} />
          </div>
        </section>
      ) : null}
    </div>
  )
}

function SummaryStat({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted p-4">
      <p className="text-xs font-semibold uppercase text-text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  )
}

function ReviewList({ title, items, empty }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <div className="mt-3 space-y-3">
        {items.length ? items.map((item) => (
          <div key={item.id} className="rounded-xl border border-border bg-surface px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-text-primary">{item.employee_name || 'Employee'}</p>
                <p className="mt-1 text-sm text-text-muted">{item.worked_on}</p>
              </div>
              <Badge label="Submitted" colorKey="submitted" />
            </div>
          </div>
        )) : <EmptyState title={empty} description="Adjust the filters or check another date." />}
      </div>
    </div>
  )
}

function PendingList({ items }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary">Pending</h3>
      <div className="mt-3 space-y-3">
        {items.length ? items.map((item) => (
          <div key={item.employee_id} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
            <div>
              <p className="font-medium text-text-primary">{item.employee_name}</p>
              <p className="text-sm text-text-muted">{item.email}</p>
            </div>
            <Badge label={item.status === 'leave' ? 'Leave' : 'Pending'} colorKey={item.status === 'leave' ? 'pending' : 'draft'} />
          </div>
        )) : <EmptyState title="No pending EODs" description="Everyone visible has submitted or is on leave." />}
      </div>
    </div>
  )
}

function formatSeconds(seconds = 0) {
  const total = Number(seconds || 0)
  const hrs = Math.floor(total / 3600)
  const mins = Math.floor((total % 3600) / 60)
  return `${hrs}h ${mins}m`
}
