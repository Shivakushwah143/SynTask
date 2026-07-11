import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock3, Plus, Receipt, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import { projectsApi } from '../api/projects'
import { usersAPI } from '../api/users'
import { componentsApi } from '../api/components'
import { versionsApi } from '../api/versions'
import { hasCompanyAdminAccess } from '../utils/roles'
import { Badge, Button, EmptyState, FormField, Modal, PageHeader, SkeletonCard, SkeletonTable, inputClassName } from '../components/ui'
import {
  buildProjectGraphRows,
  buildProjectGraphSummary,
  filterProjects,
  getProjectGridPageSize,
  getVisibleProjectCountForGrid,
} from './projectsData'

const PROJECT_WORKFLOW = {
  active: ['created', 'kickoff', 'execution', 'review', 'on_hold'],
  created: ['kickoff', 'on_hold'],
  kickoff: ['execution', 'on_hold'],
  execution: ['review', 'on_hold'],
  review: ['completed', 'on_hold'],
  completed: ['reporting'],
  reporting: ['archived'],
  on_hold: ['created', 'kickoff', 'execution', 'review'],
  archived: [],
}

export default function Projects() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canCreateProjects = hasCompanyAdminAccess(user?.role)
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState([])
  const [projectPage, setProjectPage] = useState(1)
  const projectGridColumns = useProjectGridColumns()
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState({ status: '', type: '', owner: '' })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [assignableUsers, setAssignableUsers] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [projectDetails, setProjectDetails] = useState(null)
  const [projectTasks, setProjectTasks] = useState([])
  const [components, setComponents] = useState([])
  const [versions, setVersions] = useState([])
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({ name: '', key: '', project_id: '', description: '', type: 'software', lead_id: '', assigned_to: '', start_date: '', delivery_date: '' })
  const [formErrors, setFormErrors] = useState({})

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true)
      const response = await projectsApi.getProjects()
      const projectsData = response.data.projects || []
      setProjects(projectsData)
      return projectsData
    } catch (error) {
      toast.error('Failed to load projects')
      setProjects([])
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const loadAssignableUsers = useCallback(async () => {
    try {
      const response = await usersAPI.getAssignableUsers()
      setAssignableUsers(response.users || [])
    } catch (error) {
      setAssignableUsers([])
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    loadAssignableUsers()
  }, [loadAssignableUsers])

  useEffect(() => {
    const projectId = sessionStorage.getItem('open_project_id')
    if (projectId && projects.length) {
      sessionStorage.removeItem('open_project_id')
      const project = projects.find((item) => item.id === projectId)
      if (project) openProject(project)
    }
  }, [projects])

  const filteredProjects = useMemo(
    () => filterProjects(projects, { searchQuery, filters }),
    [filters, projects, searchQuery],
  )

  const summary = useMemo(() => ({
    total: projects.length,
    active: projects.filter((project) => ['active', 'in_progress'].includes((project.status || '').toLowerCase())).length,
    overdue: projects.filter((project) => (project.days_until_delivery ?? 999) < 0).length,
  }), [projects])

  const projectCards = useMemo(() => filteredProjects.map((project) => ({
    ...project,
    statusLabel: (project.status || 'active').replace(/_/g, ' '),
    progress: typeof project.progress_percentage === 'number'
      ? project.progress_percentage
      : project.task_count
        ? Math.min(100, Math.round(((project.completed_task_count || 0) / project.task_count) * 100))
        : 0,
  })), [filteredProjects])

  const visibleProjectCount = useMemo(
    () => getVisibleProjectCountForGrid({ columns: projectGridColumns, page: projectPage, total: projectCards.length }),
    [projectCards.length, projectGridColumns, projectPage],
  )
  const projectPageSize = useMemo(() => getProjectGridPageSize(projectGridColumns), [projectGridColumns])
  const projectGraphRows = useMemo(() => buildProjectGraphRows(projectCards, visibleProjectCount), [projectCards, visibleProjectCount])
  const projectGraphSummary = useMemo(() => buildProjectGraphSummary(projectCards), [projectCards])

  useEffect(() => {
    setProjectPage(1)
  }, [filters.owner, filters.status, filters.type, searchQuery])

  const openProject = async (project) => {
    setSelectedProject(project)
    setShowDetails(true)
    setLoadingDetails(true)
    try {
      const [detailsResponse, componentsResponse, versionsResponse] = await Promise.all([
        projectsApi.getProject(project.id, { include_tasks: true }),
        componentsApi.getComponents(project.id),
        versionsApi.getVersions(project.id),
      ])
      const details = detailsResponse.data
      setProjectDetails(details)
      setProjectTasks(details.tasks || [])
      setComponents(componentsResponse.data.components || [])
      setVersions(versionsResponse.data.versions || [])
    } catch (error) {
      toast.error('Failed to load project details')
    } finally {
      setLoadingDetails(false)
    }
  }

  const handleProjectStatusChange = async (project, nextStatus) => {
    try {
      await projectsApi.updateProject(project.id, { status: nextStatus })
      toast.success(`Project moved to ${nextStatus.replace(/_/g, ' ')}`)
      await loadProjects()
      await openProject(project)
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update project status')
    }
  }

  const validateCreateForm = () => {
    const nextErrors = {}
    if (!formData.name.trim()) nextErrors.name = 'Project name is required.'
    if (!formData.key.trim()) nextErrors.key = 'Project key is required.'
    if (formData.start_date && formData.delivery_date && new Date(formData.delivery_date) < new Date(formData.start_date)) {
      nextErrors.delivery_date = 'Delivery date must be after the start date.'
    }
    setFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    if (submitting || !validateCreateForm()) return
    try {
      setSubmitting(true)
      const payload = { ...formData }
      payload.project_id = payload.project_id.trim() || payload.key.trim()
      if (payload.start_date) payload.start_date = new Date(payload.start_date).toISOString()
      if (payload.delivery_date) payload.delivery_date = new Date(payload.delivery_date).toISOString()
      
      const response = await projectsApi.createProject(payload)
      toast.success('Project created successfully')
      
      // Reset form
      setFormData({ name: '', key: '', project_id: '', description: '', type: 'software', lead_id: '', assigned_to: '', start_date: '', delivery_date: '' })
      
      // Close modal first
      setShowCreateModal(false)
      
      // Immediately add the new project to the list if we have the data
      if (response.data && response.data.project) {
        setProjects(prevProjects => [response.data.project, ...prevProjects])
      } else {
        // If we don't have the project data in the response, refresh the list
        await loadProjects()
      }
      
      // Reset visible page to show new project in the first complete grid.
      setProjectPage(1)
      
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create project')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
      title="Projects"
      description="Project health, ownership, and progress."
        actions={(
      <div className="flex flex-wrap items-center gap-2 pr-3 sm:pr-4 lg:pr-6">
            {canCreateProjects ? (
              <Button size="sm" onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4" />
                New project
              </Button>
            ) : null}
          </div>
        )}
      />

      <section className="card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input className={`${inputClassName} pl-10`} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search projects by name, key, status, or description" />
          </div>
          <div id="project-filters" className="grid gap-3 md:grid-cols-3 lg:flex-1">
            <select className={inputClassName} value={filters.status} onChange={(event) => setFilters((state) => ({ ...state, status: event.target.value }))}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="in_progress">In progress</option>
              <option value="on_hold">On hold</option>
              <option value="completed">Completed</option>
            </select>
            <select className={inputClassName} value={filters.type} onChange={(event) => setFilters((state) => ({ ...state, type: event.target.value }))}>
              <option value="">All types</option>
              <option value="software">Software</option>
              <option value="marketing">Marketing</option>
              <option value="business">Business</option>
              <option value="operations">Operations</option>
            </select>
            <select className={inputClassName} value={filters.owner} onChange={(event) => setFilters((state) => ({ ...state, owner: event.target.value }))}>
              <option value="">All owners</option>
              {assignableUsers.map((item) => <option key={item.id} value={item.id}>{item.first_name} {item.last_name}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Total projects" value={summary.total} />
        <MetricCard title="Active projects" value={summary.active} />
        <MetricCard title="At risk" value={summary.overdue} />
      </section>

      <ProjectGraphPanel
        rows={projectGraphRows}
        summary={projectGraphSummary}
        loading={loading}
        totalCount={projectCards.length}
        visibleCount={visibleProjectCount}
        pageSize={projectPageSize}
        onViewMore={() => setProjectPage((page) => page + 1)}
        onOpenProject={(project) => {
          const match = projectCards.find((item) => item.id === project.id)
          if (match) openProject(match)
        }}
      />

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="New project" size="xl">
        <form onSubmit={handleCreate} className="space-y-5">
          <FormField label="Project name" error={formErrors.name} required>
            <input
              name="name"
              autoComplete="off"
              className={inputClassName}
              value={formData.name}
              onChange={(event) => setFormData((state) => ({ ...state, name: event.target.value }))}
              placeholder="Enter project name"
            />
          </FormField>
          <FormField label="Project key" error={formErrors.key} required>
            <input
              name="key"
              autoComplete="off"
              className={`${inputClassName} font-mono`}
              value={formData.key}
              onChange={(event) => setFormData((state) => ({ ...state, key: event.target.value.toUpperCase() }))}
              placeholder="PROJ-001"
            />
          </FormField>
          <FormField label="Project ID" error={formErrors.project_id} required>
            <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
              Optional. If empty, the project key is used.
            </span>
            <input
              name="project_id"
              autoComplete="off"
              className={`${inputClassName} font-mono`}
              value={formData.project_id}
              onChange={(event) => setFormData((state) => ({ ...state, project_id: event.target.value }))}
              placeholder="AK-001"
            />
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
              Leaves the key as the ID.
            </span>
          </FormField>
          <FormField label="Details">
            <textarea className={inputClassName} rows={4} value={formData.description} onChange={(event) => setFormData((state) => ({ ...state, description: event.target.value }))} />
          </FormField>
          <div className="grid gap-4 lg:grid-cols-2">
            <FormField label="Type">
              <select className={inputClassName} value={formData.type} onChange={(event) => setFormData((state) => ({ ...state, type: event.target.value }))}>
                <option value="software">Software</option>
                <option value="business">Business</option>
                <option value="marketing">Marketing</option>
                <option value="operations">Operations</option>
              </select>
            </FormField>
            <FormField label="Lead">
              <select className={inputClassName} value={formData.lead_id} onChange={(event) => setFormData((state) => ({ ...state, lead_id: event.target.value }))}>
                <option value="">Select lead</option>
                {assignableUsers.map((item) => <option key={item.id} value={item.id}>{item.first_name} {item.last_name}</option>)}
              </select>
            </FormField>
            <FormField label="Start date">
              <input type="datetime-local" className={inputClassName} value={formData.start_date} onChange={(event) => setFormData((state) => ({ ...state, start_date: event.target.value }))} />
            </FormField>
            <FormField label="Delivery date" error={formErrors.delivery_date}>
              <input type="datetime-local" className={inputClassName} value={formData.delivery_date} onChange={(event) => setFormData((state) => ({ ...state, delivery_date: event.target.value }))} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button type="submit" loading={submitting} loadingText="Creating">Create</Button>
          </div>
        </form>
      </Modal>

      <ProjectDetailsPanel
        isOpen={showDetails}
        project={selectedProject}
      loading={loadingDetails}
      details={projectDetails}
      tasks={projectTasks}
      components={components}
      versions={versions}
      onClose={() => setShowDetails(false)}
      onOpenBoard={(project) => navigate(`/projects/${project.id}/board`)}
      onChangeStatus={handleProjectStatusChange}
    />
    </div>
  )
}

function ProjectGraphPanel({ rows, summary, loading, totalCount, visibleCount, pageSize, onViewMore, onOpenProject }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="flex items-center gap-1.5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Projects</h2>
        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] text-gray-500 dark:border-gray-700 dark:text-gray-400">?</span>
        </div>
        <div className="hidden items-center gap-4 text-xs text-gray-500 dark:text-gray-400 sm:flex">
          <span>{summary.remainingTasks} remaining</span>
          <span>{summary.totalTasks} total tasks</span>
        </div>
      </div>

      <div className="grid border-b border-gray-200 dark:border-gray-800 sm:grid-cols-2">
        <div className="flex items-center gap-2 px-4 py-3">
          <Clock3 className="h-5 w-5 text-gray-900 dark:text-gray-100" />
          <div>
            <p className="text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{summary.remainingTasks}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Remaining tasks</p>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-950/50 sm:border-l sm:border-t-0">
          <Receipt className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <div>
            <p className="text-lg font-semibold tabular-nums text-gray-600 dark:text-gray-300">{summary.totalTasks}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Total project tasks</p>
          </div>
        </div>
      </div>

      <div className="p-3">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
          </div>
        ) : rows.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => onOpenProject(project)}
            title={`${project.name}: ${project.progress}% complete, ${project.remainingTasks} tasks remaining`}
            className="rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:border-primary-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950/40 dark:hover:border-primary-700 dark:hover:bg-gray-950"
          >
            <div className="flex items-start gap-3">
              <ProgressRing value={project.progress} />
              <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-5 text-primary-600 dark:text-primary-400">{project.name}</p>
              <p className="truncate text-sm text-gray-500 dark:text-gray-400">{project.owner}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {project.key ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">{project.key}</span> : null}
                <Badge label={project.status.replace(/_/g, ' ')} colorKey={project.status} />
              </div>
              </div>
            </div>
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Task Budget</span>
                <span>{project.completedTasks}/{project.totalTasks}</span>
              </div>
              <StackedBudgetBar completed={project.completedTasks} remaining={project.remainingTasks} total={project.totalTasks} />
            </div>
          </button>
          ))}
          </div>
        ) : (
          <div className="py-6">
            <EmptyState title="No project graph data" description="Projects will appear here when they match your filters." />
          </div>
        )}
        {!loading && rows.length > 0 && visibleCount < totalCount ? (
          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <span>Showing {rows.length} of {totalCount} projects</span>
            <Button variant="secondary" size="sm" onClick={onViewMore}>
              View {Math.min(pageSize, totalCount - visibleCount)} more
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function useProjectGridColumns() {
  const getColumns = useCallback(() => {
    if (typeof window === 'undefined') return 3
    if (window.matchMedia('(min-width: 1280px)').matches) return 3
    if (window.matchMedia('(min-width: 640px)').matches) return 2
    return 1
  }, [])
  const [columns, setColumns] = useState(getColumns)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const updateColumns = () => setColumns(getColumns())
    updateColumns()
    window.addEventListener('resize', updateColumns)
    return () => window.removeEventListener('resize', updateColumns)
  }, [getColumns])

  return columns
}

