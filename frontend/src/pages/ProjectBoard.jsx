import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, ArrowRight, Filter, GripVertical, Plus, Search, Sparkles, UserPlus } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import toast from 'react-hot-toast'
import { projectsApi } from '../api/projects'
import { tasksAPI } from '../api/tasks'
import { scheduledJobsAPI } from '../api/scheduledJobs'
import { usersAPI } from '../api/users'
import { componentsApi } from '../api/components'
import { versionsApi } from '../api/versions'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { useAuthStore } from '../store/authStore'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { canCreateTask, canManageProject, hasCompanyAdminAccess, isLeadRole, normalizeRole } from '../utils/roles'
import { Badge, Button, CreatableSelectField, EmptyState, FormField, Modal, PageHeader, SkeletonCard, SkeletonKanban, SkeletonTable, inputClassName } from '../components/ui'
import { QuickCreateEmployeeModal } from '../components/relatedRecords/QuickCreateModals'
import { getProjectRoleAssignmentIds, getProjectRoleNames, getUserDisplayName, normalizeEstimatedHours } from './ProjectBoard.helpers'
import { timeService } from '../services/timeService'

const DEFAULT_STATUSES = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'In Review' },
  { id: 'completed', label: 'Completed' },
]

const STATUS_COLORS = {
  todo: '#7C6FE0',
  in_progress: '#FF8A4C',
  in_review: '#F59E0B',
  completed: '#2FB47C',
  done: '#2FB47C',
}

const TASK_PRIORITY_STYLES = {
  critical: 'border-rose-200 bg-rose-50/75 hover:border-rose-300 dark:border-rose-700/55 dark:bg-[rgb(45_24_24_/_0.96)] dark:hover:border-rose-500/75',
  high: 'border-orange-200 bg-orange-50/75 hover:border-orange-300 dark:border-orange-700/55 dark:bg-[rgb(45_30_20_/_0.96)] dark:hover:border-orange-500/75',
  medium: 'border-amber-200 bg-amber-50/70 hover:border-amber-300 dark:border-amber-700/55 dark:bg-[rgb(42_34_20_/_0.96)] dark:hover:border-amber-500/75',
  low: 'border-emerald-200 bg-emerald-50/70 hover:border-emerald-300 dark:border-emerald-700/55 dark:bg-[rgb(22_38_30_/_0.96)] dark:hover:border-emerald-500/75',
}

const TASK_PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', className: 'text-emerald-700 dark:text-emerald-300' },
  { value: 'medium', label: 'Medium', className: 'text-amber-700 dark:text-amber-300' },
  { value: 'high', label: 'High', className: 'text-orange-700 dark:text-orange-300' },
  { value: 'critical', label: 'Critical', className: 'text-rose-700 dark:text-rose-300' },
]

const TASK_PRIORITY_SELECT_STYLES = {
  low: 'border-emerald-300 text-emerald-700 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-emerald-700 dark:text-emerald-300',
  medium: 'border-amber-300 text-amber-700 focus:border-amber-500 focus:ring-amber-500/20 dark:border-amber-700 dark:text-amber-300',
  high: 'border-orange-300 text-orange-700 focus:border-orange-500 focus:ring-orange-500/20 dark:border-orange-700 dark:text-orange-300',
  critical: 'border-rose-300 text-rose-700 focus:border-rose-500 focus:ring-rose-500/20 dark:border-rose-700 dark:text-rose-300',
}

const PROJECT_AGENT_OPERATIONS = [
  { value: 'project_summary', label: 'Project summary' },
  { value: 'decompose_scope', label: 'Decompose scope' },
  { value: 'identify_risks', label: 'Identify risks' },
  { value: 'execution_guidance', label: 'Execution guidance' },
  { value: 'review_plan', label: 'Review plan' },
  { value: 'estimate_work', label: 'Estimate work' },
  { value: 'comprehensive_project_review', label: 'Full review' },
]

const normalizeStatusId = (value) => String(value || '').trim().toLowerCase()

const normalizeBoardColumns = (columns) => {
  const source = Array.isArray(columns) && columns.length ? columns : DEFAULT_STATUSES
  return source.map((column) => ({
    ...column,
    id: normalizeStatusId(column.id || column.status || column.key),
    label: column.label || column.name || String(column.id || column.status || column.key || '').replace(/_/g, ' '),
  })).filter((column) => column.id)
}

