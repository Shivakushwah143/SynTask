import { useState, useEffect, useCallback, useRef } from 'react'
import {
  CalendarClock,
  Search,
  RefreshCw,
  MoreVertical,
  Eye,
  Edit2,
  XCircle,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Ban,
  FolderKanban,
  CheckSquare,
  X,
  ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, formatDistanceToNow } from 'date-fns'
import { scheduledJobsAPI } from '../api/scheduledJobs'
import { useAuthStore } from '../store/authStore'
import { normalizeRole, ROLE } from '../utils/roles'
import { PageHeader, EmptyState, Badge, Button, Modal, FormField } from '../components/ui'
import { inputClassName } from '../components/ui'

/* ─── Constants ──────────────────────────────────────────────── */
const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'RUNNING', label: 'Running' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'FAILED', label: 'Failed' },
  { key: 'CANCELLED', label: 'Cancelled' },
]

const ACTION_LABELS = {
  CREATE_PROJECT: 'Create Project',
  CREATE_TASK: 'Create Task',
}

const ACTION_ICONS = {
  CREATE_PROJECT: FolderKanban,
  CREATE_TASK: CheckSquare,
}

/* ─── Helpers ─────────────────────────────────────────────────── */
function statusConfig(status) {
  switch (status) {
    case 'PENDING':
      return { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', label: 'Pending' }
    case 'RUNNING':
      return { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800', label: 'Running', spin: true }
    case 'COMPLETED':
      return { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', label: 'Completed' }
    case 'FAILED':
      return { icon: AlertCircle, color: 'text-danger-500', bg: 'bg-danger-50 dark:bg-danger-950/30', border: 'border-danger-200 dark:border-danger-800', label: 'Failed' }
    case 'CANCELLED':
      return { icon: Ban, color: 'text-gray-400', bg: 'bg-gray-50 dark:bg-gray-900/30', border: 'border-gray-200 dark:border-gray-700', label: 'Cancelled' }
    default:
      return { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-50', border: 'border-gray-200', label: status }
  }
}

function payloadSummary(job) {
  const p = job.payload || {}
  if (job.action_type === 'CREATE_PROJECT') return p.name || p.key || '—'
  if (job.action_type === 'CREATE_TASK') return p.title || '—'
  return '—'
}

function formatRunAt(runAt) {
  if (!runAt) return '—'
  try {
    const d = new Date(runAt)
    return format(d, 'MMM d, yyyy · HH:mm')
  } catch {
    return runAt
  }
}

function relativeTo(runAt) {
  if (!runAt) return ''
  try {
    return formatDistanceToNow(new Date(runAt), { addSuffix: true })
  } catch {
    return ''
  }
}

/* ─── Status Badge ────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const cfg = statusConfig(status)
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.border} ${cfg.color}`}>
      <Icon className={`h-3 w-3 ${cfg.spin ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  )
}

/* ─── Action Type Badge ───────────────────────────────────────── */
function ActionBadge({ actionType }) {
  const Icon = ACTION_ICONS[actionType] || CalendarClock
  const label = ACTION_LABELS[actionType] || actionType
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-primary-100 bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 dark:border-primary-800/40 dark:bg-primary-950/30 dark:text-primary-300">
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

/* ─── Detail Drawer ───────────────────────────────────────────── */
function JobDetailDrawer({ job, onClose }) {
  if (!job) return null
  const cfg = statusConfig(job.status)
  const payloadEntries = Object.entries(job.payload || {}).filter(([, v]) => v !== null && v !== undefined && v !== '')

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Job details">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl dark:bg-[var(--color-app-surface)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-gradient-to-r from-primary-50/80 via-white to-white p-5 dark:border-[var(--color-app-border)] dark:from-[var(--color-app-surface-muted)] dark:via-[var(--color-app-surface)] dark:to-[var(--color-app-surface)]">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">Job Details</p>
            <h2 className="mt-0.5 truncate text-base font-bold text-gray-900 dark:text-[var(--color-app-text)]">
              {payloadSummary(job)}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ActionBadge actionType={job.action_type} />
              <StatusBadge status={job.status} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Timing */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Timing</h3>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-subtle)]">
              <Row label="Scheduled for" value={formatRunAt(job.run_at)} sub={relativeTo(job.run_at)} />
              <Row label="Created at" value={formatRunAt(job.created_at)} />
              {job.completed_at && <Row label="Completed at" value={formatRunAt(job.completed_at)} />}
            </div>
          </section>

          {/* Creator */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Creator</h3>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-subtle)]">
              <Row label="Scheduled by" value={job.created_by_name || job.created_by} />
              <Row label="Retry count" value={job.retry_count} />
            </div>
          </section>

          {/* Notes */}
          {job.notes && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</h3>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-subtle)]">
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{job.notes}</p>
              </div>
            </section>
          )}

          {/* Payload */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Action Payload</h3>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-subtle)]">
              {payloadEntries.length === 0 && <p className="text-xs text-gray-400">No payload data</p>}
              {payloadEntries.map(([k, v]) => (
                <Row key={k} label={k.replace(/_/g, ' ')} value={Array.isArray(v) ? v.join(', ') : String(v)} />
              ))}
            </div>
          </section>

          {/* Error */}
          {job.error && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-danger-500">Error</h3>
              <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 dark:border-danger-800 dark:bg-danger-950/30">
                <p className="text-sm text-danger-700 dark:text-danger-300 font-mono whitespace-pre-wrap break-all">{job.error}</p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, sub }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-gray-500 capitalize shrink-0">{label}</span>
      <span className="text-xs font-medium text-gray-800 text-right dark:text-gray-200">
        {value}
        {sub && <span className="block text-[10px] text-gray-400">{sub}</span>}
      </span>
    </div>
  )
}

