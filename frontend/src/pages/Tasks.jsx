import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Plus, Calendar, User, MoreVertical, Search, Filter, CheckCircle2, ListTodo, RefreshCcw, LayoutGrid, Clock, Zap, Target, Award, TrendingUp, Activity, BarChart3 } from 'lucide-react'
import { tasksAPI } from '../api/tasks'
import { scheduledJobsAPI } from '../api/scheduledJobs'
import { usersAPI } from '../api/users'
import { departmentsAPI } from '../api/departments'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { CreatableSelectField, EmptyState, SkeletonKanban } from '../components/ui'
import { QuickCreateDepartmentModal, QuickCreateEmployeeModal } from '../components/relatedRecords/QuickCreateModals'
import ViewToggle from '../components/layout/ViewToggle'
import NaturalDateInput from '../components/tasks/NaturalDateInput'
import { useViewStore } from '../store/viewStore'
import { canCreateTask, hasCompanyAdminAccess, normalizeRole } from '../utils/roles'
import { TASK_GRAPH_PRIORITY_COLORS, buildTaskGraphRows, buildTaskGraphSummary } from './tasksData'
import { readTaskRouteState, writeTaskRouteState } from './tasksRouteState'
import { timeService } from '@/services/timeService'

// Stat Card Component
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle }) => {
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
    </div>
  )
}

