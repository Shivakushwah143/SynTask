import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clock3, Plus, Receipt, Search, UserPlus,
  FolderKanban, LayoutGrid, BarChart3,
  Calendar, Users, Target, Award, TrendingUp,
  CheckCircle2, AlertCircle, Clock, ChevronRight,
  Briefcase, Layers, GitBranch, Sparkles, Activity, Timer,
  X
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useQueryClient } from 'react-query'
import { useAuthStore } from '../store/authStore'
import { projectsApi } from '../api/projects'
import { clientsAPI } from '../api/clients'
import { scheduledJobsAPI } from '../api/scheduledJobs'
import { invalidateWorkspaceCalendar } from '../api/calendar'
import { usersAPI } from '../api/users'
import { componentsApi } from '../api/components'
import { versionsApi } from '../api/versions'
import { canCreateProject, canManageProject, normalizeRole } from '../utils/roles'
import { Badge, Button, ConfirmDialog, CreatableSelectField, EmptyState, FormField, Modal, PageHeader, SkeletonCard, SkeletonTable, inputClassName } from '../components/ui'
import { excludeCurrentUser } from '../utils/userFilters'
import { QuickCreateClientModal, QuickCreateEmployeeModal } from '../components/relatedRecords/QuickCreateModals'
import { timeService } from '@/services/timeService'
import {
  buildProjectGraphRows,
  buildProjectGraphSummary,
  filterProjects,
  getProjectGridPageSize,
  getVisibleProjectCountForGrid,
} from './projectsData'

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

const getScheduledCountdown = (value, nowMs = Date.now()) => {
  if (!value) {
    return { label: '--:--:--', publishLabel: 'Publish time not set' }
  }
  try {
    const runAt = timeService.instant(value)
    const targetMs = runAt.getTime()
    if (Number.isNaN(targetMs)) throw new Error('Invalid scheduled time')

    const remainingMs = Math.max(0, targetMs - nowMs)
    const totalSeconds = Math.floor(remainingMs / 1000)
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    const timeLabel = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

    return {
      label: remainingMs === 0 ? 'Publishing soon' : `${days > 0 ? `${days}d ` : ''}${timeLabel}`,
      publishLabel: `Publishes ${timeService.formatPattern(runAt, 'MMM d, h:mm a')}`,
    }
  } catch {
    return { label: '--:--:--', publishLabel: 'Scheduled' }
  }
}

function useCountdownNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

function ScheduledPublishPanel({ runAt }) {
  const now = useCountdownNow()
  const countdown = getScheduledCountdown(runAt, now)
  return (
    <div className="mt-3 rounded-lg border border-cyan-200 bg-gradient-to-r from-cyan-50 via-white to-amber-50 p-3 shadow-sm dark:border-cyan-900 dark:from-cyan-950/30 dark:via-gray-900 dark:to-amber-950/20">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-200">
            <Timer className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Publishes in</p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{countdown.publishLabel}</p>
          </div>
        </div>
        <span className="whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 font-mono text-xs font-bold tabular-nums text-white dark:bg-white dark:text-gray-900">
          {countdown.label}
        </span>
      </div>
    </div>
  )
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
    <div className="group rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-md bg-gradient-to-r ${colors[color]} p-1.5 text-white shadow`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</p>}
      {trend && (
        <div className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${trend > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </div>
      )}
    </div>
  )
}

const compactInputClassName =
  'min-h-9 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 dark:border-gray-700 dark:bg-gray-800/80 dark:text-white dark:placeholder:text-gray-400'

