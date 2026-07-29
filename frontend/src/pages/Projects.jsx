import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clock3, Plus, Receipt, Search, UserPlus,
  FolderKanban, LayoutGrid, BarChart3,
  Calendar, Users, Target, Award, TrendingUp,
  CheckCircle2, AlertCircle, Clock, ChevronRight,
  Briefcase, Layers, GitBranch, Sparkles, Activity
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import { projectsApi } from '../api/projects'
import { scheduledJobsAPI } from '../api/scheduledJobs'
import { usersAPI } from '../api/users'
import { componentsApi } from '../api/components'
import { versionsApi } from '../api/versions'
import { canCreateProject, canManageProject, normalizeRole } from '../utils/roles'
import { Badge, Button, ConfirmDialog, CreatableSelectField, EmptyState, FormField, Modal, PageHeader, SkeletonCard, SkeletonTable, inputClassName } from '../components/ui'
import { excludeCurrentUser } from '../utils/userFilters'
import { QuickCreateEmployeeModal } from '../components/relatedRecords/QuickCreateModals'
import { timeService } from '@/services/timeService'
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

const DEFAULT_PROJECT_TYPES = [
  { value: 'software', label: 'Software' },
  { value: 'business', label: 'Business' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'operations', label: 'Operations' },
]

const PROJECT_TYPE_STORAGE_KEY = 'syntask_project_type_options'

const formatProjectTypeLabel = (value) => (value || '')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase())

const slugifyProjectType = (value) => (value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')

const loadStoredProjectTypes = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECT_TYPE_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((item) => item?.value && item?.label) : []
  } catch {
    return []
  }
}

// Stat Card Component
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle, trend }) => {
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
      {trend && (
        <div className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${trend > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </div>
      )}
    </div>
  )
}

