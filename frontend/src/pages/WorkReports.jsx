import { useState } from 'react'
import { useQuery } from 'react-query'
import { FileBarChart2 } from 'lucide-react'
import { workReportsAPI } from '../api/workReports'
import { Button, EmptyState, PageHeader, SkeletonCard } from '../components/ui'

export default function WorkReports() {
  const [view, setView] = useState('tasks')
  const [status, setStatus] = useState('')
  const [health, setHealth] = useState('')
  const [page, setPage] = useState(1)
  const params = { page, page_size: 20, ...(status ? { status_filter: status } : {}), ...(health ? { health } : {}) }
  const { data, isLoading, isError } = useQuery(['work-report', view, params], () => (
    view === 'tasks' ? workReportsAPI.tasks(params) : workReportsAPI.projects({ page, page_size: 20, ...(health ? { health } : {}) })
  ), { keepPreviousData: true })

  const rows = data?.tasks || data?.projects || []
  const totalPages = data?.total_pages || 1

  return (
    <div className="space-y-6">
      <PageHeader title="Work Reports" description="Filtered operational work data." />
      <div className="flex flex-wrap gap-2">
        <Button variant={view === 'tasks' ? 'primary' : 'secondary'} size="sm" onClick={() => { setView('tasks'); setPage(1) }}>Tasks</Button>
        <Button variant={view === 'projects' ? 'primary' : 'secondary'} size="sm" onClick={() => { setView('projects'); setPage(1) }}>Projects</Button>
        {view === 'tasks' && <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} className="rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-text-primary"><option value="">All statuses</option><option value="assigned">Assigned</option><option value="in_progress">In progress</option><option value="in_review">In review</option><option value="completed">Completed</option></select>}
        <select value={health} onChange={(event) => { setHealth(event.target.value); setPage(1) }} className="rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-text-primary"><option value="">All health</option><option value="healthy">Healthy</option><option value="due_today">Due today</option><option value="overdue">Overdue</option><option value="at_risk">At risk</option></select>
      </div>
      {isLoading ? <SkeletonCard /> : isError ? <EmptyState icon={FileBarChart2} title="Could not load work reports" description="The report could not be loaded." /> : (
        <div className="overflow-hidden rounded-lg border border-surface-border bg-surface">
          <div className="divide-y divide-surface-border">
            {rows.map((row) => <div key={row.task_id || row.project_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"><span className="font-medium text-text-primary">{row.title || row.name}</span><span className="text-text-muted">{row.status || row.health || ''}</span></div>)}
            {!rows.length && <div className="px-4 py-8 text-center text-sm text-text-muted">No results</div>}
          </div>
          <div className="flex items-center justify-between border-t border-surface-border px-4 py-3 text-sm text-text-muted"><span>{data?.total || 0} results</span><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>
        </div>
      )}
    </div>
  )
}