function ProgressRing({ value }) {
  const bounded = Math.max(0, Math.min(100, value || 0))
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#3B82F6 ${bounded * 3.6}deg, #eeeeee 0deg)` }}>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xs font-semibold text-gray-900 dark:bg-gray-900 dark:text-gray-100">
        {bounded}%
      </div>
    </div>
  )
}

function StackedBudgetBar({ completed, remaining, total }) {
  const safeTotal = Math.max(total || 0, 1)
  const completedWidth = Math.min(100, Math.round((completed / safeTotal) * 100))
  const remainingWidth = Math.max(0, 100 - completedWidth)
  return (
    <div className="flex h-2.5 overflow-hidden rounded-sm bg-gray-100 dark:bg-gray-800">
      <div className="bg-emerald-400" style={{ width: `${completedWidth}%` }} />
      <div className="bg-orange-400" style={{ width: `${remainingWidth}%`, opacity: remaining ? 1 : 0 }} />
    </div>
  )
}

function MetricCard({ title, value }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  )
}

function ProjectDetailsPanel({ isOpen, project, loading, details, tasks, components, versions, onClose, onOpenBoard, onChangeStatus }) {
  if (!isOpen || !project) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/50">
      <div className="ml-auto flex h-full w-full flex-col bg-white shadow-2xl dark:bg-gray-950 ">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Project details</p>
            <h2 className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">{project.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => onOpenBoard(project)}>Open board</Button>
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800">x</button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 gap-6 overflow-hidden lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <div className="min-h-0 overflow-y-auto px-5 py-5">
            {loading ? <SkeletonDetails /> : (
              <div className="space-y-6">
                <section className="grid gap-4 md:grid-cols-4">
                  <MetricCard title="Tasks" value={details?.task_count || tasks.length || 0} />
                  <MetricCard title="Complete" value={details?.statistics?.completed_count || 0} />
                  <MetricCard title="In progress" value={details?.statistics?.in_progress_count || 0} />
                  <MetricCard title="Completion" value={`${details?.statistics?.completion_percentage || 0}%`} />
                </section>
                <section className="card p-4">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Overview</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{details?.description || project.description || 'No project description available.'}</p>
                </section>
                <section className="card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Workflow</h3>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Advance the project through the locked delivery stages.</p>
                    </div>
                    <Badge label={(details?.status || project.status || 'active').replace(/_/g, ' ')} colorKey={details?.status || project.status || 'active'} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(PROJECT_WORKFLOW[(details?.status || project.status || 'active').toLowerCase()] || []).map((nextStatus) => (
                      <Button
                        key={nextStatus}
                        size="sm"
                        variant={nextStatus === 'completed' ? 'primary' : 'secondary'}
                        onClick={() => onChangeStatus?.(project, nextStatus)}
                      >
                        {nextStatus.replace(/_/g, ' ')}
                      </Button>
                    ))}
                  </div>
                </section>
                <section className="card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Tasks</h3>
                    <Badge label={`${tasks.length} tasks`} colorKey="scheduled" />
                  </div>
                  <div className="space-y-2">
                    {tasks.slice(0, 8).map((task) => (
                      <div key={task.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{task.title}</p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{task.description || 'No description.'}</p>
                          </div>
                          <Badge label={task.status?.replace(/_/g, ' ') || 'todo'} colorKey={task.status || 'todo'} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="grid gap-6 xl:grid-cols-2">
                  <section className="card p-4">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Files</h3>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Project files remain accessible from the project header.</p>
                  </section>
                  <section className="card p-4">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Meetings</h3>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Meeting context is managed from the meetings workspace.</p>
                  </section>
                </section>
              </div>
            )}
          </div>
          <aside className="min-h-0 overflow-y-auto border-l border-gray-200 px-5 py-5 dark:border-gray-800">
            <div className="space-y-4">
              <section className="card p-4">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">AI briefing</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">Project context, health, and next actions should be derived from live project signals only.</p>
              </section>
              <section className="card p-4">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Team</h3>
                <div className="mt-3 flex -space-x-2">
                  {(details?.assigned_tasks_by_user || []).slice(0, 5).map((item, index) => (
                    <div key={`${item.user_id || index}`} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-xs font-semibold text-gray-700 dark:border-gray-950 dark:bg-gray-800 dark:text-gray-200">
                      {(item.user_name || '?').slice(0, 1)}
                    </div>
                  ))}
                </div>
              </section>
              <section className="card p-4">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Analytics</h3>
                <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <p>Completion: {details?.statistics?.completion_percentage || 0}%</p>
                  <p>Tasks: {details?.task_count || 0}</p>
                  <p>Files: {details?.files?.length || 0}</p>
                  <p>Pages: {details?.pages?.length || 0}</p>
                  <p>Components: {components.length}</p>
                  <p>Versions: {versions.length}</p>
                </div>
              </section>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function SkeletonDetails() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((item) => <SkeletonCard key={item} lines={3} />)}
      </div>
      <SkeletonCard lines={4} />
      <SkeletonTable rows={6} cols={3} />
    </div>
  )
}