export default function Projects() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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
  const [clients, setClients] = useState([])
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
  const [showQuickClientModal, setShowQuickClientModal] = useState(false)
  const [showProjectTypeModal, setShowProjectTypeModal] = useState(false)
  const [projectTypeName, setProjectTypeName] = useState('')
  const [projectTypeError, setProjectTypeError] = useState('')
  const [projectTypeOptions, setProjectTypeOptions] = useState(() => {
    const merged = new Map(DEFAULT_PROJECT_TYPES.map((item) => [item.value, item]))
    loadStoredProjectTypes().forEach((item) => merged.set(item.value, item))
    return Array.from(merged.values())
  })
  const [formData, setFormData] = useState({ name: '', key: '', project_id: '', description: '', type: 'software', lead_id: '', client_id: '', start_date: '', delivery_date: '', priority: 'medium' })
  const [formErrors, setFormErrors] = useState({})

  const [showEditModal, setShowEditModal] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [editFormData, setEditFormData] = useState({ name: '', description: '', lead_id: '', client_id: '', type: 'software', priority: 'medium', start_date: '', delivery_date: '', status: 'active' })
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
      client_id: project.client_id || '',
      type: project.type || 'software',
      priority: project.priority || 'medium',
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
  }, [])

  const loadAssignableUsers = useCallback(async () => {
    try {
      const response = await usersAPI.getAssignableUsers()
      setAssignableUsers(excludeCurrentUser(response.users || [], user))
    } catch (error) {
      setAssignableUsers([])
    }
  }, [])

  const loadClients = useCallback(async () => {
    try {
      const data = await clientsAPI.listClients({})
      setClients(data.clients || [])
    } catch (error) {
      console.error('Error loading clients:', error)
      setClients([])
    }
  }, [])

  const loadProjectTypes = useCallback(async () => {
    try {
      const response = await projectsApi.getProjectTypes()
      setProjectTypeOptions(response.data.project_types || DEFAULT_PROJECT_TYPES)
    } catch (error) {
      setProjectTypeOptions(DEFAULT_PROJECT_TYPES)
    }
  }, [])

  useEffect(() => {
    loadProjects()

    const handleProjectsUpdated = () => {
      loadProjects()
    }
    window.addEventListener('syntask:projects-updated', handleProjectsUpdated)
    window.addEventListener('syntask:data-updated', handleProjectsUpdated)

    return () => {
      window.removeEventListener('syntask:projects-updated', handleProjectsUpdated)
      window.removeEventListener('syntask:data-updated', handleProjectsUpdated)
    }
  }, [loadProjects])

  useEffect(() => {
    loadAssignableUsers()
  }, [loadAssignableUsers])

  useEffect(() => {
    loadClients()
  }, [loadClients])

  useEffect(() => {
    loadProjectTypes()
  }, [loadProjectTypes])

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
    scheduled: projects.filter((project) => project.is_scheduled_placeholder || (project.status || '').toLowerCase() === 'scheduled').length,
  }), [projects])

  const projectCards = useMemo(() => filteredProjects.map((project) => {
    const currentUserId = String(user?.id || user?._id || '')
    const memberIds = [
      ...(Array.isArray(project.assigned_user_ids) ? project.assigned_user_ids : []),
      ...(Array.isArray(project.team_member_ids) ? project.team_member_ids : []),
      project.assigned_to,
    ].filter(Boolean).map(String)
    const fallbackRole = currentUserId && String(project.lead_id || '') === currentUserId
      ? 'project_lead'
      : currentUserId && memberIds.includes(currentUserId)
        ? 'project_member'
        : project.effective_project_role
    return {
      ...project,
      current_user_project_role: project.effective_project_role || fallbackRole,
      statusLabel: (project.status || 'active').replace(/_/g, ' '),
      progress: typeof project.progress_percentage === 'number'
        ? project.progress_percentage
        : project.task_count
          ? Math.min(100, Math.round(((project.completed_task_count || 0) / project.task_count) * 100))
          : 0,
    }
  }), [filteredProjects, user?.id, user?._id])

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
      toast.success(assignmentUserId ? 'Project owner assigned' : 'Project owner cleared')
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
    if (!formData.project_id.trim()) nextErrors.project_id = 'Project ID is required.'
    if (!formData.description.trim()) nextErrors.description = 'Description is required.'
    if (!formData.lead_id) nextErrors.lead_id = 'Project owner is required.'
    if (formData.type !== 'internal' && !formData.client_id) nextErrors.client_id = 'Client is required for client-facing projects.'
    if (!formData.start_date) nextErrors.start_date = 'Start date is required.'
    if (!formData.delivery_date) nextErrors.delivery_date = 'Delivery date is required.'
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
      const payload = { ...formData, key: autoKey || formData.project_id, project_id: formData.project_id || autoKey }
      if (payload.start_date) payload.start_date = timeService.toUtcISOString(payload.start_date)
      if (payload.delivery_date) payload.delivery_date = timeService.toUtcISOString(payload.delivery_date)

      if (createMode === 'schedule') {
        if (!scheduleRunAt) {
          toast.error('Schedule time is required')
          return
        }
        const runAt = timeService.parseZonedInput(scheduleRunAt)
        if (!runAt || Number.isNaN(runAt.getTime()) || runAt <= timeService.now()) {
          toast.error('Schedule time must be in the future')
          return
        }
        await scheduledJobsAPI.scheduleJob({
          action_type: 'CREATE_PROJECT',
          payload,
          run_at: runAt.toISOString(),
        })
        toast.success('Project scheduled successfully')
        invalidateWorkspaceCalendar(queryClient)
        setFormData({ name: '', key: '', project_id: '', description: '', type: 'software', lead_id: '', client_id: '', start_date: '', delivery_date: '', priority: 'medium' })
        setCreateMode('now')
        setScheduleRunAt('')
        setShowCreateModal(false)
        await loadProjects()
        return
      }

      const response = await projectsApi.createProject(payload)
      toast.success('Project created successfully')

      setFormData({ name: '', key: '', project_id: '', description: '', type: 'software', lead_id: '', client_id: '', start_date: '', delivery_date: '', priority: 'medium' })
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

  const handleCreateProjectType = async (event) => {
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
    const response = await projectsApi.createProjectType(label)
    const nextOption = response.data.project_type || { value, label: formatProjectTypeLabel(label) }
    setProjectTypeOptions((state) => [...state, nextOption])
    setFormData((state) => ({ ...state, type: nextOption.value }))
    setProjectTypeName('')
    setProjectTypeError('')
    setShowProjectTypeModal(false)
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 px-5 py-3.5 text-white shadow-lg">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2 backdrop-blur-sm">
              <FolderKanban className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight md:text-xl">Projects</h1>
              <p className="text-xs text-indigo-100">Project health, ownership, and progress tracking</p>
            </div>
          </div>
          {canCreateProjects && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-3.5 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
            >
              <Plus className="h-4 w-4" />
              New Project
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
        <StatCard
          label="Scheduled"
          value={summary.scheduled}
          icon={Timer}
          color="amber"
          subtitle="Awaiting publish"
        />
      </div>

      {/* Search & Filters */}
      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className={`${compactInputClassName} pl-9`}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by name, key, status, or description"
            />
          </div>
          <div id="project-filters" className="grid gap-2 md:grid-cols-3 lg:flex-1">
            <select
              className={`${compactInputClassName} bg-gray-50 dark:bg-gray-900/50`}
              value={filters.status}
              onChange={(event) => setFilters((state) => ({ ...state, status: event.target.value }))}
            >
              <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All statuses</option>
              <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="scheduled">Scheduled</option>
              <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="active">Active</option>
              <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="in_progress">In progress</option>
              <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="on_hold">On hold</option>
              <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="completed">Completed</option>
            </select>
            <select
              className={`${compactInputClassName} bg-gray-50 dark:bg-gray-900/50`}
              value={filters.type}
              onChange={(event) => setFilters((state) => ({ ...state, type: event.target.value }))}
            >
              <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All types</option>
              {projectTypeOptions.map((item) => <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select
              className={`${compactInputClassName} bg-gray-50 dark:bg-gray-900/50`}
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
          if (project.is_scheduled_placeholder) return
          const match = projectCards.find((item) => item.id === project.id)
          if (match) navigate(`/projects/${match.id}/board`)
        }}
        canAssignProject={(project) => {
          const match = projectCards.find((item) => item.id === project.id)
          return Boolean(match && !match.is_scheduled_placeholder && canManageProject(user?.role, match, user?.id))
        }}
        onAssignProject={(project) => {
          const match = projectCards.find((item) => item.id === project.id)
          if (match && canManageProject(user?.role, match, user?.id)) openAssignmentModal(match)
        }}
        onEditProject={(project) => {
          const match = projectCards.find((item) => item.id === project.id)
          if (match && !match.is_scheduled_placeholder) openEditModal(match)
        }}
        onDeleteProject={(project) => {
          const match = projectCards.find((item) => item.id === project.id)
          if (match && !match.is_scheduled_placeholder) openDeleteConfirm(match)
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
          <FormField label="Description" error={formErrors.description} required>
            <textarea className={inputClassName} rows={4} value={formData.description} onChange={(event) => setFormData((state) => ({ ...state, description: event.target.value }))} />
          </FormField>
          <FormField label="Client" error={formErrors.client_id} required={formData.type !== 'internal'}>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <CreatableSelectField
                  value={formData.client_id}
                  onChange={(value) => setFormData((state) => ({ ...state, client_id: value }))}
                  className={inputClassName}
                  createLabel="Create client"
                  onCreate={() => setShowQuickClientModal(true)}
                  canCreate={canCreateProjects}
                >
                  <option value="">Select a client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}{client.company_name ? ` (${client.company_name})` : ''}
                    </option>
                  ))}
                </CreatableSelectField>
              </div>
              <button
                type="button"
                onClick={() => setFormData((state) => ({ ...state, client_id: '' }))}
                disabled={!formData.client_id}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-rose-400"
                title="Clear selected client"
              >
                <X className="h-4 w-4" />
                Clear
              </button>
            </div>
          </FormField>
          <div className="grid gap-4 lg:grid-cols-2">
            <FormField label="Type" required>
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
            <FormField label="Project Owner" error={formErrors.lead_id} required>
              <CreatableSelectField
                value={formData.lead_id}
                onChange={(value) => setFormData((state) => ({ ...state, lead_id: value }))}
                className={inputClassName}
                createLabel="Create user"
                onCreate={() => setShowQuickEmployeeModal(true)}
                canCreate={canCreateProjects}
              >
                <option value="">Select owner</option>
                {projectAssigneeOptions.map((item) => <option key={item.id} value={item.id}>{item.first_name} {item.last_name} ({item.role})</option>)}
              </CreatableSelectField>
            </FormField>
            <FormField label="Priority" required>
              <select className={inputClassName} value={formData.priority} onChange={(event) => setFormData((state) => ({ ...state, priority: event.target.value }))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </FormField>
            <FormField label="Start date" error={formErrors.start_date} required>
              <input type="datetime-local" className={inputClassName} value={formData.start_date} onChange={(event) => setFormData((state) => ({ ...state, start_date: event.target.value }))} />
            </FormField>
            <FormField label="Delivery date" error={formErrors.delivery_date} required>
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

      <Modal isOpen={Boolean(assignmentProject)} onClose={() => setAssignmentProject(null)} title="Assign project owner">
        <form onSubmit={handleProjectAssignment} className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-950/50">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Project</p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{assignmentProject?.name}</p>
          </div>
          <FormField label="Project Owner">
            <CreatableSelectField
              value={assignmentUserId}
              onChange={setAssignmentUserId}
              className={inputClassName}
              createLabel="Create user"
              onCreate={() => setShowQuickEmployeeModal(true)}
              canCreate={canCreateProjects}
            >
              <option value="">Owner not assigned</option>
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

      <QuickCreateClientModal
        isOpen={showQuickClientModal}
        onClose={() => setShowQuickClientModal(false)}
        existing={clients}
        onCreated={async (created) => {
          await loadClients()
          setFormData((state) => ({ ...state, client_id: created.id }))
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
                <option value="on_hold">On hold</option>
                <option value="completed">Completed</option>
                <option value="reporting">Reporting</option>
                <option value="archived">Archived</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </FormField>
            <FormField label="Project Owner">
              <select
                className={inputClassName}
                value={editFormData.lead_id}
                onChange={(event) => setEditFormData((state) => ({ ...state, lead_id: event.target.value }))}
              >
                <option value="">Unassigned</option>
                {projectAssigneeOptions.map((item) => <option key={item.id} value={item.id}>{item.first_name} {item.last_name} ({item.role})</option>)}
              </select>
            </FormField>
            <FormField label="Client" required={editFormData.type !== 'internal'}>
              <select className={inputClassName} value={editFormData.client_id} onChange={(event) => setEditFormData((state) => ({ ...state, client_id: event.target.value }))}>
                <option value="">No client</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}{client.company_name ? ` (${client.company_name})` : ''}</option>)}
              </select>
            </FormField>
            <FormField label="Type">
              <select className={inputClassName} value={editFormData.type} onChange={(event) => setEditFormData((state) => ({ ...state, type: event.target.value }))}>
                {projectTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </FormField>
            <FormField label="Priority">
              <select className={inputClassName} value={editFormData.priority} onChange={(event) => setEditFormData((state) => ({ ...state, priority: event.target.value }))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
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
        message={deletingProject
          ? `This will permanently delete "${deletingProject.name}"${deletingProject.task_count ? ` and all ${deletingProject.task_count} task(s) in it` : ''}. This action cannot be undone.`
          : ''}
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
    cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    scheduled: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  }
  const isScheduled = Boolean(project.is_scheduled_placeholder)
  const roleBadge = (() => {
    const role = String(project.current_user_project_role || project.effective_project_role || '').toLowerCase()
    if (role === 'project_lead') {
      return {
        label: 'Project Owner',
        className: 'border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
        icon: Award,
      }
    }
    if (role === 'project_member') {
      return {
        label: 'Member',
        className: 'border-blue-200 bg-blue-100 text-blue-800 dark:border-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
        icon: Users,
      }
    }
    return null
  })()
  const RoleBadgeIcon = roleBadge?.icon
  return (
    <article className={`group rounded-xl border p-4 shadow-sm transition-all hover:shadow-md ${
      isScheduled
        ? 'border-cyan-300 bg-gradient-to-br from-cyan-50 via-white to-amber-50 ring-1 ring-cyan-100 dark:border-cyan-800 dark:from-cyan-950/30 dark:via-gray-900 dark:to-amber-950/20 dark:ring-cyan-900/50'
        : 'border-gray-200 bg-white hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-indigo-700'
    }`}>
      <button type="button" onClick={onOpen} disabled={isScheduled} className={`w-full text-left ${isScheduled ? 'cursor-default' : ''}`}>
        <div className="flex items-start gap-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white font-bold text-sm shadow-lg ${
            isScheduled ? 'bg-gradient-to-br from-cyan-600 to-amber-500 shadow-cyan-500/20' : 'bg-gradient-to-br from-indigo-500 to-purple-500 shadow-indigo-500/20'
          }`}>
            {isScheduled ? <Timer className="h-5 w-5" /> : (project.name?.charAt(0)?.toUpperCase() || 'P')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {project.name}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{project.owner || project.owner_name || 'Owner not assigned'}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {roleBadge && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${roleBadge.className}`}>
                  <RoleBadgeIcon className="h-3 w-3" />
                  {roleBadge.label}
                </span>
              )}
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
          <span>{isScheduled ? 'Publish status' : 'Progress'}</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">{isScheduled ? 'Scheduled' : `${project.progress}%`}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isScheduled ? 'bg-gradient-to-r from-cyan-500 to-amber-400' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}`}
            style={{ width: `${isScheduled ? 100 : Math.min(project.progress, 100)}%` }}
          />
        </div>
      </div>

      {!isScheduled && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge label={`Priority: ${project.priority || 'medium'}`} colorKey={project.priority || 'medium'} />
          <Badge label={`Health: ${project.health || project.project_health?.level || 'healthy'}`} colorKey={project.health || project.project_health?.level || 'healthy'} />
          <Badge label={`Deadline: ${project.deadline_urgency || 'none'}`} colorKey={project.deadline_urgency || 'draft'} />
        </div>
      )}

      {/* Task Stats */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{isScheduled ? 'Not published yet' : `${project.completedTasks || 0}/${project.totalTasks || 0} tasks`}</span>
        {!isScheduled && project.days_until_delivery !== undefined && project.days_until_delivery !== null && (
          <span className={project.days_until_delivery < 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}>
            {project.days_until_delivery < 0 ? `${Math.abs(project.days_until_delivery)}d overdue` : `${project.days_until_delivery}d left`}
          </span>
        )}
      </div>

      {isScheduled && <ScheduledPublishPanel runAt={project.scheduled_run_at} />}

      {/* Creation Time */}
      {(() => {
        if (!project.created_at) return null
        try {
          const createdDate = timeService.instant(project.created_at)
          const now = timeService.now()
          const diffMs = now - createdDate
          const diffDays = diffMs / (1000 * 60 * 60 * 24)
          const label = diffDays < 2
            ? timeService.formatRelative(createdDate, { addSuffix: true })
            : timeService.formatPattern(createdDate, 'MMM d, yyyy')
          return (
            <div className="mt-2 flex items-center text-xs text-gray-400 dark:text-gray-500">
              <Clock className="h-3 w-3 mr-1" />
              {label}
            </div>
          )
        } catch {
          return null
        }
      })()}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
        {isScheduled ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200">
            <Clock className="h-3.5 w-3.5" />
            Scheduled
          </span>
        ) : canAssign && (
          <Button variant="secondary" size="sm" onClick={onAssign} className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            {project.lead_id ? 'Change owner' : 'Assign owner'}
          </Button>
        )}
        {!isScheduled && canManage && (
          <>
            <Button variant="secondary" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="secondary" size="sm" onClick={onDelete} className="hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-950/20 dark:hover:text-red-400 dark:hover:border-red-900/50">
              Delete
            </Button>
          </>
        )}
        {!isScheduled && (
          <Button variant="secondary" size="sm" onClick={onOpen} className="ml-auto gap-1.5">
            Open
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}
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
