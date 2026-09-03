import { useState } from 'react'
import { useQuery } from 'react-query'
import { FileBarChart2 } from 'lucide-react'
import { workReportsAPI } from '../api/workReports'
import { Button, PageHeader, SkeletonCard } from '../components/ui'

export default function WorkReports() {
  const [view, setView] = useState('tasks')
  const [status, setStatus] = useState('')
  const [health, setHealth] = useState('')
  const [priority, setPriority] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const taskParams = {
    page,
    page_size: pageSize,
    ...(status ? { status_filter: status } : {}),
    ...(priority ? { priority } : {}),
    ...(health ? { health } : {}),
  }

  const projectParams = {
    page,
    page_size: pageSize,
    ...(health ? { health } : {}),
    ...(status ? { status } : {}),
  }

  const { data, isLoading, isError, error } = useQuery(
    ['work-report', view, view === 'tasks' ? taskParams : projectParams],
    () => view === 'tasks' ? workReportsAPI.tasks(taskParams) : workReportsAPI.projects(projectParams),
    { keepPreviousData: true }
  )

  const rows = data?.tasks || data?.projects || []
  const totalPages = data?.total_pages || 1
  const total = data?.total || 0

  return (
    <div className="space-y-6">
      <PageHeader title="Work Reports" description="Filtered operational work data across projects and tasks." />

      {/* View Toggle + Filters */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex gap-1 rounded-lg border border-surface-border bg-surface-muted p-0.5">
          <Button variant={view === 'tasks' ? 'primary' : 'ghost'} size="sm" onClick={() => { setView('tasks'); setPage(1) }}>Tasks</Button>
          <Button variant={view === 'projects' ? 'primary' : 'ghost'} size="sm" onClick={() => { setView('projects'); setPage(1) }}>Projects</Button>
        </div>

        {view === 'tasks' && (
          <>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-text-primary">
              <option value="">All statuses</option>
              <option value="todo">Todo</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In progress</option>
              <option value="in_review">In review</option>
              <option value="revision_required">Revision required</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1) }} className="rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-text-primary">
              <option value="">All priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </>
        )}

        {view === 'projects' && (
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-text-primary">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="execution">Execution</option>
            <option value="review">Review</option>
            <option value="completed">Completed</option>
            <option value="reporting">Reporting</option>
            <option value="archived">Archived</option>
          </select>
        )}

        <select value={health} onChange={(e) => { setHealth(e.target.value); setPage(1) }} className="rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-text-primary">
          <option value="">All health</option>
          <option value="healthy">Healthy</option>
          <option value="due_today">Due today</option>
          <option value="overdue">Overdue</option>
          <option value="at_risk">At risk</option>
        </select>
      </div>

      {/* Content */}
      {isLoading && !data ? (
        <SkeletonCard lines={8} />
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950/30">
          <FileBarChart2 className="mx-auto h-8 w-8 text-red-400" />
          <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">Could not load work reports</p>
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error?.message || 'An unexpected error occurred'}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-surface-border bg-surface">
          {/* Table Header */}
          {view === 'tasks' ? (
            <div className="grid grid-cols-[1fr_120px_100px_100px_100px] gap-2 border-b border-surface-border bg-surface-muted px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              <span>Title</span>
              <span>Status</span>
              <span>Priority</span>
              <span>Health</span>
              <span>Due</span>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_120px_100px_100px_100px_100px] gap-2 border-b border-surface-border bg-surface-muted px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              <span>Name</span>
              <span>Status</span>
              <span>Health</span>
              <span>Progress</span>
              <span>Open</span>
              <span>Overdue</span>
            </div>
          )}

          {/* Table Body */}
          <div className="divide-y divide-surface-border">
            {rows.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <FileBarChart2 className="mx-auto h-8 w-8 text-text-muted opacity-40" />
                <p className="mt-2 text-sm font-medium text-text-primary">No results</p>
                <p className="mt-1 text-xs text-text-muted">Try adjusting your filters</p>
              </div>
            ) : view === 'tasks' ? (
              rows.map((row) => (
                <div key={row.task_id || row.id} className="grid grid-cols-[1fr_120px_100px_100px_100px] gap-2 px-4 py-3 text-sm hover:bg-surface-muted/50">
                  <span className="truncate font-medium text-text-primary">{row.title || 'Untitled'}</span>
                  <StatusBadge status={row.status} />
                  <span className="text-text-muted">{row.priority || '—'}</span>
                  <HealthBadge health={row.health} />
                  <span className="text-text-muted text-xs">{row.due_date ? new Date(row.due_date).toLocaleDateString() : '—'}</span>
                </div>
              ))
            ) : (
              rows.map((row) => (
                <div key={row.project_id || row.id} className="grid grid-cols-[1fr_120px_100px_100px_100px_100px] gap-2 px-4 py-3 text-sm hover:bg-surface-muted/50">
                  <span className="truncate font-medium text-text-primary">{row.name || 'Untitled'}</span>
                  <StatusBadge status={row.status} />
                  <HealthBadge health={row.health} />
                  <span className="text-text-muted">{row.progress != null ? `${row.progress}%` : '—'}</span>
                  <span className="text-text-muted">{row.open_tasks ?? '—'}</span>
                  <span className={row.overdue_tasks > 0 ? 'font-medium text-red-600' : 'text-text-muted'}>{row.overdue_tasks ?? '—'}</span>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-surface-border px-4 py-3 text-sm text-text-muted">
            <span>{total} total results</span>
            <div className="flex items-center gap-2">
              <span className="text-xs">Page {page} of {totalPages}</span>
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  if (!status) return <span className="text-text-muted">—</span>
  const colors = {
    todo: 'bg-gray-100 text-gray-700',
    assigned: 'bg-indigo-100 text-indigo-700',
    in_progress: 'bg-blue-100 text-blue-700',
    in_review: 'bg-yellow-100 text-yellow-700',
    revision_required: 'bg-red-100 text-red-700',
    completed: 'bg-green-100 text-green-700',
    active: 'bg-blue-100 text-blue-700',
    execution: 'bg-blue-100 text-blue-700',
    review: 'bg-yellow-100 text-yellow-700',
    reporting: 'bg-purple-100 text-purple-700',
    archived: 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {(status || '').replace(/_/g, ' ')}
    </span>
  )
}

function HealthBadge({ health }) {
  if (!health) return <span className="text-text-muted">—</span>
  const colors = {
    healthy: 'bg-green-100 text-green-700',
    at_risk: 'bg-red-100 text-red-700',
    needs_attention: 'bg-amber-100 text-amber-700',
    overdue: 'bg-red-100 text-red-700',
    due_today: 'bg-orange-100 text-orange-700',
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[health] || 'bg-gray-100 text-gray-600'}`}>
      {(health || '').replace(/_/g, ' ')}
    </span>
  )
}