const normalizeBoardPayload = (payload) => {
  const data = payload?.data?.data || payload?.data || payload || {}
  const boardColumns = normalizeBoardColumns(data.board_columns || data.columns || data.statuses)
  const sourceTasksByStatus = data.tasks_by_status || data.tasksByStatus || data.board || {}
  const tasksByStatus = Object.fromEntries(boardColumns.map((column) => [column.id, []]))

  if (Array.isArray(data.tasks)) {
    data.tasks.forEach((task) => {
      const status = normalizeStatusId(task.status || task.status_id)
      if (!tasksByStatus[status]) tasksByStatus[status] = []
      tasksByStatus[status].push({ ...task, status })
    })
  } else {
    Object.entries(sourceTasksByStatus).forEach(([status, tasks]) => {
      const normalizedStatus = normalizeStatusId(status)
      if (!tasksByStatus[normalizedStatus]) tasksByStatus[normalizedStatus] = []
      tasksByStatus[normalizedStatus].push(...(Array.isArray(tasks) ? tasks : []).map((task) => ({
        ...task,
        id: task.id || task._id,
        status: normalizeStatusId(task.status || normalizedStatus),
      })))
    })
  }

  return {
    ...data,
    board_columns: boardColumns,
    tasks_by_status: tasksByStatus,
  }
}

