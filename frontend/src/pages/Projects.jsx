import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowRight, FolderKanban, Grid2x2, List, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import { useConfirmation } from '../hooks/useConfirmation'
import { projectsApi } from '../api/projects'
import { usersAPI } from '../api/users'
import { componentsApi } from '../api/components'
import { versionsApi } from '../api/versions'
import { hasCompanyAdminAccess } from '../utils/roles'
import { Badge, Button, EmptyState, FormField, Modal, PageHeader, SkeletonCard, SkeletonTable, Table, inputClassName } from '../components/ui'

export default function Projects() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { confirm } = useConfirmation()
  const canCreateProjects = hasCompanyAdminAccess(user?.role)
  const [view, setView] = useState('grid')
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState({ status: '', type: '', owner: '' })
  const [showFilters, setShowFilters] = useState(false)
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
  const [deletingId, setDeletingId] = useState(null)
  const [formData, setFormData] = useState({ name: '', key: '', project_id: '', description: '', type: 'software', lead_id: '', assigned_to: '', start_date: '', delivery_date: '' })
  const [formErrors, setFormErrors] = useState({})

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true)
      const response = await projectsApi.getProjects()
      setProjects(response.data.projects || [])
    } catch (error) {
      toast.error('Failed to load projects')
      setProjects([])
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
    if (showCreateModal) loadAssignableUsers()
  }, [showCreateModal, loadAssignableUsers])

  useEffect(() => {
    const projectId = sessionStorage.getItem('open_project_id')
    if (projectId && projects.length) {
      sessionStorage.removeItem('open_project_id')
      const project = projects.find((item) => item.id === projectId)
      if (project) openProject(project)
    }
  }, [projects])

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return projects.filter((project) => {
      const matchesQuery = !query || [project.name, project.key, project.description, project.status, project.type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
      const matchesStatus = !filters.status || (project.status || '').toLowerCase() === filters.status
      const matchesType = !filters.type || (project.type || '').toLowerCase() === filters.type
      const matchesOwner = !filters.owner || project.assigned_to === filters.owner || project.lead_id === filters.owner
      return matchesQuery && matchesStatus && matchesType && matchesOwner
    })
  }, [filters.owner, filters.status, filters.type, projects, searchQuery])

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
      await projectsApi.createProject(payload)
      toast.success('Project created successfully')
      setShowCreateModal(false)
      setFormData({ name: '', key: '', project_id: '', description: '', type: 'software', lead_id: '', assigned_to: '', start_date: '', delivery_date: '' })
      await loadProjects()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create project')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    if (deletingId) return
    const confirmed = await confirm({
      title: 'Delete Project',
      message: 'Are you sure you want to delete this project?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDangerous: true,
    })
    if (!confirmed) return
    try {
      setDeletingId(id)
      await projectsApi.deleteProject(id)
      toast.success('Project deleted successfully')
      await loadProjects()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete project')
    } finally {
      setDeletingId(null)
    }
  }

  const projectTableColumns = [
    { key: 'name', header: 'Project' },
    { key: 'status', header: 'Status', render: (row) => <Badge label={row.statusLabel || 'active'} colorKey={row.status || 'active'} /> },
    { key: 'progress', header: 'Progress', render: (row) => <ProgressBar value={row.progress || 0} /> },
    { key: 'task_count', header: 'Tasks' },
    { key: 'delivery_date', header: 'Delivery', render: (row) => (row.delivery_date ? format(new Date(row.delivery_date), 'MMM d, yyyy') : '—') },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Premium workspace for project health, team ownership, and AI insights."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={view === 'grid' ? 'primary' : 'secondary'} size="sm" onClick={() => setView('grid')}>
              <Grid2x2 className="h-4 w-4" />
              Grid
            </Button>
            <Button variant={view === 'list' ? 'primary' : 'secondary'} size="sm" onClick={() => setView('list')}>
              <List className="h-4 w-4" />
              List
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowFilters((value) => !value)}>
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </Button>
            {canCreateProjects ? (
              <Button size="sm" onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4" />
                New Project
              </Button>
            ) : null}
          </div>
        )}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Total projects" value={summary.total} />
        <MetricCard title="Active projects" value={summary.active} />
        <MetricCard title="At risk" value={summary.overdue} />
      </section>

      <section className="card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input className={`${inputClassName} pl-10`} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search projects by name, key, status, or description" />
          </div>
          {showFilters ? (
            <div className="grid gap-3 md:grid-cols-3 lg:flex-1">
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
          ) : null}
        </div>
      </section>

      <section className="card p-0 overflow-hidden">
        {loading ? (
          <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => <SkeletonCard key={item} lines={4} />)}
          </div>
        ) : !projectCards.length ? (
          <div className="p-6">
            <EmptyState
              icon={FolderKanban}
              title="No projects found"
              description="Use search or filters to refine the workspace."
              action={canCreateProjects ? <Button onClick={() => setShowCreateModal(true)}><Plus className="h-4 w-4" /> Create Project</Button> : null}
            />
          </div>
        ) : view === 'list' ? (
          <Table columns={projectTableColumns} data={projectCards} />
        ) : (
          <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {projectCards.map((project) => (
              <button key={project.id} type="button" onClick={() => openProject(project)} className="group overflow-hidden rounded-2xl border border-surface-border bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{project.key}</p>
                    <h3 className="mt-2 truncate text-base font-semibold text-gray-900 dark:text-gray-100">{project.name}</h3>
                  </div>
                  <Badge label={project.statusLabel || 'active'} colorKey={project.status || 'active'} />
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">{project.description || 'No description available.'}</p>
                <div className="mt-4 space-y-3">
                  <ProgressBar value={project.progress || 0} />
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>{project.task_count || 0} tasks</span>
                    <span>{project.delivery_date ? format(new Date(project.delivery_date), 'MMM d') : 'No delivery date'}</span>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-3 dark:border-gray-800">
                  <div className="flex -space-x-2">
                    {(project.team_members || assignableUsers.slice(0, 3)).slice(0, 3).map((member, index) => (
                      <div key={`${project.id}-${index}`} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-xs font-semibold text-gray-700 dark:border-gray-900 dark:bg-gray-800 dark:text-gray-200">
                        {(member.first_name || member.name || '?').slice(0, 1)}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={(event) => { event.stopPropagation(); openProject(project) }} className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" aria-label={`Open ${project.name}`}>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    {canCreateProjects ? (
                      <button type="button" disabled={Boolean(deletingId)} onClick={(event) => { event.stopPropagation(); handleDelete(project.id) }} className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-300" aria-label={deletingId === project.id ? `Deleting ${project.name}` : `Delete ${project.name}`} aria-busy={deletingId === project.id || undefined}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create project" size="xl">
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
              Optional. If left empty, the project key will be used.
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
              If you leave this empty, it will use the project key.
            </span>
          </FormField>
          <FormField label="Description">
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
            <Button type="submit" loading={submitting} loadingText="Creating">Create project</Button>
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
      />
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

function ProgressBar({ value = 0 }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>Progress</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div className="h-full rounded-full bg-primary-600" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  )
}

function ProjectDetailsPanel({ isOpen, project, loading, details, tasks, components, versions, onClose, onOpenBoard }) {
  if (!isOpen || !project) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/50">
      <div className="ml-auto flex h-full w-full max-w-6xl flex-col bg-white shadow-2xl dark:bg-gray-950 lg:w-[88vw]">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Project details</p>
            <h2 className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">{project.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => onOpenBoard(project)}>Open board</Button>
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800">×</button>
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