export default function Projects() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canCreateProjects = canCreateProject(user?.role)
  const userRole = normalizeRole(user?.role)
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState([])
  const [projectPage, setProjectPage] = useState(1)
  const projectGridColumns = useProjectGridColumns()
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState({ status: '', type: '', owner: '' })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createMode, setCreateMode] = useState('now')
  const [scheduleRunAt, setScheduleRunAt] = useState('')
  const [assignableUsers, setAssignableUsers] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [projectDetails, setProjectDetails] = useState(null)
  const [projectTasks, setProjectTasks] = useState([])
  const [components, setComponents] = useState([])
  const [versions, setVersions] = useState([])
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [assignmentProject, setAssignmentProject] = useState(null)
  const [assignmentUserId, setAssignmentUserId] = useState('')
  const [assigningProject, setAssigningProject] = useState(false)
  const [showQuickEmployeeModal, setShowQuickEmployeeModal] = useState(false)
  const [showProjectTypeModal, setShowProjectTypeModal] = useState(false)
  const [projectTypeName, setProjectTypeName] = useState('')
  const [projectTypeError, setProjectTypeError] = useState('')
  const [projectTypeOptions, setProjectTypeOptions] = useState(() => {
    const merged = new Map(DEFAULT_PROJECT_TYPES.map((item) => [item.value, item]))
    loadStoredProjectTypes().forEach((item) => merged.set(item.value, item))
    return Array.from(merged.values())
  })
  const [formData, setFormData] = useState({ name: '', key: '', project_id: '', description: '', type: 'software', lead_id: '', start_date: '', delivery_date: '' })
  const [formErrors, setFormErrors] = useState({})

  const [showEditModal, setShowEditModal] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [editFormData, setEditFormData] = useState({ name: '', description: '', lead_id: '', start_date: '', delivery_date: '', status: 'active' })
  const [editFormErrors, setEditFormErrors] = useState({})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingProject, setDeletingProject] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const openEditModal = (project) => {
    setEditingProject(project)
    setEditFormData({
      name: project.name || '',
      description: project.description || '',
      lead_id: project.lead_id || '',
      start_date: project.start_date ? project.start_date.substring(0, 16) : '',
      delivery_date: project.delivery_date ? project.delivery_date.substring(0, 16) : '',
      status: project.status || 'active',
    })
    setEditFormErrors({})
    setShowEditModal(true)
  }

  const validateEditForm = () => {
    const nextErrors = {}
    if (!editFormData.name.trim()) nextErrors.name = 'Project name is required.'
    if (editFormData.start_date && editFormData.delivery_date && timeService.instant(editFormData.delivery_date) < timeService.instant(editFormData.start_date)) {
      nextErrors.delivery_date = 'Delivery date must be after the start date.'
    }
    setEditFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleEditSubmit = async (event) => {
    event.preventDefault()
    if (submitting || !validateEditForm()) return
    try {
      setSubmitting(true)
      const payload = { ...editFormData }
      if (payload.start_date) payload.start_date = timeService.toUtcISOString(payload.start_date)
      if (payload.delivery_date) payload.delivery_date = timeService.toUtcISOString(payload.delivery_date)
      // Only send status if it actually changed to avoid illegal transition errors (e.g. active -> active)
      if (payload.status === (editingProject?.status || 'active')) {
        delete payload.status
      }

      await projectsApi.updateProject(editingProject.id, payload)
      toast.success('Project updated successfully')
      setShowEditModal(false)
      setEditingProject(null)
      await loadProjects()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update project')
    } finally {
      setSubmitting(false)
    }
  }

  const openDeleteConfirm = (project) => {
    setDeletingProject(project)
    setShowDeleteConfirm(true)
  }

  const handleDeleteProject = async () => {
    if (!deletingProject || deleting) return
    try {
      setDeleting(true)
      await projectsApi.deleteProject(deletingProject.id)
      toast.success('Project deleted successfully')
      setShowDeleteConfirm(false)
      setDeletingProject(null)
      await loadProjects()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete project')
    } finally {
      setDeleting(false)
    }
  }

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
  }, [user])

  const loadAssignableUsers = useCallback(async () => {
    try {
      const response = await usersAPI.getAssignableUsers()
      setAssignableUsers(excludeCurrentUser(response.users || [], user))
    } catch (error) {
      setAssignableUsers([])
    }
  }, [])

  useEffect(() => {
    loadProjects()
    const interval = setInterval(() => {
      loadProjects()
    }, 10000)

    const handleProjectsUpdated = () => {
      loadProjects()
    }
    window.addEventListener('syntask:projects-updated', handleProjectsUpdated)
    window.addEventListener('syntask:data-updated', handleProjectsUpdated)

    return () => {
      clearInterval(interval)
      window.removeEventListener('syntask:projects-updated', handleProjectsUpdated)
      window.removeEventListener('syntask:data-updated', handleProjectsUpdated)
    }
  }, [loadProjects])

  useEffect(() => {
    loadAssignableUsers()
  }, [loadAssignableUsers])

  useEffect(() => {
    const merged = new Map(projectTypeOptions.map((item) => [item.value, item]))
    projects.forEach((project) => {
      const value = slugifyProjectType(project.type)
      if (value && !merged.has(value)) {
        merged.set(value, { value, label: formatProjectTypeLabel(project.type) })
      }
    })
    if (merged.size !== projectTypeOptions.length) {
      setProjectTypeOptions(Array.from(merged.values()))
    }
  }, [projectTypeOptions, projects])

  useEffect(() => {
    const customTypes = projectTypeOptions.filter((item) => !DEFAULT_PROJECT_TYPES.some((base) => base.value === item.value))
    localStorage.setItem(PROJECT_TYPE_STORAGE_KEY, JSON.stringify(customTypes))
  }, [projectTypeOptions])

  useEffect(() => {
    const projectId = sessionStorage.getItem('open_project_id')
    if (projectId && projects.length) {
      sessionStorage.removeItem('open_project_id')
      const project = projects.find((item) => item.id === projectId)
      if (project) navigate(`/projects/${project.id}/board`)
    }
  }, [navigate, projects])

  const filteredProjects = useMemo(
    () => filterProjects(projects, { searchQuery, filters }),
    [filters, projects, searchQuery],
  )
  const uniqueAssignableUsers = useMemo(
    () => Array.from(new Map(assignableUsers.map((item) => [item.id, item])).values()),
    [assignableUsers],
  )
  const projectAssigneeOptions = useMemo(
    () => uniqueAssignableUsers.filter((item) => item.status === 'active'),
    [uniqueAssignableUsers, userRole],
  )

  const summary = useMemo(() => ({
    total: projects.length,
    active: projects.filter((project) => ['active', 'in_progress'].includes((project.status || '').toLowerCase())).length,
    completed: projects.filter((project) => ['completed', 'archived'].includes((project.status || '').toLowerCase())).length,
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

  const openAssignmentModal = (project) => {
    setAssignmentProject(project)
    setAssignmentUserId(project.lead_id || '')
  }

  const handleProjectAssignment = async (event) => {
    event.preventDefault()
    if (!assignmentProject || assigningProject) return
    try {
      setAssigningProject(true)
      await projectsApi.updateProject(assignmentProject.id, { lead_id: assignmentUserId })
      toast.success(assignmentUserId ? 'Project lead assigned' : 'Project lead cleared')
      setAssignmentProject(null)
      setAssignmentUserId('')
      await loadProjects()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update project assignment')
    } finally {
      setAssigningProject(false)
    }
  }

  const validateCreateForm = () => {
    const nextErrors = {}
    if (!formData.name.trim()) nextErrors.name = 'Project name is required.'
    if (formData.start_date && formData.delivery_date && timeService.instant(formData.delivery_date) < timeService.instant(formData.start_date)) {
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
      const autoKey = (formData.key || (formData.name || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 16)).trim()
      const payload = { ...formData, key: autoKey, project_id: autoKey }
      if (payload.start_date) payload.start_date = timeService.toUtcISOString(payload.start_date)
      if (payload.delivery_date) payload.delivery_date = timeService.toUtcISOString(payload.delivery_date)

      if (createMode === 'schedule') {
        if (!scheduleRunAt) {
          toast.error('Schedule time is required')
          return
        }
        const runAt = timeService.instant(scheduleRunAt)
        if (Number.isNaN(runAt.getTime()) || runAt <= timeService.now()) {
          toast.error('Schedule time must be in the future')
          return
        }
        await scheduledJobsAPI.scheduleJob({
          action_type: 'CREATE_PROJECT',
          payload,
          run_at: timeService.toUtcISOString(runAt),
        })
        toast.success('Project scheduled successfully')
        setFormData({ name: '', key: '', project_id: '', description: '', type: 'software', lead_id: '', start_date: '', delivery_date: '' })
        setCreateMode('now')
        setScheduleRunAt('')
        setShowCreateModal(false)
        return
      }

      const response = await projectsApi.createProject(payload)
      toast.success('Project created successfully')

      setFormData({ name: '', key: '', project_id: '', description: '', type: 'software', lead_id: '', start_date: '', delivery_date: '' })
      setCreateMode('now')
      setScheduleRunAt('')
      setShowCreateModal(false)

      if (response.data && response.data.project) {
        setProjects(prevProjects => [response.data.project, ...prevProjects])
      } else {
        await loadProjects()
      }

      setProjectPage(1)

    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create project')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateProjectType = (event) => {
    event.preventDefault()
    const label = projectTypeName.trim()
    const value = slugifyProjectType(label)
    if (!label || !value) {
      setProjectTypeError('Enter a valid project type.')
      return
    }
    const duplicate = projectTypeOptions.find((item) => item.value === value || item.label.toLowerCase() === label.toLowerCase())
    if (duplicate) {
      setFormData((state) => ({ ...state, type: duplicate.value }))
      setProjectTypeName('')
      setProjectTypeError('')
      setShowProjectTypeModal(false)
      return
    }
    const nextOption = { value, label: formatProjectTypeLabel(label) }
    setProjectTypeOptions((state) => [...state, nextOption])
    setFormData((state) => ({ ...state, type: nextOption.value }))
    setProjectTypeName('')
    setProjectTypeError('')
    setShowProjectTypeModal(false)
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
              <FolderKanban className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">Projects</h1>
              <p className="mt-1 text-indigo-100">Project health, ownership, and progress tracking</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {canCreateProjects && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <Plus className="h-4 w-4" />
                New Project
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Projects"
          value={summary.total}
          icon={FolderKanban}
          color="indigo"
          subtitle="All projects"
        />
        <StatCard
          label="Active"
          value={summary.active}
          icon={Activity}
          color="emerald"
          subtitle="In progress"
        />
        <StatCard
          label="Completed"
          value={summary.completed}
          icon={CheckCircle2}
          color="blue"
          subtitle="Done/Archived"
        />
        <StatCard
          label="At Risk"
          value={summary.overdue}
          icon={AlertCircle}
          color="rose"
          subtitle="Overdue"
        />
      </div>

      {/* Search & Filters */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className={`${inputClassName} pl-10`}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search projects by name, key, status, or description"
            />
          </div>
          <div id="project-filters" className="grid gap-3 md:grid-cols-3 lg:flex-1">
            <select
              className={`${inputClassName} bg-gray-50 dark:bg-gray-900/50`}
              value={filters.status}
              onChange={(event) => setFilters((state) => ({ ...state, status: event.target.value }))}
            >
              <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All statuses</option>
              <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="active">Active</option>
              <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="in_progress">In progress</option>
              <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="on_hold">On hold</option>
              <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="completed">Completed</option>
            </select>
            <select
              className={`${inputClassName} bg-gray-50 dark:bg-gray-900/50`}
              value={filters.type}
              onChange={(event) => setFilters((state) => ({ ...state, type: event.target.value }))}
            >
              <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All types</option>
              {projectTypeOptions.map((item) => <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select
              className={`${inputClassName} bg-gray-50 dark:bg-gray-900/50`}
              value={filters.owner}
              onChange={(event) => setFilters((state) => ({ ...state, owner: event.target.value }))}
            >
              <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All assigned</option>
              {uniqueAssignableUsers.map((item) => <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={item.id} value={item.id}>{item.first_name} {item.last_name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Project Graph Panel */}
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
          if (match) navigate(`/projects/${match.id}/board`)
        }}
        canAssignProject={(project) => {
          const match = projectCards.find((item) => item.id === project.id)
          return Boolean(match && canManageProject(user?.role, match, user?.id))
        }}
        onAssignProject={(project) => {
          const match = projectCards.find((item) => item.id === project.id)
          if (match && canManageProject(user?.role, match, user?.id)) openAssignmentModal(match)
        }}
        onEditProject={(project) => {
          const match = projectCards.find((item) => item.id === project.id)
          if (match) openEditModal(match)
        }}
        onDeleteProject={(project) => {
          const match = projectCards.find((item) => item.id === project.id)
          if (match) openDeleteConfirm(match)
        }}
      />

      {/* Create Project Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="New project" size="xl">
        <form onSubmit={handleCreate} className="space-y-5">
          <FormField label="Project name" error={formErrors.name} required>
            <input
              name="name"
              autoComplete="off"
              className={inputClassName}
              value={formData.name}
              onChange={(event) => {
                const nameVal = event.target.value
                const autoKey = (nameVal || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 16)
                setFormData((state) => ({ ...state, name: nameVal, key: autoKey, project_id: autoKey }))
              }}
              placeholder="Enter project name"
            />
          </FormField>
          <FormField label="Project key" error={formErrors.key} required>
            <input
              name="key"
              readOnly
              tabIndex={-1}
              autoComplete="off"
              className={`${inputClassName} font-mono bg-gray-100 dark:bg-gray-800 cursor-not-allowed`}
              value={formData.key}
              placeholder="Auto-generated from name"
            />
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
              Automatically generated from project name
            </span>
          </FormField>
          <FormField label="Details">
            <textarea className={inputClassName} rows={4} value={formData.description} onChange={(event) => setFormData((state) => ({ ...state, description: event.target.value }))} />
          </FormField>
          <div className="grid gap-4 lg:grid-cols-2">
            <FormField label="Type">
              <CreatableSelectField
                value={formData.type}
                onChange={(value) => setFormData((state) => ({ ...state, type: value }))}
                className={inputClassName}
                createLabel="Add project type"
                onCreate={() => setShowProjectTypeModal(true)}
                canCreate={canCreateProjects}
              >
                {projectTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </CreatableSelectField>
            </FormField>
            <FormField label="Project lead">
              <CreatableSelectField
                value={formData.lead_id}
                onChange={(value) => setFormData((state) => ({ ...state, lead_id: value }))}
                className={inputClassName}
                createLabel="Create user"
                onCreate={() => setShowQuickEmployeeModal(true)}
                canCreate={canCreateProjects}
              >
                <option value="">Select manager or employee</option>
                {projectAssigneeOptions.map((item) => <option key={item.id} value={item.id}>{item.first_name} {item.last_name} ({item.role})</option>)}
              </CreatableSelectField>
            </FormField>
            <FormField label="Start date">
              <input type="datetime-local" className={inputClassName} value={formData.start_date} onChange={(event) => setFormData((state) => ({ ...state, start_date: event.target.value }))} />
            </FormField>
            <FormField label="Delivery date" error={formErrors.delivery_date}>
              <input type="datetime-local" className={inputClassName} value={formData.delivery_date} onChange={(event) => setFormData((state) => ({ ...state, delivery_date: event.target.value }))} />
            </FormField>
          </div>
          <div className="rounded-xl border border-gray-200 p-3 dark:border-[var(--color-app-border)]">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={createMode === 'schedule'}
                  onChange={(e) => setCreateMode(e.target.checked ? 'schedule' : 'now')}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Schedule project</span>
              </label>
              <span className="text-xs text-gray-500">(check to set a future run time)</span>
            </div>
            {createMode === 'schedule' && (
              <FormField label="Schedule for" required>
                <input type="datetime-local" className={inputClassName} value={scheduleRunAt} onChange={(event) => setScheduleRunAt(event.target.value)} required={createMode === 'schedule'} />
              </FormField>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button type="submit" loading={submitting} loadingText={createMode === 'schedule' ? 'Scheduling' : 'Creating'}>{createMode === 'schedule' ? 'Schedule project' : 'Create project'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showProjectTypeModal} onClose={() => setShowProjectTypeModal(false)} title="Add project type">
        <form onSubmit={handleCreateProjectType} className="space-y-4">
          <FormField label="Type name" error={projectTypeError} required>
            <input
              autoFocus
              className={inputClassName}
              value={projectTypeName}
              onChange={(event) => {
                setProjectTypeName(event.target.value)
                setProjectTypeError('')
              }}
              placeholder="Research, design, support"
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={() => setShowProjectTypeModal(false)}>Cancel</Button>
            <Button type="submit">Add type</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(assignmentProject)} onClose={() => setAssignmentProject(null)} title="Assign project lead">
        <form onSubmit={handleProjectAssignment} className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-950/50">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Project</p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{assignmentProject?.name}</p>
          </div>
          <FormField label="Project lead">
            <CreatableSelectField
              value={assignmentUserId}
              onChange={setAssignmentUserId}
              className={inputClassName}
              createLabel="Create user"
              onCreate={() => setShowQuickEmployeeModal(true)}
              canCreate={canCreateProjects}
            >
              <option value="">Unassigned</option>
              {projectAssigneeOptions.map((item) => <option key={item.id} value={item.id}>{item.first_name} {item.last_name} ({item.role})</option>)}
            </CreatableSelectField>
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setAssignmentProject(null)}>Cancel</Button>
            <Button type="submit" loading={assigningProject} loadingText="Saving">Save assignment</Button>
          </div>
        </form>
      </Modal>

      <QuickCreateEmployeeModal
        isOpen={showQuickEmployeeModal}
        onClose={() => setShowQuickEmployeeModal(false)}
        existing={assignableUsers}
        leads={[]}
        canCreateLead={false}
        onCreated={async (created) => {
          await loadAssignableUsers()
          setAssignmentUserId(created.id)
          setFormData((state) => ({ ...state, lead_id: created.id }))
        }}
      />

      {/* Edit Project Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit project" size="xl">
        <form onSubmit={handleEditSubmit} className="space-y-5">
          <FormField label="Project name" error={editFormErrors.name} required>
            <input
              name="name"
              autoComplete="off"
              className={inputClassName}
              value={editFormData.name}
              onChange={(event) => setEditFormData((state) => ({ ...state, name: event.target.value }))}
              placeholder="Enter project name"
            />
          </FormField>
          <FormField label="Details">
            <textarea className={inputClassName} rows={4} value={editFormData.description} onChange={(event) => setEditFormData((state) => ({ ...state, description: event.target.value }))} />
          </FormField>
          <div className="grid gap-4 lg:grid-cols-2">
            <FormField label="Status">
              <select
                className={inputClassName}
                value={editFormData.status}
                onChange={(event) => setEditFormData((state) => ({ ...state, status: event.target.value }))}
              >
                <option value="created">Created</option>
                <option value="kickoff">Kickoff</option>
                <option value="execution">Execution</option>
                <option value="review">Review</option>
                <option value="active">Active</option>
                <option value="in_progress">In progress</option>
                <option value="on_hold">On hold</option>
                <option value="completed">Completed</option>
                <option value="reporting">Reporting</option>
                <option value="archived">Archived</option>
              </select>
            </FormField>
            <FormField label="Project lead">
              <select
                className={inputClassName}
                value={editFormData.lead_id}
                onChange={(event) => setEditFormData((state) => ({ ...state, lead_id: event.target.value }))}
              >
                <option value="">Unassigned</option>
                {projectAssigneeOptions.map((item) => <option key={item.id} value={item.id}>{item.first_name} {item.last_name} ({item.role})</option>)}
              </select>
            </FormField>
            <FormField label="Start date">
              <input type="datetime-local" className={inputClassName} value={editFormData.start_date} onChange={(event) => setEditFormData((state) => ({ ...state, start_date: event.target.value }))} />
            </FormField>
            <FormField label="Delivery date" error={editFormErrors.delivery_date}>
              <input type="datetime-local" className={inputClassName} value={editFormData.delivery_date} onChange={(event) => setEditFormData((state) => ({ ...state, delivery_date: event.target.value }))} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowEditModal(false)}>Cancel</Button>
            <Button type="submit" loading={submitting} loadingText="Saving">Save changes</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Project Confirm Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete project"
        message={`Are you sure you want to delete "${deletingProject?.name}"? This action cannot be undone. You can only delete projects that have no existing tasks.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDeleteProject}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}

// Enhanced Project Graph Panel
function ProjectGraphPanel({ rows, summary, loading, totalCount, visibleCount, pageSize, onViewMore, onOpenProject, canAssignProject, onAssignProject, onEditProject, onDeleteProject }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
              <LayoutGrid className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">Project Overview</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{totalCount} projects • {summary.totalTasks} total tasks</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              {summary.remainingTasks} remaining
            </span>
            <span className="flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
              {summary.totalTasks} total
            </span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid border-b border-gray-200 dark:border-gray-700 sm:grid-cols-2">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="rounded-lg bg-amber-50 p-2 dark:bg-amber-900/30">
            <Clock3 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{summary.remainingTasks}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Remaining tasks</p>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-gray-200 bg-gray-50/50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/30 sm:border-l sm:border-t-0">
          <div className="rounded-lg bg-indigo-50 p-2 dark:bg-indigo-900/30">
            <Receipt className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums text-gray-600 dark:text-gray-300">{summary.totalTasks}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Total project tasks</p>
          </div>
        </div>
      </div>

      {/* Project Cards */}
      <div className="p-4">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
          </div>
        ) : rows.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={() => onOpenProject(project)}
                canAssign={canAssignProject?.(project)}
                onAssign={() => onAssignProject?.(project)}
                canManage={canAssignProject?.(project)}
                onEdit={() => onEditProject?.(project)}
                onDelete={() => onDeleteProject?.(project)}
              />
            ))}
          </div>
        ) : (
          <div className="py-8">
            <EmptyState title="No project graph data" description="Projects will appear here when they match your filters." />
          </div>
        )}

        {!loading && rows.length > 0 && visibleCount < totalCount && (
          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
            <span>Showing {rows.length} of {totalCount} projects</span>
            <Button variant="secondary" size="sm" onClick={onViewMore}>
              View {Math.min(pageSize, totalCount - visibleCount)} more
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// Enhanced Project Card Component
function ProjectCard({ project, onOpen, canAssign, onAssign, canManage, onEdit, onDelete }) {
  const statusColors = {
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    on_hold: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    completed: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    archived: 'bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300',
  }

  return (
    <article className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-indigo-700">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white font-bold text-sm shadow-lg shadow-indigo-500/20">
            {project.name?.charAt(0)?.toUpperCase() || 'P'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {project.name}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{project.owner || 'Unassigned'}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {project.key && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  {project.key}
                </span>
              )}
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[project.status] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                {project.statusLabel}
              </span>
            </div>
          </div>
        </div>
      </button>

      {/* Progress */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Progress</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">{project.progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
            style={{ width: `${Math.min(project.progress, 100)}%` }}
          />
        </div>
      </div>

      {/* Task Stats */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{project.completedTasks || 0}/{project.totalTasks || 0} tasks</span>
        {project.days_until_delivery !== undefined && project.days_until_delivery !== null && (
          <span className={project.days_until_delivery < 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}>
            {project.days_until_delivery < 0 ? `${Math.abs(project.days_until_delivery)}d overdue` : `${project.days_until_delivery}d left`}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
        {canAssign && (
          <Button variant="secondary" size="sm" onClick={onAssign} className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            {project.lead_id ? 'Change lead' : 'Assign lead'}
          </Button>
        )}
        {canManage && (
          <>
            <Button variant="secondary" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="secondary" size="sm" onClick={onDelete} className="hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-950/20 dark:hover:text-red-400 dark:hover:border-red-900/50">
              Delete
            </Button>
          </>
        )}
        <Button variant="secondary" size="sm" onClick={onOpen} className="ml-auto gap-1.5">
          Open
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </article>
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