/* ─── Edit Schedule Modal ─────────────────────────────────────── */
function EditScheduleModal({ job, onClose, onSaved }) {
  const [value, setValue] = useState(() => {
    if (!job?.run_at) return ''
    try {
      const d = new Date(job.run_at)
      return d.toISOString().slice(0, 16)
    } catch {
      return ''
    }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setError('')
    if (!value) { setError('Select a new execution time.'); return }
    const runAt = new Date(value)
    if (isNaN(runAt)) { setError('Invalid date.'); return }
    if (runAt <= new Date()) { setError('Must be in the future.'); return }
    try {
      setSaving(true)
      await scheduledJobsAPI.updateSchedule(job.id, { run_at: runAt.toISOString() })
      toast.success('Schedule updated')
      onSaved()
      onClose()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to update schedule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={!!job} onClose={onClose} title="Edit Schedule" size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} loading={saving} loadingText="Saving…" id="edit-schedule-save-btn">
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormField label="New execution time" error={error} required>
          <input type="datetime-local" className={inputClassName} value={value} onChange={(e) => { setValue(e.target.value); setError('') }} id="edit-schedule-datetime" />
        </FormField>
        <p className="text-xs text-gray-500">Time is treated as UTC.</p>
      </div>
    </Modal>
  )
}

/* ─── Row Menu ────────────────────────────────────────────────── */
function JobRowMenu({ job, onView, onEdit, onCancel, onRetry, onDelete }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const items = [
    { label: 'View details', icon: Eye, action: onView, always: true },
    { label: 'Edit schedule', icon: Edit2, action: onEdit, show: job.status === 'PENDING' },
    { label: 'Cancel', icon: XCircle, action: onCancel, show: ['PENDING', 'FAILED'].includes(job.status), danger: true },
    { label: 'Retry', icon: RotateCcw, action: onRetry, show: ['FAILED', 'CANCELLED'].includes(job.status) },
    { label: 'Delete', icon: Trash2, action: onDelete, show: ['COMPLETED', 'CANCELLED', 'FAILED'].includes(job.status), danger: true },
  ].filter((item) => item.always || item.show)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        aria-label="Job actions"
        id={`job-menu-${job.id}`}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-xl border border-gray-100 bg-white py-1 shadow-lg dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.label}
                onClick={(e) => { e.stopPropagation(); setOpen(false); item.action?.() }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${item.danger ? 'text-danger-600 dark:text-danger-400' : 'text-gray-700 dark:text-gray-300'}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Main Page ───────────────────────────────────────────────── */
export default function ScheduledJobs() {
  const { user } = useAuthStore()
  const userRole = normalizeRole(user?.role)
  const canSchedule = [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.MANAGER, ROLE.LEAD].includes(userRole)

  const [jobs, setJobs] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [detailJob, setDetailJob] = useState(null)
  const [editJob, setEditJob] = useState(null)
  const [page, setPage] = useState(0)
  const pageSize = 20
  const autoRefreshRef = useRef(null)

  const loadJobs = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true)
      else setRefreshing(true)
      const data = await scheduledJobsAPI.listJobs({
        status: activeTab || undefined,
        search: search || undefined,
        skip: page * pageSize,
        limit: pageSize,
      })
      setJobs(data.jobs || [])
      setTotal(data.total || 0)
    } catch {
      if (!silent) toast.error('Failed to load scheduled jobs')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeTab, search, page])

  useEffect(() => { loadJobs() }, [loadJobs])

  // Auto-refresh every 15s when running jobs exist
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === 'RUNNING')
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current)
    if (hasRunning) {
      autoRefreshRef.current = setInterval(() => loadJobs({ silent: true }), 15000)
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current) }
  }, [jobs, loadJobs])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const handleTabChange = (key) => { setActiveTab(key); setPage(0) }

  /* Actions */
  const handleCancel = async (job) => {
    try {
      await scheduledJobsAPI.cancelSchedule(job.id)
      toast.success('Job cancelled')
      loadJobs({ silent: true })
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to cancel job')
    }
  }

  const handleRetry = async (job) => {
    try {
      await scheduledJobsAPI.retryJob(job.id)
      toast.success('Job queued for retry')
      loadJobs({ silent: true })
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to retry job')
    }
  }

  const handleDelete = async (job) => {
    try {
      await scheduledJobsAPI.deleteJob(job.id)
      toast.success('Job deleted')
      loadJobs({ silent: true })
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete job')
    }
  }

  /* Tab counts */
  const pendingCount = jobs.filter((j) => j.status === 'PENDING').length
  const runningCount = jobs.filter((j) => j.status === 'RUNNING').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scheduled Jobs"
        description="Manage future-scheduled actions for Projects and Tasks."
        actions={
          <div className="flex items-center gap-2 pr-3 sm:pr-4 lg:pr-6">
            <button
              onClick={() => loadJobs({ silent: true })}
              disabled={refreshing}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] dark:text-gray-300 dark:hover:bg-[var(--color-app-surface-muted)]"
              aria-label="Refresh"
              id="scheduled-jobs-refresh-btn"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        }
      />

      {/* Info banner for non-schedulers */}
      {!canSchedule && (
        <div className="card flex items-center gap-3 border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Only Admins, Managers and Leads can schedule actions. Contact your administrator to grant access.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {STATUS_TABS.slice(1).map((tab) => {
          const count = jobs.filter((j) => j.status === tab.key).length
          const cfg = statusConfig(tab.key)
          const Icon = cfg.icon
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`card flex flex-col gap-1 p-4 text-left transition-all hover:shadow-md ${activeTab === tab.key ? 'ring-2 ring-primary-500' : ''}`}
              id={`stat-card-${tab.key.toLowerCase()}`}
            >
              <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${cfg.bg} ${cfg.border} border`}>
                <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
              </span>
              <span className="mt-1 text-2xl font-bold text-gray-900 dark:text-[var(--color-app-text)]">{count}</span>
              <span className="text-xs text-gray-500">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Search + Tab Filter */}
      <div className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className="input w-full pl-9"
              placeholder="Search by name, action type, project ID…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              id="scheduled-jobs-search"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-subtle)]">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                id={`tab-${tab.key || 'all'}`}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  activeTab === tab.key
                    ? 'bg-white text-primary-600 shadow-sm dark:bg-[var(--color-app-surface)] dark:text-primary-400'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
                {tab.key === 'PENDING' && pendingCount > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                    {pendingCount}
                  </span>
                )}
                {tab.key === 'RUNNING' && runningCount > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white">
                    {runningCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex flex-col gap-3 p-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-gray-200 dark:bg-gray-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-48 rounded bg-gray-200 dark:bg-gray-800" />
                  <div className="h-2.5 w-32 rounded bg-gray-100 dark:bg-gray-700" />
                </div>
                <div className="h-6 w-20 rounded-full bg-gray-200 dark:bg-gray-800" />
                <div className="h-7 w-7 rounded-lg bg-gray-200 dark:bg-gray-800" />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-10 w-10 text-gray-300" />}
            title={search ? 'No matching jobs' : activeTab ? `No ${activeTab.toLowerCase()} jobs` : 'No scheduled jobs yet'}
            description={
              search
                ? 'Try adjusting your search query.'
                : 'Use "Schedule" when creating a project or task to queue actions for the future.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-subtle)]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name / Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Scheduled For</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Created By</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Retries</th>
                  <th className="w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-[var(--color-app-border)]">
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="group cursor-pointer transition-colors hover:bg-primary-50/40 dark:hover:bg-primary-950/10"
                    onClick={() => setDetailJob(job)}
                    id={`job-row-${job.id}`}
                  >
                    <td className="px-4 py-3.5">
                      <ActionBadge actionType={job.action_type} />
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-medium text-gray-900 dark:text-[var(--color-app-text)]">{payloadSummary(job)}</span>
                      {job.notes && (
                        <p className="mt-0.5 truncate text-xs text-gray-400 max-w-[200px]">{job.notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={job.status} />
                      {job.error && job.status === 'FAILED' && (
                        <p className="mt-0.5 truncate text-xs text-danger-500 max-w-[160px]" title={job.error}>
                          {job.error.slice(0, 60)}{job.error.length > 60 ? '…' : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-gray-700 dark:text-gray-300">
                      <span>{formatRunAt(job.run_at)}</span>
                      <span className="block text-xs text-gray-400">{relativeTo(job.run_at)}</span>
                    </td>
                    <td className="px-4 py-3.5 text-gray-600 dark:text-gray-400">
                      {job.created_by_name || '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${job.retry_count > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800'}`}>
                        {job.retry_count}
                      </span>
                    </td>
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <JobRowMenu
                        job={job}
                        onView={() => setDetailJob(job)}
                        onEdit={() => setEditJob(job)}
                        onCancel={() => handleCancel(job)}
                        onRetry={() => handleRetry(job)}
                        onDelete={() => handleDelete(job)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 dark:border-[var(--color-app-border)]">
            <p className="text-xs text-gray-500">
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-[var(--color-app-border)] dark:text-gray-400"
                id="scheduled-jobs-prev-page"
              >
                Previous
              </button>
              <button
                disabled={(page + 1) * pageSize >= total}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-[var(--color-app-border)] dark:text-gray-400"
                id="scheduled-jobs-next-page"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals / Drawers */}
      {detailJob && <JobDetailDrawer job={detailJob} onClose={() => setDetailJob(null)} />}
      {editJob && (
        <EditScheduleModal
          job={editJob}
          onClose={() => setEditJob(null)}
          onSaved={() => loadJobs({ silent: true })}
        />
      )}
    </div>
  )
}