export default function ProjectBoard() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isMobile = useMediaQuery('(max-width: 767px)')
  const userRole = normalizeRole(user?.role)
  const [activeTab, setActiveTab] = useState('board')
  const [loading, setLoading] = useState(true)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [loadingPages, setLoadingPages] = useState(false)
  const [projectInfo, setProjectInfo] = useState(null)
  const [boardData, setBoardData] = useState(null)
  const [summaryData, setSummaryData] = useState(null)
  const [pages, setPages] = useState([])
  const [projectFiles, setProjectFiles] = useState([])
  const [components, setComponents] = useState([])
  const [versions, setVersions] = useState([])
  const [assignableUsers, setAssignableUsers] = useState([])
  const [projectAssignableUsers, setProjectAssignableUsers] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState({ priority: '', assignee: '', label: '' })
  const [showFilters, setShowFilters] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showProjectAgentModal, setShowProjectAgentModal] = useState(false)
  const [showQuickEmployeeModal, setShowQuickEmployeeModal] = useState(false)
  const [assignmentManagerId, setAssignmentManagerId] = useState('')
  const [assignmentLeaderId, setAssignmentLeaderId] = useState('')
  const [taskAssigneeId, setTaskAssigneeId] = useState('')
  const [createTaskPriority, setCreateTaskPriority] = useState('medium')
  const [createMode, setCreateMode] = useState('now')
  const [scheduleRunAt, setScheduleRunAt] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('todo')
  const [statuses, setStatuses] = useState(DEFAULT_STATUSES)
  const [submitting, setSubmitting] = useState(false)
  const [projectAgentSubmitting, setProjectAgentSubmitting] = useState(false)
  const [projectAgentOperation, setProjectAgentOperation] = useState('project_summary')
  const [projectAgentRequest, setProjectAgentRequest] = useState('')
  const [projectAgentRun, setProjectAgentRun] = useState(null)
  const [assigningProject, setAssigningProject] = useState(false)
  const [updatingTaskId, setUpdatingTaskId] = useState(null)
  const [activeTaskId, setActiveTaskId] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const loadProjectInfo = useCallback(async () => {
    try {
      const [projectResponse, componentsResponse, versionsResponse] = await Promise.all([
        projectsApi.getProject(projectId),
        componentsApi.getComponents(projectId).catch(() => ({ data: { components: [] } })),
        versionsApi.getVersions(projectId).catch(() => ({ data: { versions: [] } })),
      ])
      setProjectInfo(projectResponse.data)
      setComponents(componentsResponse.data.components || [])
      setVersions(versionsResponse.data.versions || [])
      const [pagesResponse, filesResponse] = await Promise.all([
        projectsApi.getPages(projectId).catch(() => ({ data: { pages: [] } })),
        projectsApi.getProjectFiles(projectId).catch(() => ({ data: { files: [] } })),
      ])
      setPages(pagesResponse.data.pages || [])
      setProjectFiles(filesResponse.data.files || [])
    } catch (error) {
      console.error(error)
    }
  }, [projectId])

  const loadAssignableUsers = useCallback(async () => {
    try {
      const [taskAssignableData, projectAssignableData] = await Promise.all([
        usersAPI.getAssignableUsers(false, projectId),
        usersAPI.listUsers(null, null, 'active', 0, 500),
      ])
      setAssignableUsers(taskAssignableData.users || [])
      setProjectAssignableUsers(projectAssignableData.users || [])
    } catch (error) {
      setAssignableUsers([])
      setProjectAssignableUsers([])
    }
  }, [projectId])

  const loadBoardData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await projectsApi.getProjectBoard(projectId)
      const normalizedBoard = normalizeBoardPayload(response)
      setBoardData(normalizedBoard)
      setStatuses(normalizedBoard.board_columns)
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
      acc[normalizeStatusId(status)] = (tasks || []).filter((task) => {
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
    const estimatedHours = normalizeEstimatedHours(formData.get('estimated_hours'))
    if (!estimatedHours) {
      toast.error('Estimated hours must be greater than 0 and no more than 24')
      return
    }
    try {
      setSubmitting(true)
      const taskPayload = {
        title: formData.get('title'),
        description: formData.get('description') || '',
        priority: formData.get('priority') || createTaskPriority || 'medium',
        assigned_to: taskAssigneeId || null,
        due_date: timeService.zonedInputToUtcISOString(formData.get('due_date')),
        estimated_hours: estimatedHours,
        project_id: projectId,
        status: selectedStatus,
      }
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
          action_type: 'CREATE_TASK',
          payload: taskPayload,
          run_at: timeService.toUtcISOString(runAt),
        })
        toast.success('Task scheduled successfully')
        setShowCreateModal(false)
        event.target.reset()
        setTaskAssigneeId('')
        setCreateTaskPriority('medium')
        setCreateMode('now')
        setScheduleRunAt('')
        return
      }
      await tasksAPI.createTask(taskPayload)
      toast.success('Task created successfully')
      setShowCreateModal(false)
      event.target.reset()
      setTaskAssigneeId('')
      setCreateTaskPriority('medium')
      setCreateMode('now')
      setScheduleRunAt('')
      await loadBoardData()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create task')
    } finally {
      setSubmitting(false)
    }
  }

  const openAssignProjectModal = () => {
    const roleIds = getProjectRoleAssignmentIds(projectRecord, projectAssignableUsers, user)
    setAssignmentManagerId(roleIds.manager)
    setAssignmentLeaderId(roleIds.lead || projectRecord.lead_id || '')
    setShowAssignModal(true)
  }

  const handleAssignProject = async (event) => {
    event.preventDefault()
    if (assigningProject) return
    try {
      setAssigningProject(true)
      const assignedUserIds = [assignmentManagerId, assignmentLeaderId].filter(Boolean)
      await projectsApi.updateProject(projectId, {
        assigned_to: assignmentManagerId || assignmentLeaderId || '',
        assigned_user_ids: assignedUserIds.join(','),
      })
      toast.success(assignedUserIds.length ? 'Project assignment updated' : 'Project unassigned')
      setShowAssignModal(false)
      await Promise.all([loadProjectInfo(), loadBoardData()])
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update project assignment')
    } finally {
      setAssigningProject(false)
    }
  }

  const handleProjectAgentRun = async (event) => {
    event.preventDefault()
    const request = projectAgentRequest.trim()
    if (!request) {
      toast.error('Request is required')
      return
    }
    try {
      setProjectAgentSubmitting(true)
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `project-agent-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const response = await projectsApi.createProjectAgentRun({
        schema_version: '1.0',
        project_id: projectId,
        task_id: null,
        operation: projectAgentOperation,
        user_request: request,
        requested_focus: null,
        selected_record_ids: {},
        preferences: { detail_level: 'standard' },
        session_id: `project:${projectId}`,
        conversation_id: `project-agent:${projectId}`,
        idempotency_key: idempotencyKey,
      })
      setProjectAgentRun(response.data)
      toast.success('Project Agent request started')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Project Agent unavailable')
    } finally {
      setProjectAgentSubmitting(false)
    }
  }

  const currentTasks = Object.values(filteredBoard).flat()
  const allProjectTasks = Object.values(boardData?.tasks_by_status || {}).flat()
  const completedTasks = allProjectTasks.filter((task) => ['completed', 'done'].includes((task.status || '').toLowerCase())).length
  const completionPercentage = allProjectTasks.length ? Math.round((completedTasks / allProjectTasks.length) * 100) : 0
  const overdueTasks = allProjectTasks.filter((task) => {
    if (!task.due_date) return false
    try {
      return timeService.instantTime(task.due_date) < timeService.now().getTime() && !['completed', 'done', 'cancelled'].includes((task.status || '').toLowerCase())
    } catch {
      return false
    }
  }).length
  const dueSoonTasks = allProjectTasks.filter((task) => {
    if (!task.due_date) return false
    try {
      const dueAt = timeService.instantTime(task.due_date)
      const now = timeService.now().getTime()
      const inThreeDays = now + (3 * 24 * 60 * 60 * 1000)
      return dueAt >= now && dueAt <= inThreeDays && !['completed', 'done', 'cancelled'].includes((task.status || '').toLowerCase())
    } catch {
      return false
    }
  }).length
  const unassignedTasks = allProjectTasks.filter((task) => !task.assigned_to).length
  const totalEstimatedHours = allProjectTasks.reduce((sum, task) => sum + Number(task.estimated_hours || 0), 0)
  const projectRecord = {
    ...(boardData?.project || {}),
    ...(projectInfo || {}),
    assigned_users: projectInfo?.assigned_users || boardData?.project?.assigned_users || [],
    assigned_user_ids: projectInfo?.assigned_user_ids || boardData?.project?.assigned_user_ids || [],
  }
  const canManageCurrentProject = canManageProject(user?.role, projectRecord, user?.id)
  const canManageColumns = hasCompanyAdminAccess(user?.role) || isLeadRole(user?.role) || canManageCurrentProject
  const canAssignProject = hasCompanyAdminAccess(user?.role) || (userRole === 'manager' && canManageCurrentProject)
  const canCreateProjectTask = canCreateTask(user?.role)
  const activeProject = projectInfo?.name || boardData?.project?.name || 'Project'
  const projectDescription = projectRecord.description || 'No project description available.'
  const projectStatus = projectRecord.status || 'active'
  const formatProjectDate = (value) => {
    if (!value) return 'Not set'
    try {
      return timeService.format(value, { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return 'Not set'
    }
  }

  const updateTaskInBoard = useCallback((taskId, nextStatus) => {
    setBoardData((current) => {
      if (!current?.tasks_by_status) return current
      let movedTask = null
      const tasksByStatus = Object.fromEntries(
        Object.entries(current.tasks_by_status).map(([status, tasks]) => [
          status,
          (tasks || []).filter((task) => {
            if (String(task.id) === String(taskId)) {
              movedTask = { ...task, status: nextStatus }
              return false
            }
            return true
          }),
        ])
      )

      if (!movedTask) return current
      if (!tasksByStatus[nextStatus]) tasksByStatus[nextStatus] = []
      tasksByStatus[nextStatus] = [movedTask, ...tasksByStatus[nextStatus]]
      return { ...current, tasks_by_status: tasksByStatus }
    })
  }, [])

  const handleDragStart = (event) => {
    setActiveTaskId(event.active.id)
  }

  const handleDragEnd = async (event) => {
    const { active, over } = event
    setActiveTaskId(null)

    if (!over || updatingTaskId) return

    const activeTask = allProjectTasks.find((task) => String(task.id) === String(active.id))
    if (!activeTask) return

    const destinationStatus = normalizeStatusId(over.data?.current?.sortable?.containerId || over.id)
    const currentStatus = normalizeStatusId(activeTask.status)
    if (!destinationStatus || destinationStatus === currentStatus) return
    if (!statuses.some((status) => status.id === destinationStatus)) return

    try {
      setUpdatingTaskId(active.id)
      updateTaskInBoard(active.id, destinationStatus)
      await tasksAPI.updateTaskStatus(active.id, destinationStatus)
      toast.success('Task status updated')
      await loadBoardData()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update task status')
      await loadBoardData()
    } finally {
      setUpdatingTaskId(null)
    }
  }
  const managerAssignmentOptions = useMemo(() => {
    const managers = projectAssignableUsers.filter((item) => normalizeRole(item.role) === 'manager')
    if (userRole === 'manager' && !managers.some((item) => String(item.id || item._id) === String(user?.id || user?._id))) {
      return [user, ...managers].filter(Boolean)
    }
    return managers
  }, [projectAssignableUsers, user, userRole])
  const leaderAssignmentOptions = useMemo(
    () => projectAssignableUsers.filter((item) => normalizeRole(item.role) === 'lead'),
    [projectAssignableUsers],
  )
  const { manager: projectManagers, lead: projectLeaders } = getProjectRoleNames(projectRecord, projectAssignableUsers, user)
  const managerValue = projectManagers.length ? projectManagers.join(', ') : 'Unassigned'
  const leaderValue = projectLeaders.length ? projectLeaders.join(', ') : 'Unassigned'
  const statusChartData = statuses.map((status) => ({
    id: status.id,
    name: status.label || status.id.replace(/_/g, ' '),
    value: allProjectTasks.filter((task) => normalizeStatusId(task.status) === status.id).length,
    color: STATUS_COLORS[status.id] || '#4285F4',
  })).filter((item) => item.value > 0)
  const overviewCards = [
    { title: 'Tasks', value: allProjectTasks.length, color: '#4285F4', helper: 'Live total tasks' },
    { title: 'Complete', value: completedTasks, color: '#2FB47C', helper: 'Tasks finished' },
    { title: 'Overdue', value: overdueTasks, color: '#EF4444', helper: 'Past due items' },
    { title: 'Due soon', value: dueSoonTasks, color: '#FF8A4C', helper: 'Next 3 days' },
    { title: 'Unassigned', value: unassignedTasks, color: '#7C6FE0', helper: 'Needs ownership' },
    { title: 'Est. hours', value: totalEstimatedHours, color: '#0EA5E9', helper: 'Task effort' },
    { title: 'In progress', value: allProjectTasks.filter((task) => (task.status || '').toLowerCase() === 'in_progress').length, color: '#A855F7', helper: 'Active now' },
    { title: 'Completion', value: `${completionPercentage}%`, color: '#7C6FE0', helper: 'Derived from live tasks' },
  ]

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
            <Button variant="secondary" size="sm" onClick={() => setShowProjectAgentModal(true)}>
              <Sparkles className="h-4 w-4" />
              Project Agent
            </Button>
            {canCreateProjectTask ? (
              <Button size="sm" onClick={() => { setSelectedStatus('todo'); setShowCreateModal(true) }}>
                <Plus className="h-4 w-4" />
                Create task
              </Button>
            ) : null}
          </div>
        )}
      />

      <section className="overflow-hidden rounded-2xl border border-primary-200/60 bg-[linear-gradient(135deg,rgba(255,250,244,0.98),rgba(248,242,232,0.92))] shadow-[0_18px_45px_rgba(63,49,37,0.08)] dark:border-[#5a4635] dark:bg-[linear-gradient(135deg,rgba(36,28,20,0.98),rgba(20,16,12,0.96))] dark:shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Project detail</p>
              <Badge label={projectStatus.replace(/_/g, ' ')} colorKey={projectStatus} />
              {projectRecord.type ? <Badge label={projectRecord.type} colorKey="scheduled" /> : null}
            </div>
            <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-text-primary dark:text-text-primary">Delivery overview</h2>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-text-secondary dark:text-text-secondary">{projectDescription}</p>
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                    <span>Completion</span>
                    <span>{completionPercentage}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/70 dark:bg-black/55">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#2FB47C,#FF8A4C,#7C6FE0)] transition-all duration-300"
                      style={{ width: `${Math.max(0, Math.min(100, completionPercentage))}%` }}
                    />
                  </div>
                </div>
              </div>
              <ProjectStatusDonut data={statusChartData} completion={completionPercentage} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {overviewCards.map((card) => (
                <div key={card.title} className="rounded-xl border border-white/70 bg-white/75 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-black/35">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">{card.title}</p>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: card.color }} />
                  </div>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary dark:text-text-primary">{card.value}</p>
                  <p className="mt-1 text-xs text-text-muted dark:text-text-secondary">{card.helper}</p>
                </div>
              ))}
            </div>
          </div>
          <aside className="border-t border-primary-200/60 bg-white/40 p-5 dark:border-[#5a4635] dark:bg-black/25 xl:border-l xl:border-t-0">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-text-primary dark:text-text-primary">Project signals</h3>
              <p className="mt-1 text-xs text-text-muted dark:text-text-secondary">Manager, leader, delivery, and build context.</p>
            </div>
            <div className="grid gap-3 text-sm text-text-secondary dark:text-text-secondary">
              <ProjectOverviewLine
                label="Manager"
                value={managerValue}
                action={canAssignProject ? (
                  <Button variant="secondary" size="sm" onClick={openAssignProjectModal}>
                    <UserPlus className="h-4 w-4" />
                    Change
                  </Button>
                ) : null}
              />
              <ProjectOverviewLine
                label="Leader"
                value={leaderValue}
                action={canAssignProject ? (
                  <Button variant="secondary" size="sm" onClick={openAssignProjectModal}>
                    <UserPlus className="h-4 w-4" />
                    Change
                  </Button>
                ) : null}
              />
              <ProjectOverviewLine label="Start" value={formatProjectDate(projectRecord.start_date)} />
              <ProjectOverviewLine label="Delivery" value={formatProjectDate(projectRecord.delivery_date)} />
              <ProjectOverviewLine label="Assets" value={`${projectFiles.length} files / ${pages.length} pages`} />
              <ProjectOverviewLine label="Build" value={`${components.length} components / ${versions.length} versions`} />
            </div>
          </aside>
        </div>
      </section>

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
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All priorities</option>
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="critical">Critical</option>
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="high">High</option>
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="medium">Medium</option>
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="low">Low</option>
              </select>
              <select className={inputClassName} value={filters.assignee} onChange={(event) => setFilters((state) => ({ ...state, assignee: event.target.value }))}>
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All assignees</option>
                {assignableUsers.map((userItem) => <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={userItem.id} value={userItem.id}>{userItem.first_name} {userItem.last_name}</option>)}
              </select>
              <select className={inputClassName} value={filters.label} onChange={(event) => setFilters((state) => ({ ...state, label: event.target.value }))}>
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All labels</option>
                {availableLabels.map((label) => <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={label} value={label}>{label}</option>)}
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(statuses.length, 4)}, minmax(0, 1fr))` }}
            >
              {statuses.map((status) => (
                <ProjectBoardColumn
                  key={status.id}
                  status={status}
                  tasks={filteredBoard[status.id] || []}
                  statuses={statuses}
                  updatingTaskId={updatingTaskId}
                  canManageColumns={canCreateProjectTask}
                  onAddTask={() => { setSelectedStatus(status.id); setShowCreateModal(true) }}
                  onOpenTask={(taskId) => navigate(`/tasks/${taskId}`)}
                  onOpenProjectTask={(taskId) => navigate(`/projects/${projectId}/tasks/${taskId}`)}
                  onStatusChange={handleTaskStatusChange}
                />
              ))}
            </div>
            <DragOverlay>
              {activeTaskId ? (
                <div className="rounded-xl border border-primary-200 bg-white px-4 py-3 text-sm font-semibold text-text-primary shadow-xl dark:border-primary-800 dark:bg-gray-950 dark:text-gray-100">
                  Moving task
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
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

      <Modal isOpen={showAssignModal} onClose={() => setShowAssignModal(false)} title="Assign project">
        <form onSubmit={handleAssignProject} className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-950/50">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Project</p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{activeProject}</p>
          </div>
          <FormField label="Manager">
            <CreatableSelectField
              value={assignmentManagerId}
              onChange={setAssignmentManagerId}
              className={inputClassName}
              createLabel="Create user"
              onCreate={() => setShowQuickEmployeeModal(true)}
              canCreate={hasCompanyAdminAccess(user?.role)}
              disabled={!hasCompanyAdminAccess(user?.role)}
            >
              <option value="">No manager</option>
              {managerAssignmentOptions.map((item) => <option key={item.id || item._id} value={item.id || item._id}>{getUserDisplayName(item)} ({item.role})</option>)}
            </CreatableSelectField>
          </FormField>
          <FormField label="Leader">
            <CreatableSelectField
              value={assignmentLeaderId}
              onChange={setAssignmentLeaderId}
              className={inputClassName}
              createLabel="Create lead"
              onCreate={() => setShowQuickEmployeeModal(true)}
              canCreate={canAssignProject}
            >
              <option value="">No leader</option>
              {leaderAssignmentOptions.map((item) => <option key={item.id} value={item.id}>{getUserDisplayName(item)} ({item.role})</option>)}
            </CreatableSelectField>
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAssignModal(false)}>Cancel</Button>
            <Button type="submit" loading={assigningProject} loadingText="Saving">Save assignment</Button>
          </div>
        </form>
      </Modal>

      <QuickCreateEmployeeModal
        isOpen={showQuickEmployeeModal}
        onClose={() => setShowQuickEmployeeModal(false)}
        existing={projectAssignableUsers}
        leads={projectAssignableUsers.filter((item) => item.role === 'lead')}
        canCreateLead={canAssignProject}
        onCreated={async (created) => {
          await loadAssignableUsers()
          if (normalizeRole(created.role) === 'lead') setAssignmentLeaderId(created.id)
          setTaskAssigneeId(created.id)
        }}
      />

      <Modal isOpen={showProjectAgentModal} onClose={() => setShowProjectAgentModal(false)} title="Project Agent" size="xl">
        <form onSubmit={handleProjectAgentRun} className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-950/50">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Read-only pilot</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Creates an Agent run scoped to this project. No task or project records are changed.</p>
          </div>
          <FormField label="Operation">
            <select className={inputClassName} value={projectAgentOperation} onChange={(event) => setProjectAgentOperation(event.target.value)}>
              {PROJECT_AGENT_OPERATIONS.map((operation) => (
                <option key={operation.value} value={operation.value}>{operation.label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Request" required>
            <textarea
              rows={4}
              className={inputClassName}
              value={projectAgentRequest}
              onChange={(event) => setProjectAgentRequest(event.target.value)}
              placeholder="Summarize risks, dependencies, and next steps for this project."
            />
          </FormField>
          {projectAgentRun ? (
            <section className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex flex-wrap items-center gap-2">
                <Badge label={projectAgentRun.state || 'queued'} colorKey={projectAgentRun.state || 'scheduled'} />
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{projectAgentRun.run_id}</span>
              </div>
              {projectAgentRun.error_category ? (
                <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">{projectAgentRun.error_category}</p>
              ) : null}
              {projectAgentRun.sanitized_result?.summary ? (
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{projectAgentRun.sanitized_result.summary}</p>
              ) : null}
              {projectAgentRun.sanitized_result?.department_specialist ? (
                <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
                  <div className="font-semibold">Selected specialist</div>
                  <div className="mt-1">
                    {projectAgentRun.sanitized_result.department_specialist.pack_id} / {projectAgentRun.sanitized_result.department_specialist.specialist_id} v{projectAgentRun.sanitized_result.department_specialist.specialist_version}
                  </div>
                  <div className="mt-1 text-indigo-700 dark:text-indigo-300">
                    {projectAgentRun.sanitized_result.department_specialist.selection_reason}
                  </div>
                  {projectAgentRun.sanitized_result.department_specialist.fallback_reason ? (
                    <div className="mt-1 text-amber-700 dark:text-amber-300">
                      Fallback: {projectAgentRun.sanitized_result.department_specialist.fallback_reason}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {projectAgentRun.sanitized_result?.department_specialist_output ? (
                <div className="mt-3 grid gap-3 text-xs text-gray-600 dark:text-gray-400">
                  <div>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">Guidance: </span>
                    {(projectAgentRun.sanitized_result.department_specialist_output.task_guidance || []).join(', ') || projectAgentRun.sanitized_result.department_specialist_output.summary}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">Checklist: </span>
                    {(projectAgentRun.sanitized_result.department_specialist_output.checklist || []).join(', ') || 'No checklist returned'}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">Proposal status: </span>
                    {projectAgentRun.sanitized_result.department_specialist_output.proposal_only ? 'Proposal only' : 'Read only'}
                  </div>
                </div>
              ) : null}
              {projectAgentRun.sanitized_result?.warnings?.length ? (
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {projectAgentRun.sanitized_result.warnings.join(', ')}
                </div>
              ) : null}
            </section>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowProjectAgentModal(false)}>Close</Button>
            <Button type="submit" loading={projectAgentSubmitting} loadingText="Starting">
              Start run
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={canCreateProjectTask && showCreateModal} onClose={() => setShowCreateModal(false)} title="Create task">
        <form onSubmit={handleCreateTask} className="space-y-4">
          <FormField label="Title" required>
            <input name="title" required className={inputClassName} />
          </FormField>
          <FormField label="Description">
            <textarea name="description" rows={3} className={inputClassName} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Priority">
              <select
                name="priority"
                value={createTaskPriority}
                onChange={(event) => setCreateTaskPriority(event.target.value)}
                className={`${inputClassName} font-semibold ${TASK_PRIORITY_SELECT_STYLES[createTaskPriority] || TASK_PRIORITY_SELECT_STYLES.medium}`}
              >
                {TASK_PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority.value} value={priority.value} className={priority.className}>
                    {priority.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Due date" required>
              <input type="datetime-local" name="due_date" required className={inputClassName} />
            </FormField>
            <FormField label="Estimated hours" required>
              <input
                type="number"
                name="estimated_hours"
                min="0.25"
                max="24"
                step="0.25"
                required
                className={inputClassName}
                placeholder="8"
                onInput={(event) => {
                  if (Number(event.currentTarget.value) > 24) event.currentTarget.value = '24'
                }}
              />
            </FormField>
          </div>
          <FormField label="Assign to">
            <CreatableSelectField
              name="assigned_to"
              value={taskAssigneeId}
              onChange={setTaskAssigneeId}
              className={inputClassName}
              createLabel="Create user"
              onCreate={() => setShowQuickEmployeeModal(true)}
              canCreate={canManageColumns}
            >
              <option value="">Unassigned</option>
              {assignableUsers.map((item) => <option key={item.id} value={item.id}>{item.first_name} {item.last_name}</option>)}
            </CreatableSelectField>
          </FormField>
          <div className="rounded-xl border border-gray-200 p-3 dark:border-[var(--color-app-border)]">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={createMode === 'now' ? 'primary' : 'secondary'} onClick={() => setCreateMode('now')}>Create now</Button>
              <Button type="button" variant={createMode === 'schedule' ? 'primary' : 'secondary'} onClick={() => setCreateMode('schedule')}>Schedule</Button>
            </div>
            {createMode === 'schedule' && (
              <FormField label="Schedule for" required>
                <input type="datetime-local" value={scheduleRunAt} onChange={(event) => setScheduleRunAt(event.target.value)} required={createMode === 'schedule'} className={inputClassName} />
              </FormField>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button type="submit" loading={submitting}>{createMode === 'schedule' ? 'Schedule task' : 'Create task'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function ProjectBoardColumn({ status, tasks, statuses, updatingTaskId, canManageColumns, onAddTask, onOpenTask, onOpenProjectTask, onStatusChange }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })
  const statusColor = STATUS_COLORS[status.id] || '#4285F4'

  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-[420px] flex-col overflow-hidden rounded-2xl border bg-[linear-gradient(180deg,rgba(255,250,244,0.96),rgba(255,255,255,0.86))] shadow-[0_14px_34px_rgba(63,49,37,0.06)] transition-colors duration-150 dark:bg-[linear-gradient(180deg,rgba(36,28,20,0.96),rgba(16,13,10,0.92))] dark:shadow-[0_18px_42px_rgba(0,0,0,0.22)] ${isOver ? 'border-primary-400 ring-2 ring-primary-200/80 dark:border-primary-500 dark:ring-primary-900/70' : 'border-primary-200/50 dark:border-[#4a3b2e]'}`}
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: statusColor }} />
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{status.label || status.id}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{tasks.length} tasks</p>
          </div>
          <Badge label={status.label || status.id} colorKey={status.id} />
        </div>
        <SortableContext id={status.id} items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          <div className={`min-h-[260px] flex-1 space-y-3 overflow-y-auto rounded-xl transition-colors ${isOver ? 'bg-primary-50/60 p-2 dark:bg-primary-950/20' : ''}`}>
            {tasks.length ? tasks.map((task) => (
              <SortableProjectTaskCard
                key={task.id}
                task={task}
                statuses={statuses}
                statusColor={statusColor}
                updatingTaskId={updatingTaskId}
                onOpenTask={onOpenTask}
                onOpenProjectTask={onOpenProjectTask}
                onStatusChange={onStatusChange}
              />
            )) : (
              <EmptyState title="No tasks in this column" description="Drop a task here or create a new one." action={canManageColumns ? <Button size="sm" onClick={onAddTask}><Plus className="h-4 w-4" /> Add task</Button> : null} />
            )}
          </div>
        </SortableContext>
      </div>
    </section>
  )
}

function SortableProjectTaskCard({ task, statuses, statusColor, updatingTaskId, onOpenTask, onOpenProjectTask, onStatusChange }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl border p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md dark:shadow-[0_12px_28px_rgba(0,0,0,0.22)] ${TASK_PRIORITY_STYLES[(task.priority || 'medium').toLowerCase()] || TASK_PRIORITY_STYLES.medium}`}
    >
      <div className="mb-3 h-1 rounded-full shadow-[0_0_14px_rgba(255,138,76,0.24)]" style={{ backgroundColor: statusColor }} />
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label={`Drag ${task.title}`}
          className="mt-0.5 cursor-grab rounded-lg p-1.5 text-text-muted transition hover:bg-white/75 hover:text-primary-600 active:cursor-grabbing dark:hover:bg-black/30"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-1 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-[#fff7ed]">{task.title}</p>
              <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-[#d8cbbb]">{task.description || 'No description.'}</p>
            </div>
            <Badge label={task.priority || 'medium'} colorKey={task.priority || 'medium'} />
          </div>
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {task.due_date ? <Badge label={timeService.format(task.due_date, { month: 'short', day: 'numeric' })} colorKey="scheduled" /> : null}
        {task.assigned_to_name ? <Badge label={task.assigned_to_name} colorKey="scheduled" /> : <Badge label="Unassigned" colorKey="scheduled" />}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <select className={`${inputClassName} text-xs`} value={task.status} disabled={Boolean(updatingTaskId)} onChange={(event) => onStatusChange(task.id, event.target.value)} aria-label={updatingTaskId === task.id ? `Moving ${task.title}` : `Move ${task.title}`} aria-busy={updatingTaskId === task.id || undefined}>
          {statuses.map((option) => <option key={option.id} value={option.id}>{option.label || option.id}</option>)}
        </select>
        <Button variant="ghost" size="sm" onClick={() => onOpenProjectTask(task.id)}>
          Open
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </article>
  )
}

function BoardMetric({ title, value }) {
  return (
    <div className="card p-4 transition-colors hover:border-primary-300 dark:hover:border-primary-700">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{title}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-text-primary dark:text-text-primary">{value}</p>
    </div>
  )
}

function ProjectOverviewLine({ label, value, action = null }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/70 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-black/35">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</span>
      <span className="ml-auto min-w-0 truncate text-right font-medium text-text-primary dark:text-text-primary">{value}</span>
      {action ? <span className="flex-none">{action}</span> : null}
    </div>
  )
}

function ProjectStatusDonut({ data, completion }) {
  const hasData = data.length > 0
  if (!hasData) {
    return (
      <div className="flex h-full min-h-40 flex-col justify-center rounded-2xl border border-dashed border-primary-200/70 bg-white/60 p-4 shadow-sm dark:border-white/10 dark:bg-black/30">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Task mix</p>
        <p className="mt-2 text-sm font-medium text-text-primary dark:text-text-primary">No tasks yet</p>
        <p className="mt-1 text-xs leading-5 text-text-secondary dark:text-text-secondary">
          Status chart will appear after the first task is created for this project.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-white/70 bg-white/65 p-3 shadow-sm dark:border-white/10 dark:bg-black/30">
      <div className="relative h-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={68} paddingAngle={3} stroke="none">
              {data.map((entry) => <Cell key={entry.id} fill={entry.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-text-primary dark:text-text-primary">{completion}%</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Done</span>
        </div>
      </div>
      <div className="mt-2 grid gap-1.5">
        {data.slice(0, 4).map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex min-w-0 items-center gap-2 text-text-secondary dark:text-text-secondary">
              <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: item.color }} />
              <span className="truncate capitalize">{item.name}</span>
            </span>
            <span className="font-semibold tabular-nums text-text-primary dark:text-text-primary">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