const Tasks = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const { view, setView } = useViewStore()
  const userRole = normalizeRole(user?.role)
  const canManageTasks = canCreateTask(userRole)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const routeState = useMemo(() => readTaskRouteState(searchParams), [searchParams])
  const [searchQuery, setSearchQuery] = useState(routeState.searchQuery)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    status: routeState.filters.status || '',
    priority: '',
    assigned_to: '',
    department_id: '',
    due_from: routeState.filters.due_from || '',
    due_to: routeState.filters.due_to || '',
  })
  const [assignableUsers, setAssignableUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [departments, setDepartments] = useState([])
  const [loadingDepartments, setLoadingDepartments] = useState(false)
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('')
  const [selectedAssigneeId, setSelectedAssigneeId] = useState('')
  const [showQuickEmployeeModal, setShowQuickEmployeeModal] = useState(false)
  const [showQuickDepartmentModal, setShowQuickDepartmentModal] = useState(false)
  const [dueDateValue, setDueDateValue] = useState('')
  const [estimatedHoursValue, setEstimatedHoursValue] = useState('')
  const [createMode, setCreateMode] = useState('now')
  const [scheduleRunAt, setScheduleRunAt] = useState('')
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20

  const statuses = [
    { id: 'todo', label: 'To Do', color: 'bg-gray-100' },
    { id: 'in_progress', label: 'In Progress', color: 'bg-blue-100' },
    { id: 'in_review', label: 'Review', color: 'bg-yellow-100' },
    { id: 'completed', label: 'Completed', color: 'bg-green-100' },
  ]

  const priorities = {
    low: { label: 'Low', color: 'badge-secondary' },
    medium: { label: 'Medium', color: 'badge-primary' },
    high: { label: 'High', color: 'badge-warning' },
    critical: { label: 'Critical', color: 'badge-danger' },
  }

  const isCompanyAdmin = hasCompanyAdminAccess(user?.role)

  useEffect(() => {
    setSearchQuery(routeState.searchQuery)
    setFilters((current) => ({
      ...current,
      status: routeState.filters.status || '',
      priority: routeState.filters.priority || '',
      assigned_to: routeState.filters.assigned_to || '',
      department_id: routeState.filters.department_id || '',
      due_from: routeState.filters.due_from || '',
      due_to: routeState.filters.due_to || '',
    }))
    if (routeState.view !== view) {
      setView(routeState.view)
    }
  }, [routeState.filters.assigned_to, routeState.filters.department_id, routeState.filters.due_from, routeState.filters.due_to, routeState.filters.priority, routeState.filters.status, routeState.searchQuery, routeState.view, setView, view])

  useEffect(() => {
    const nextParams = writeTaskRouteState(searchParams, { view, searchQuery, filters })
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [filters, searchParams, searchQuery, setSearchParams, view])

  useEffect(() => {
    const nextParams = writeTaskRouteState(searchParams, { view, searchQuery, filters, page })
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [filters, page, searchQuery, searchParams, setSearchParams, view])

  const loadAssignableUsers = useCallback(async () => {
    try {
      setLoadingUsers(true)
      const data = await usersAPI.getAssignableUsers()
      setAssignableUsers(data.users || [])
    } catch (error) {
      console.error('Error loading users:', error)
      toast.error('Failed to load users')
      setAssignableUsers([])
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  const loadDepartments = useCallback(async () => {
    if (!isCompanyAdmin) return
    try {
      setLoadingDepartments(true)
      const data = await departmentsAPI.listDepartments()
      setDepartments(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error loading departments:', error)
      setDepartments([])
    } finally {
      setLoadingDepartments(false)
    }
  }, [isCompanyAdmin])

  const fetchTasks = useCallback(async ({ isRefresh = false } = {}) => {
    try {
      if (!isRefresh) setLoading(true)
      setRefreshing(isRefresh)
      setLoadError('')
      const data = await tasksAPI.listTasks({
        status: filters.status,
        priority: filters.priority,
        assigned_to: filters.assigned_to,
        department_id: filters.department_id,
        skip: (page - 1) * pageSize,
        limit: pageSize,
      })
      let filteredTasks = Array.isArray(data.tasks) ? data.tasks : []
      
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        filteredTasks = filteredTasks.filter(task =>
          task.title?.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query)
        )
      }

      const dueFrom = filters.due_from ? timeService.instant(filters.due_from) : null
      const dueTo = filters.due_to ? timeService.instant(filters.due_to) : null
      if (dueFrom || dueTo) {
        filteredTasks = filteredTasks.filter((task) => {
          if (!task.due_date) return false
          const dueDate = timeService.instant(task.due_date)
          if (Number.isNaN(dueDate.getTime())) return false
          if (dueFrom) {
            const fromStart = timeService.instant(dueFrom)
            fromStart.setHours(0, 0, 0, 0)
            if (dueDate < fromStart) return false
          }
          if (dueTo) {
            const toEnd = timeService.instant(dueTo)
            toEnd.setHours(23, 59, 59, 999)
            if (dueDate > toEnd) return false
          }
          return true
        })
      }
      
      setTasks(filteredTasks)
      setTotalCount(Number(data.total || filteredTasks.length || 0))
    } catch (error) {
      console.error('Error loading tasks:', error)
      setLoadError(error.response?.data?.detail || error.message || 'Failed to load tasks')
      toast.error('Failed to load tasks')
      setTasks([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [filters, page, searchQuery])

  useEffect(() => {
    loadAssignableUsers()
  }, [loadAssignableUsers])

  useEffect(() => {
    loadDepartments()
  }, [loadDepartments])

  useEffect(() => {
    const taskId = sessionStorage.getItem('open_task_id')
    if (taskId) {
      sessionStorage.removeItem('open_task_id')
      const timer = setTimeout(() => navigate(`/tasks/${taskId}`), 500)
      return () => clearTimeout(timer)
    }
  }, [navigate])

  useEffect(() => {
    if (searchParams.get('createTask') === 'true') {
      setShowCreateModal(true)
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('createTask')
      setSearchParams(nextParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTasks()
    }, 300)
    return () => clearTimeout(timer)
  }, [fetchTasks])

  useEffect(() => {
    const handleTasksUpdated = () => {
      fetchTasks({ isRefresh: true })
    }
    window.addEventListener('syntask:tasks-updated', handleTasksUpdated)
    const interval = setInterval(handleTasksUpdated, 30000)
    return () => {
      window.removeEventListener('syntask:tasks-updated', handleTasksUpdated)
      clearInterval(interval)
    }
  }, [fetchTasks])

  const getTasksByStatus = (status) => {
    return tasks.filter(task => task.status === status)
  }

  const visibleAssignableUsers = selectedDepartmentId
    ? assignableUsers.filter((item) => item.department_id === selectedDepartmentId)
    : assignableUsers
  const uniqueAssignableUsers = useMemo(
    () => Array.from(new Map(visibleAssignableUsers.map((item) => [item.id, item])).values()),
    [visibleAssignableUsers],
  )
  const uniqueDepartments = useMemo(
    () => Array.from(new Map(departments.map((department) => [department.id, department])).values()),
    [departments],
  )

  const taskGraphUsers = useMemo(() => [user, ...assignableUsers].filter(Boolean), [assignableUsers, user])
  const taskGraphRows = useMemo(() => buildTaskGraphRows(tasks, taskGraphUsers), [taskGraphUsers, tasks])
  const taskGraphSummary = useMemo(() => buildTaskGraphSummary(tasks), [tasks])

  // Calculate stats
  const totalTasks = tasks.length
  const activeTasks = tasks.filter(t => t.status !== 'completed').length
  const completedTasks = tasks.filter(t => t.status === 'completed').length
  const criticalTasks = tasks.filter(t => t.priority === 'critical').length
  const highPriorityTasks = tasks.filter(t => t.priority === 'high' || t.priority === 'critical').length

  const closeCreateModal = () => {
    if (submitting) return
    setShowCreateModal(false)
    setSelectedDepartmentId('')
    setSelectedAssigneeId('')
    setDueDateValue('')
    setEstimatedHoursValue('')
    setCreateMode('now')
    setScheduleRunAt('')
  }

  const resetFilters = () => {
    setSearchQuery('')
    setPage(1)
    setFilters({
      status: '',
      priority: '',
      assigned_to: '',
      department_id: '',
      due_from: '',
      due_to: '',
    })
    setSearchParams(writeTaskRouteState(searchParams, { view, searchQuery: '', filters: {}, page: 1 }), { replace: true })
  }

  const handleViewChange = (nextView) => {
    setView(nextView)
    setSearchParams(writeTaskRouteState(searchParams, { view: nextView, searchQuery, filters, page }), { replace: true })
  }

  const handleCreateTask = async (e) => {
    e.preventDefault()
    if (submitting) return

    const formData = new FormData(e.target)
    
    try {
      setSubmitting(true)
      if (!dueDateValue.trim()) {
        toast.error('Due date is required')
        return
      }
      if (!estimatedHoursValue.trim()) {
        toast.error('Estimated hours is required')
        return
      }
      
      const taskData = {
        title: formData.get('title'),
        description: formData.get('description') || '',
        assigned_to: selectedAssigneeId || '',
        priority: formData.get('priority') || 'medium',
        due_date: formData.get('due_date') || dueDateValue || '',
        estimated_hours: formData.get('estimated_hours') || estimatedHoursValue || '',
      }

      if (isCompanyAdmin && selectedDepartmentId) {
        taskData.department_id = selectedDepartmentId
      }

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
          action_type: 'CREATE_TASK',
          payload: taskData,
          run_at: timeService.toUtcISOString(runAt),
        })
        toast.success('Task scheduled successfully')
        closeCreateModal()
        return
      }

      const response = await tasksAPI.createTask(taskData)
      const createdTask = response?.task || response?.data?.task || response
      const createdTaskId = createdTask?.id || createdTask?._id || null
      const createdTaskStatus = createdTask?.status || taskData.status || 'todo'
      const createdTaskPriority = createdTask?.priority || taskData.priority || 'medium'
      const createdTaskDepartmentId = createdTask?.department_id || taskData.department_id || ''
      const createdTaskAssignee = createdTask?.assigned_to || taskData.assigned_to || ''
      const createdTaskDueDate = createdTask?.due_date || taskData.due_date || ''
      const createdTaskTitle = createdTask?.title || taskData.title || ''

      const matchesCurrentFilters = () => {
        if (filters.status && createdTaskStatus !== filters.status) return false
        if (filters.priority && createdTaskPriority !== filters.priority) return false
        if (filters.assigned_to && String(createdTaskAssignee || '') !== String(filters.assigned_to)) return false
        if (filters.department_id && String(createdTaskDepartmentId || '') !== String(filters.department_id)) return false
        if (filters.due_from || filters.due_to) {
          if (!createdTaskDueDate) return false
          const dueDate = timeService.instant(createdTaskDueDate)
          if (Number.isNaN(dueDate.getTime())) return false
          if (filters.due_from) {
            const fromDate = timeService.instant(filters.due_from)
            fromDate.setHours(0, 0, 0, 0)
            if (dueDate < fromDate) return false
          }
          if (filters.due_to) {
            const toDate = timeService.instant(filters.due_to)
            toDate.setHours(23, 59, 59, 999)
            if (dueDate > toDate) return false
          }
        }
        if (searchQuery.trim()) {
          const query = searchQuery.trim().toLowerCase()
          const haystack = `${createdTaskTitle} ${createdTask?.description || ''}`.toLowerCase()
          if (!haystack.includes(query)) return false
        }
        return true
      }

      if (createdTask && matchesCurrentFilters()) {
        const normalizedTask = {
          ...taskData,
          ...createdTask,
          id: createdTaskId,
          status: createdTaskStatus,
          priority: createdTaskPriority,
          department_id: createdTaskDepartmentId || null,
          assigned_to: createdTaskAssignee || null,
          due_date: createdTaskDueDate || null,
        }
        setTasks((current) => [normalizedTask, ...current].slice(0, pageSize))
        setTotalCount((current) => current + 1)
      }
      toast.success('✅ Task created successfully!')
      setShowCreateModal(false)
      setSelectedDepartmentId('')
      setDueDateValue('')
      setEstimatedHoursValue('')
      fetchTasks({ isRefresh: true })
      e.target.reset()
    } catch (error) {
      console.error('Error creating task:', error)
      toast.error(error.response?.data?.detail || 'Failed to create task')
    } finally {
      setSubmitting(false)
    }
  }

  const handleTaskClick = (task) => {
    if (task.project_id) {
      navigate(`/projects/${task.project_id}/tasks/${task.id}`)
    } else {
      navigate(`/tasks/${task.id}`)
    }
  }

  if (loading) {
    return (
      <div className="p-4">
        <SkeletonKanban cols={4} />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-4">
        <EmptyState
          icon={AlertTriangle}
          title="Could not load tasks"
          description={loadError}
          action={(
          <button
            type="button"
            onClick={() => fetchTasks({ isRefresh: true })}
            className="btn btn-primary inline-flex items-center gap-2"
            aria-busy={refreshing || undefined}
          >
              <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Try again
            </button>
          )}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-600 via-rose-600 to-pink-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
              <ListTodo className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">Tasks</h1>
              <p className="mt-1 text-indigo-100">Track work and priorities across your team</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => fetchTasks({ isRefresh: true })}
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              aria-busy={refreshing || undefined}
            >
              <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {canManageTasks && (
              <button
                onClick={() => {
                  setSelectedDepartmentId('')
                  setShowCreateModal(true)
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <Plus className="h-4 w-4" />
                New Task
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Tasks"
          value={totalTasks}
          icon={ListTodo}
          color="indigo"
          subtitle="All tasks"
        />
        <StatCard
          label="Active"
          value={activeTasks}
          icon={Activity}
          color="emerald"
          subtitle="In progress"
        />
        <StatCard
          label="Completed"
          value={completedTasks}
          icon={CheckCircle2}
          color="blue"
          subtitle="Done"
        />
        <StatCard
          label="High Priority"
          value={highPriorityTasks}
          icon={Zap}
          color="rose"
          subtitle={`${criticalTasks} critical`}
        />
      </div>

      {/* Search and Filters */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks by title or description..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                showFilters 
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                  : 'border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              <Filter className="h-4 w-4" />
              Filters
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Reset
            </button>
            <ViewToggle view={view} onChange={handleViewChange} />
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-gray-200 pt-4 dark:border-gray-700 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All Statuses</option>
                {statuses.map((status) => (
                  <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={status.id} value={status.id}>{status.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Priority</label>
              <select
                value={filters.priority}
                onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All Priorities</option>
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="low">Low</option>
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="medium">Medium</option>
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="high">High</option>
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Assignee</label>
              <select
                value={filters.assigned_to}
                onChange={(e) => setFilters({ ...filters, assigned_to: e.target.value })}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All Users</option>
                {assignableUsers.map((u) => (
                  <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={u.id} value={u.id}>
                    {u.first_name} {u.last_name}
                  </option>
                ))}
              </select>
            </div>
            {isCompanyAdmin && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Department</label>
                <select
                  value={filters.department_id}
                  onChange={(e) => setFilters({ ...filters, department_id: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  disabled={loadingDepartments}
                >
                  <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All Departments</option>
                  {departments.map((department) => (
                    <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Due From</label>
              <input
                type="date"
                value={filters.due_from}
                onChange={(e) => setFilters({ ...filters, due_from: e.target.value })}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Due To</label>
              <input
                type="date"
                value={filters.due_to}
                onChange={(e) => setFilters({ ...filters, due_to: e.target.value })}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
        )}
        
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Showing {tasks.length} of {totalCount}</span>
          <div className="flex items-center gap-2">
            <button 
              type="button" 
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700" 
              disabled={page <= 1} 
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </button>
            <button 
              type="button" 
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700" 
              disabled={page * pageSize >= totalCount} 
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Task Graph Panel */}
      <TaskGraphPanel
        rows={taskGraphRows}
        summary={taskGraphSummary}
        onOpenTask={(task) => {
          handleTaskClick({ id: task.id, project_id: task.projectId })
        }}
      />

      {/* Tasks View - List or Kanban */}
      {view === 'list' ? (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Due Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Assignee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      No tasks match the current filters.
                    </td>
                  </tr>
                ) : (
                  tasks.map((task) => {
                    const priorityColors = {
                      low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                      medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                      high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
                      critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
                    }
                    const statusColors = {
                      todo: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
                      in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                      in_review: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
                      completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                    }
                    const assignedUser = assignableUsers.find(u => u.id === task.assigned_to)
                    return (
                      <tr
                        key={task.id}
                        onClick={() => handleTaskClick(task)}
                        className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{task.title}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[task.status] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                            {String(task.status || '').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityColors[task.priority] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                            {priorities[task.priority]?.label || task.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {task.due_date ? format(new Date(task.due_date), 'MMM d, yyyy') : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {assignedUser ? `${assignedUser.first_name} ${assignedUser.last_name}` : 'Unassigned'}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {statuses.map((status) => {
            const statusTasks = getTasksByStatus(status.id)
            return (
              <div key={status.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="border-b border-gray-200 p-4 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 dark:text-white">{status.label}</h3>
                    <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-indigo-100 px-2 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                      {statusTasks.length}
                    </span>
                  </div>
                </div>
                <div className="p-3 space-y-3 min-h-[200px]">
                  {statusTasks.length === 0 ? (
                    <div className="flex min-h-[150px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 p-4 text-center dark:border-gray-700">
                      <ListTodo className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No tasks</p>
                    </div>
                  ) : (
                    statusTasks.map((task) => {
                      const priorityColors = {
                        low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                        medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                        high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
                        critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
                      }
                      const assignedUser = assignableUsers.find(u => u.id === task.assigned_to)
                      return (
                        <div
                          key={task.id}
                          onClick={() => handleTaskClick(task)}
                          className="cursor-pointer rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-indigo-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-indigo-700"
                        >
                          <p className="font-medium text-gray-900 text-sm dark:text-white">{task.title}</p>
                          {task.description && (
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{task.description}</p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${priorityColors[task.priority] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                              {priorities[task.priority]?.label || task.priority}
                            </span>
                            {task.due_date && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                <Calendar className="inline h-3 w-3 mr-1" />
                                {format(new Date(task.due_date), 'MMM d')}
                              </span>
                            )}
                            {assignedUser && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                <User className="inline h-3 w-3 mr-1" />
                                {assignedUser.first_name}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create Task Modal */}
      {canManageTasks && showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">New Task</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Create a new task for your team</p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
                <input
                  type="text"
                  name="title"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  placeholder="Task title"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                <textarea
                  name="description"
                  rows="3"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  placeholder="Task description"
                />
              </div>
              <div>
                <CreatableSelectField
                  name="assigned_to"
                  label="Assignee"
                  value={selectedAssigneeId}
                  onChange={setSelectedAssigneeId}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  disabled={loadingUsers}
                  createLabel="Create user"
                  onCreate={() => setShowQuickEmployeeModal(true)}
                  canCreate={canManageTasks}
                >
                  <option value="">Unassigned</option>
                  {uniqueAssignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.first_name} {u.last_name} ({u.role || 'user'})
                    </option>
                  ))}
                </CreatableSelectField>
              </div>
              {isCompanyAdmin && (
                <div>
                  <CreatableSelectField
                    name="department_id"
                    label="Department"
                    value={selectedDepartmentId}
                    onChange={setSelectedDepartmentId}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    disabled={loadingDepartments}
                    createLabel="Create department"
                    onCreate={() => setShowQuickDepartmentModal(true)}
                    canCreate={isCompanyAdmin}
                  >
                    <option value="">No department</option>
                    {uniqueDepartments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </CreatableSelectField>
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Priority</label>
                <select name="priority" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white" defaultValue="medium">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Due Date</label>
                <NaturalDateInput
                  value={dueDateValue}
                  onChange={(value) => setDueDateValue(value)}
                  onDateResolved={(date) => setDueDateValue(date ? timeService.toUtcISOString(date) : '')}
                />
                <input type="hidden" name="due_date" value={dueDateValue} required />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Estimated Hours</label>
                <input
                  type="number"
                  name="estimated_hours"
                  min="0.25"
                  step="0.25"
                  required
                  value={estimatedHoursValue}
                  onChange={(event) => setEstimatedHoursValue(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  placeholder="8"
                />
              </div>
              <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setCreateMode('now')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${createMode === 'now' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>Create now</button>
                  <button type="button" onClick={() => setCreateMode('schedule')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${createMode === 'schedule' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>Schedule</button>
                </div>
                {createMode === 'schedule' && (
                  <div className="mt-3">
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Schedule for</label>
                    <input type="datetime-local" value={scheduleRunAt} onChange={(event) => setScheduleRunAt(event.target.value)} required={createMode === 'schedule'} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                  </div>
                )}
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? (createMode === 'schedule' ? 'Scheduling...' : 'Creating...') : (createMode === 'schedule' ? 'Schedule Task' : 'Create Task')}
                </button>
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={submitting}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <QuickCreateEmployeeModal
        isOpen={showQuickEmployeeModal}
        onClose={() => setShowQuickEmployeeModal(false)}
        existing={assignableUsers}
        departments={uniqueDepartments}
        leads={[]}
        departmentId={selectedDepartmentId}
        canCreateLead={false}
        onCreated={async (created) => {
          await loadAssignableUsers()
          setSelectedAssigneeId(created.id)
        }}
      />

      <QuickCreateDepartmentModal
        isOpen={showQuickDepartmentModal}
        onClose={() => setShowQuickDepartmentModal(false)}
        existing={departments}
        onCreated={async (created) => {
          await loadDepartments()
          setSelectedDepartmentId(created.id || created._id)
        }}
      />
    </div>
  )
}

// Enhanced Task Graph Panel
function TaskGraphPanel({ rows, summary, onOpenTask }) {
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
              <h2 className="font-bold text-gray-900 dark:text-white">Task Overview</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{summary.total} tasks • {summary.active} active</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {Object.entries(TASK_GRAPH_PRIORITY_COLORS).map(([priority, color]) => (
              <span key={priority} className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-gray-600 dark:text-gray-400 capitalize">{priority}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid border-b border-gray-200 dark:border-gray-700 sm:grid-cols-3">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="rounded-lg bg-indigo-50 p-2 dark:bg-indigo-900/30">
            <ListTodo className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{summary.total}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Total Tasks</p>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-gray-200 bg-gray-50/50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/30 sm:border-l sm:border-t-0">
          <div className="rounded-lg bg-amber-50 p-2 dark:bg-amber-900/30">
            <Activity className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums text-gray-600 dark:text-gray-300">{summary.active}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Active Tasks</p>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-gray-200 bg-gray-50/50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/30 sm:border-l sm:border-t-0">
          <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-900/30">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums text-gray-600 dark:text-gray-300">{summary.completed}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Completed</p>
          </div>
        </div>
      </div>

      {/* Task Cards Grid */}
      <div className="p-4">
        {rows.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {rows.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onOpen={() => onOpenTask(task)}
              />
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <ListTodo className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No task graph data</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Tasks will appear here when they match your filters.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Enhanced Task Card
function TaskCard({ task, onOpen }) {
  const progress = task.progress || 0
  const priorityColors = {
    low: 'from-emerald-400 to-emerald-500',
    medium: 'from-amber-400 to-amber-500',
    high: 'from-orange-400 to-orange-500',
    critical: 'from-rose-400 to-rose-500',
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-indigo-700"
    >
      <div className="flex items-start gap-3">
        <div 
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white font-bold text-sm shadow-lg"
          style={{ background: `linear-gradient(135deg, ${TASK_GRAPH_PRIORITY_COLORS[task.priority] || '#6366f1'}, ${TASK_GRAPH_PRIORITY_COLORS[task.priority] || '#8b5cf6'})` }}
        >
          {task.title?.charAt(0)?.toUpperCase() || 'T'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            {task.title}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{task.assignee || 'Unassigned'}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              {task.statusLabel}
            </span>
            <span 
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: TASK_GRAPH_PRIORITY_COLORS[task.priority] || '#6366f1' }}
            >
              {task.priorityLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Progress</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div 
            className="h-full rounded-full bg-gradient-to-r transition-all duration-500"
            style={{ 
              background: `linear-gradient(to right, ${TASK_GRAPH_PRIORITY_COLORS[task.priority] || '#6366f1'}, ${TASK_GRAPH_PRIORITY_COLORS[task.priority] || '#8b5cf6'})`,
              width: `${Math.min(progress, 100)}%` 
            }}
          />
        </div>
      </div>

      {/* Due Date */}
      {task.dueDate && (
        <div className="mt-2 flex items-center text-xs text-gray-500 dark:text-gray-400">
          <Calendar className="h-3 w-3 mr-1" />
          {format(new Date(task.dueDate), 'MMM d, yyyy')}
        </div>
      )}
    </button>
  )
}

function TaskGraphStat({ icon: Icon, label, value, muted = false }) {
  return (
    <div className={`flex items-center gap-2 px-4 py-3 ${muted ? 'border-t border-gray-200 bg-gray-50 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-muted)] sm:border-l sm:border-t-0' : ''}`}>
      <Icon className={`h-5 w-5 ${muted ? 'text-gray-500 dark:text-[var(--color-app-text-muted)]' : 'text-gray-900 dark:text-[var(--color-app-text)]'}`} />
      <div>
        <p className={`text-lg font-semibold tabular-nums ${muted ? 'text-gray-600 dark:text-[var(--color-app-text-secondary)]' : 'text-gray-900 dark:text-[var(--color-app-text)]'}`}>{value}</p>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-[var(--color-app-text-muted)]">{label}</p>
      </div>
    </div>
  )
}

function TaskProgressRing({ value, color }) {
  const bounded = Math.max(0, Math.min(100, value || 0))
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full [--task-ring-rest:#eeeeee] dark:[--task-ring-rest:#44382c]" style={{ background: `conic-gradient(${color} ${bounded * 3.6}deg, var(--task-ring-rest) 0deg)` }}>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xs font-semibold text-gray-900 dark:bg-[var(--color-app-surface)] dark:text-[var(--color-app-text)]">
        {bounded}%
      </div>
    </div>
  )
}

// Missing X import
import { X } from 'lucide-react'

export default Tasks
