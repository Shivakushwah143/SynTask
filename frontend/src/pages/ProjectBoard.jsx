import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, ArrowRight, Filter, Plus, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { projectsApi } from '../api/projects'
import { tasksAPI } from '../api/tasks'
import { usersAPI } from '../api/users'
import { useAuthStore } from '../store/authStore'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { hasCompanyAdminAccess, isLeadRole } from '../utils/roles'
import { Badge, Button, EmptyState, FormField, Modal, PageHeader, SkeletonCard, SkeletonKanban, SkeletonTable, inputClassName } from '../components/ui'

const DEFAULT_STATUSES = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'In Review' },
  { id: 'completed', label: 'Completed' },
]

export default function ProjectBoard() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isMobile = useMediaQuery('(max-width: 767px)')
  const canManageColumns = hasCompanyAdminAccess(user?.role) || isLeadRole(user?.role)
  const [activeTab, setActiveTab] = useState('board')
  const [loading, setLoading] = useState(true)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [loadingPages, setLoadingPages] = useState(false)
  const [projectInfo, setProjectInfo] = useState(null)
  const [boardData, setBoardData] = useState(null)
  const [summaryData, setSummaryData] = useState(null)
  const [pages, setPages] = useState([])
  const [projectFiles, setProjectFiles] = useState([])
  const [assignableUsers, setAssignableUsers] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState({ priority: '', assignee: '', label: '' })
  const [showFilters, setShowFilters] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState('todo')
  const [statuses, setStatuses] = useState(DEFAULT_STATUSES)
  const [submitting, setSubmitting] = useState(false)
  const [updatingTaskId, setUpdatingTaskId] = useState(null)

  const loadProjectInfo = useCallback(async () => {
    try {
      const response = await projectsApi.getProject(projectId)
      setProjectInfo(response.data)
    } catch (error) {
      console.error(error)
    }
  }, [projectId])

  const loadAssignableUsers = useCallback(async () => {
    try {
      const data = await usersAPI.getAssignableUsers(false, projectId)
      setAssignableUsers(data.users || [])
    } catch (error) {
      setAssignableUsers([])
    }
  }, [projectId])

  const loadBoardData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await projectsApi.getProjectBoard(projectId)
      setBoardData(response.data)
      setStatuses(response.data.board_columns?.length ? response.data.board_columns : DEFAULT_STATUSES)
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to load project board')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const loadSummaryData = useCallback(async () => {
    try {
      setLoadingSummary(true)
      const response = await projectsApi.getProjectSummary(projectId, 7)
      setSummaryData(response.data)
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to load project summary')
    } finally {
      setLoadingSummary(false)
    }
  }, [projectId])

  const loadPages = useCallback(async () => {
    try {
      setLoadingPages(true)
      const response = await projectsApi.getPages(projectId)
      setPages(response.data.pages || [])
      const files = await projectsApi.getProjectFiles(projectId)
      setProjectFiles(files.data.files || [])
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to load pages')
    } finally {
      setLoadingPages(false)
    }
  }, [projectId])

  useEffect(() => {
    loadProjectInfo()
    loadAssignableUsers()
  }, [loadAssignableUsers, loadProjectInfo])

  useEffect(() => {
    if (activeTab === 'board') loadBoardData()
    if (activeTab === 'summary') loadSummaryData()
    if (activeTab === 'pages') loadPages()
  }, [activeTab, loadBoardData, loadPages, loadSummaryData])

  useEffect(() => {
    const refreshBoard = () => {
      if (activeTab === 'board') {
        loadBoardData()
      }
    }
    window.addEventListener('syntask:tasks-updated', refreshBoard)
    return () => window.removeEventListener('syntask:tasks-updated', refreshBoard)
  }, [activeTab, loadBoardData])

  const filteredBoard = useMemo(() => {
    if (!boardData?.tasks_by_status) return {}
    const query = searchQuery.trim().toLowerCase()
    return Object.entries(boardData.tasks_by_status).reduce((acc, [status, tasks]) => {
      acc[status] = (tasks || []).filter((task) => {
        const matchesQuery = !query || [task.title, task.description, task.id].filter(Boolean).some((value) => String(value).toLowerCase().includes(query))
        const matchesPriority = !filters.priority || (task.priority || '').toLowerCase() === filters.priority
        const matchesAssignee = !filters.assignee || task.assigned_to === filters.assignee
        const matchesLabel = !filters.label || (task.tags || []).includes(filters.label)
        return matchesQuery && matchesPriority && matchesAssignee && matchesLabel
      })
      return acc
    }, {})
  }, [boardData, filters.assignee, filters.label, filters.priority, searchQuery])

  const availableLabels = useMemo(() => {
    const labels = new Set()
    Object.values(boardData?.tasks_by_status || {}).flat().forEach((task) => {
      (task.tags || []).forEach((tag) => labels.add(tag))
    })
    return [...labels].sort()
  }, [boardData])

  const handleTaskStatusChange = async (taskId, newStatus) => {
    if (updatingTaskId) return
    try {
      setUpdatingTaskId(taskId)
      await tasksAPI.updateTaskStatus(taskId, newStatus)
      toast.success('Task updated')
      await loadBoardData()
    } catch (error) {
      toast.error('Failed to update task')
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const handleCreateTask = async (event) => {
    event.preventDefault()
    const formData = new FormData(event.target)
    try {
      setSubmitting(true)
      await tasksAPI.createTask({
        title: formData.get('title'),
        description: formData.get('description') || '',
        priority: formData.get('priority') || 'medium',
        assigned_to: formData.get('assigned_to') || null,
        due_date: formData.get('due_date') || null,
        project_id: projectId,
        status: selectedStatus,
      })
      toast.success('Task created successfully')
      setShowCreateModal(false)
      event.target.reset()
      await loadBoardData()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create task')
    } finally {
      setSubmitting(false)
    }
  }

  const currentTasks = Object.values(filteredBoard).flat()
  const activeProject = projectInfo?.name || boardData?.project?.name || 'Project'

  return (
    <div className="space-y-6">
      <PageHeader
        title={activeProject}
        description="Project board with filtered work streams and quick task edits."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate('/projects')}>
              <ArrowLeft className="h-4 w-4" />
              Projects
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowFilters((value) => !value)}>
              <Filter className="h-4 w-4" />
              Filters
            </Button>
            {canManageColumns ? (
              <Button size="sm" onClick={() => { setSelectedStatus('todo'); setShowCreateModal(true) }}>
                <Plus className="h-4 w-4" />
                Create task
              </Button>
            ) : null}
          </div>
        )}
      />

      <section className="grid gap-4 md:grid-cols-4">
        <BoardMetric title="Open tasks" value={currentTasks.length} />
        <BoardMetric title="Statuses" value={statuses.length} />
        <BoardMetric title="Labels" value={availableLabels.length} />
        <BoardMetric title="Team" value={assignableUsers.length} />
      </section>

      <section className="card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className={`${inputClassName} pl-10`} placeholder="Search by title, description, or ID" />
          </div>
          {showFilters ? (
            <div className="grid gap-3 md:grid-cols-3 lg:flex-1">
              <select className={inputClassName} value={filters.priority} onChange={(event) => setFilters((state) => ({ ...state, priority: event.target.value }))}>
                <option value="">All priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select className={inputClassName} value={filters.assignee} onChange={(event) => setFilters((state) => ({ ...state, assignee: event.target.value }))}>
                <option value="">All assignees</option>
                {assignableUsers.map((userItem) => <option key={userItem.id} value={userItem.id}>{userItem.first_name} {userItem.last_name}</option>)}
              </select>
              <select className={inputClassName} value={filters.label} onChange={(event) => setFilters((state) => ({ ...state, label: event.target.value }))}>
                <option value="">All labels</option>
                {availableLabels.map((label) => <option key={label} value={label}>{label}</option>)}
              </select>
            </div>
          ) : null}
        </div>
      </section>

      <section className="border-b border-gray-200 dark:border-gray-800">
        <nav className="flex gap-2 overflow-x-auto pb-2">
          {['summary', 'board', 'pages'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}
            >
              {tab === 'summary' ? 'Summary' : tab === 'board' ? 'Board' : 'Files & Pages'}
            </button>
          ))}
        </nav>
      </section>

      {activeTab === 'summary' ? (
        loadingSummary ? <SkeletonCard lines={8} /> : summaryData ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="space-y-6">
              <section className="card p-5">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Overview</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{summaryData.project?.description || projectInfo?.description || 'No project overview available.'}</p>
              </section>
              <section className="card p-5">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Tasks</h2>
                <div className="mt-4 grid gap-3">
                  {(summaryData.recent_activity || []).slice(0, 8).map((item, index) => (
                    <div key={index} className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.title || item.name || 'Task'}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.status || 'unknown'}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <aside className="space-y-4">
              <section className="card p-5">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">AI Briefing</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">Use live project health and board signals to brief the team without leaving the workspace.</p>
              </section>
              <section className="card p-5">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Analytics</h3>
                <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <p>Completion: {summaryData.statistics?.completion_percentage || 0}%</p>
                  <p>In progress: {summaryData.statistics?.in_progress_count || 0}</p>
                  <p>Completed: {summaryData.statistics?.completed_count || 0}</p>
                </div>
              </section>
            </aside>
          </div>
        ) : <EmptyState title="No summary data" description="Summary data will appear once project activity is available." />
      ) : activeTab === 'board' ? (
        loading ? <SkeletonKanban cols={Math.max(3, statuses.length)} /> : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(statuses.length, 4)}, minmax(0, 1fr))` }}
          >
            {statuses.map((status) => {
              const tasks = filteredBoard[status.id] || []
              return (
                <section key={status.id} className="card flex min-h-0 flex-col p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{status.label || status.id}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{tasks.length} tasks</p>
                    </div>
                    <Badge label={status.label || status.id} colorKey={status.id} />
                  </div>
                  <div className="space-y-3 overflow-y-auto">
                    {tasks.length ? tasks.map((task) => (
                      <article key={task.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
                        <button type="button" onClick={() => navigate(`/tasks/${task.id}`)} className="w-full text-left">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{task.title}</p>
                              <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{task.description || 'No description.'}</p>
                            </div>
                            <Badge label={task.priority || 'medium'} colorKey={task.priority || 'medium'} />
                          </div>
                        </button>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {task.due_date ? <Badge label={format(new Date(task.due_date), 'MMM d')} colorKey="scheduled" /> : null}
                          {task.assigned_to_name ? <Badge label={task.assigned_to_name} colorKey="scheduled" /> : <Badge label="Unassigned" colorKey="scheduled" />}
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-2">
                          <select className={`${inputClassName} text-xs`} value={task.status} disabled={Boolean(updatingTaskId)} onChange={(event) => handleTaskStatusChange(task.id, event.target.value)} aria-label={updatingTaskId === task.id ? `Moving ${task.title}` : `Move ${task.title}`} aria-busy={updatingTaskId === task.id || undefined}>
                            {statuses.map((option) => <option key={option.id} value={option.id}>{option.label || option.id}</option>)}
                          </select>
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/tasks/${task.id}`)}>
                            Open
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </article>
                    )) : (
                      <EmptyState title="No tasks in this column" description="Move work here or create a new task." action={canManageColumns ? <Button size="sm" onClick={() => { setSelectedStatus(status.id); setShowCreateModal(true) }}><Plus className="h-4 w-4" /> Add task</Button> : null} />
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        )
      ) : (
        loadingPages ? <SkeletonTable rows={4} cols={3} /> : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <section className="card p-5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Files</h2>
              <div className="mt-4 space-y-3">
                {projectFiles.length ? projectFiles.map((file) => (
                  <div key={file.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{file.name || file.original_name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{file.type?.toUpperCase() || 'FILE'}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => window.open(file.url, '_blank', 'noreferrer')}>
                      Open
                    </Button>
                  </div>
                )) : <EmptyState title="No files" description="Upload files from the project details view." />}
              </div>
            </section>
            <section className="card p-5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Pages</h2>
              <div className="mt-4 space-y-3">
                {pages.length ? pages.map((page) => (
                  <div key={page.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{page.title}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{page.status}</p>
                  </div>
                )) : <EmptyState title="No pages" description="Pages are managed from the project details workspace." />}
              </div>
            </section>
          </div>
        )
      )}

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create task">
        <form onSubmit={handleCreateTask} className="space-y-4">
          <FormField label="Title" required>
            <input name="title" required className={inputClassName} />
          </FormField>
          <FormField label="Description">
            <textarea name="description" rows={3} className={inputClassName} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Priority">
              <select name="priority" defaultValue="medium" className={inputClassName}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </FormField>
            <FormField label="Due date">
              <input type="datetime-local" name="due_date" className={inputClassName} />
            </FormField>
          </div>
          <FormField label="Assign to">
            <select name="assigned_to" className={inputClassName}>
              <option value="">Unassigned</option>
              {assignableUsers.map((item) => <option key={item.id} value={item.id}>{item.first_name} {item.last_name}</option>)}
            </select>
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button type="submit" loading={submitting}>Create task</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function BoardMetric({ title, value }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  )
}
