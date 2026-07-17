import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Plus, Calendar, User, MoreVertical, Search, Filter, CheckCircle2, ListTodo, RefreshCcw } from 'lucide-react'
import { tasksAPI } from '../api/tasks'
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

  // Fetch tasks
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
      
      // Apply search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        filteredTasks = filteredTasks.filter(task =>
          task.title?.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query)
        )
      }

      const dueFrom = filters.due_from ? new Date(filters.due_from) : null
      const dueTo = filters.due_to ? new Date(filters.due_to) : null
      if (dueFrom || dueTo) {
        filteredTasks = filteredTasks.filter((task) => {
          if (!task.due_date) return false
          const dueDate = new Date(task.due_date)
          if (Number.isNaN(dueDate.getTime())) return false
          if (dueFrom) {
            const fromStart = new Date(dueFrom)
            fromStart.setHours(0, 0, 0, 0)
            if (dueDate < fromStart) return false
          }
          if (dueTo) {
            const toEnd = new Date(dueTo)
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

  // Check if we need to open a task from notification
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
    // Debounce search
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

  // Get tasks by status
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

  const taskGraphRows = useMemo(() => buildTaskGraphRows(tasks), [tasks])
  const taskGraphSummary = useMemo(() => buildTaskGraphSummary(tasks), [tasks])

  const closeCreateModal = () => {
    if (submitting) return
    setShowCreateModal(false)
    setSelectedDepartmentId('')
    setSelectedAssigneeId('')
    setDueDateValue('')
    setEstimatedHoursValue('')
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

  // Handle create task
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
          const dueDate = new Date(createdTaskDueDate)
          if (Number.isNaN(dueDate.getTime())) return false
          if (filters.due_from) {
            const fromDate = new Date(filters.due_from)
            fromDate.setHours(0, 0, 0, 0)
            if (dueDate < fromDate) return false
          }
          if (filters.due_to) {
            const toDate = new Date(filters.due_to)
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

  // Handle task click
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
    <div className="p-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-[var(--color-app-text)]">Tasks</h1>
          <p className="text-gray-600 text-xs mt-0.5 dark:text-[var(--color-app-text-secondary)]">Track work and priorities.</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={handleViewChange} />
          <button
            type="button"
            onClick={() => fetchTasks({ isRefresh: true })}
            className="btn btn-secondary inline-flex items-center gap-2"
            aria-busy={refreshing || undefined}
          >
            <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          {canManageTasks && (
            <button
              onClick={() => {
                setSelectedDepartmentId('')
                setShowCreateModal(true)
              }}
              className="btn btn-primary flex items-center justify-center w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New Task
            </button>
          )}
        </div>
      </div>

      <TaskGraphPanel
        rows={taskGraphRows}
        summary={taskGraphSummary}
        onOpenTask={(task) => {
          handleTaskClick({ id: task.id, project_id: task.projectId })
        }}
      />

      {/* Search and Filters */}
      <div className="card">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="input pl-10 w-full"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn ${showFilters ? 'btn-primary' : 'btn-secondary'} flex items-center`}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="btn btn-secondary flex items-center"
          >
            Reset Filters
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-[var(--color-app-text-muted)]">
          <span>Showing {tasks.length} of {totalCount}</span>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={page * pageSize >= totalCount} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-surface-border pt-4 dark:border-[var(--color-app-border)] sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="input"
              >
                <option value="">All Statuses</option>
                {statuses.map((status) => (
                  <option key={status.id} value={status.id}>{status.label}</option>
                ))}
              </select>
            </div>
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">Priority</label>
              <select
                value={filters.priority}
                onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
                className="input"
              >
                <option value="">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">Assignee</label>
              <select
                value={filters.assigned_to}
                onChange={(e) => setFilters({ ...filters, assigned_to: e.target.value })}
                className="input"
                >
                  <option value="">All Users</option>
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.first_name} {u.last_name}
                    </option>
                  ))}
                </select>
              </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">Due From</label>
              <input
                type="date"
                value={filters.due_from}
                onChange={(e) => setFilters({ ...filters, due_from: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">Due To</label>
              <input
                type="date"
                value={filters.due_to}
                onChange={(e) => setFilters({ ...filters, due_to: e.target.value })}
                className="input"
              />
            </div>
            {isCompanyAdmin && (
              <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">Department</label>
                <select
                  value={filters.department_id}
                  onChange={(e) => setFilters({ ...filters, department_id: e.target.value })}
                  className="input"
                  disabled={loadingDepartments}
                >
                  <option value="">All Departments</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {view === 'list' ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-600 dark:text-[var(--color-app-text-muted)]">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-600 dark:text-[var(--color-app-text-muted)]">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-600 dark:text-[var(--color-app-text-muted)]">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-600 dark:text-[var(--color-app-text-muted)]">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-4 py-6 text-center text-sm text-gray-500 dark:text-[var(--color-app-text-muted)]">
                      No tasks match the current filters.
                    </td>
                  </tr>
                ) : (
                  tasks.map((task) => (
                    <tr
                      key={task.id}
                      onClick={() => handleTaskClick(task)}
                      className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-[var(--color-app-surface-muted)]"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-[var(--color-app-text)]">{task.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-[var(--color-app-text-secondary)]">
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium capitalize text-gray-700 dark:bg-[var(--color-app-surface-subtle)] dark:text-[var(--color-app-text-secondary)]">
                          {String(task.status || '').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-[var(--color-app-text-secondary)]">{priorities[task.priority]?.label || task.priority}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-[var(--color-app-text-secondary)]">
                        {task.due_date ? format(new Date(task.due_date), 'MMM d') : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statuses.map((status) => {
            const statusTasks = getTasksByStatus(status.id)
            return (
              <div key={status.id} className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-[var(--color-app-text)]">{status.label}</h3>
                  <span className="badge badge-secondary text-xs">
                    {statusTasks.length}
                  </span>
                </div>
                <div className="space-y-3 min-h-[200px]">
                  {statusTasks.length === 0 ? (
                    <EmptyState title="No tasks" description="Nothing is currently in this status." />
                  ) : (
                    statusTasks.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => handleTaskClick(task)}
                        className="rounded-xl border border-gray-200 bg-white p-3 cursor-pointer transition-colors hover:border-primary-300 hover:bg-gray-50 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] dark:hover:border-primary-700 dark:hover:bg-[var(--color-app-surface-muted)]"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <p className="font-medium text-gray-900 text-sm flex-1 dark:text-[var(--color-app-text)]">
                            {task.title}
                          </p>
                          <div className="dropdown relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                // Handle menu
                              }}
                              className="rounded-lg p-1 transition-colors hover:bg-gray-100 dark:hover:bg-[var(--color-app-surface-subtle)]"
                            >
                              <MoreVertical className="h-4 w-4 text-gray-500 dark:text-[var(--color-app-text-muted)]" />
                            </button>
                          </div>
                        </div>
                        
                        {task.description && (
                          <p className="text-xs text-gray-500 mb-2 line-clamp-2 dark:text-[var(--color-app-text-muted)]">
                            {task.description}
                          </p>
                        )}
                        
                        <div className="flex items-center justify-between mt-2">
                          <span className={`badge ${priorities[task.priority]?.color || 'badge-secondary'} text-xs`}>
                            {priorities[task.priority]?.label || task.priority}
                          </span>
                          {task.due_date && (
                            <div className="flex items-center text-xs text-gray-500 dark:text-[var(--color-app-text-muted)]">
                              <Calendar className="h-3 w-3 mr-1" />
                              {format(new Date(task.due_date), 'MMM d')}
                            </div>
                          )}
                        </div>
                        
                        {task.assigned_to && (
                          <div className="flex items-center mt-2 text-xs text-gray-500 dark:text-[var(--color-app-text-muted)]">
                            <User className="h-3 w-3 mr-1" />
                            {(() => {
                              const assignedUser = assignableUsers.find(u => u.id === task.assigned_to)
                              return assignedUser 
                                ? `${assignedUser.first_name} ${assignedUser.last_name}`
                                : 'Assigned'
                            })()}
                          </div>
                        )}
                        {task.department && (
                          <div className="mt-2 text-xs text-gray-500 dark:text-[var(--color-app-text-muted)]">
                            Department: {task.department}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create Task Modal */}
      {canManageTasks && showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-surface-border bg-white p-6 shadow-modal dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
              <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-[var(--color-app-text)]">New task</h2>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">
                  Title
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  className="input"
                  placeholder="Task title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">
                  Details
                </label>
                <textarea
                  name="description"
                  rows="3"
                  className="input"
                  placeholder="Task description"
                />
              </div>
              <div>
                <CreatableSelectField
                  name="assigned_to"
                  label="Assignee"
                  value={selectedAssigneeId}
                  onChange={setSelectedAssigneeId}
                  className="input"
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
                {loadingUsers && (
                  <p className="text-xs text-gray-500 mt-1 dark:text-[var(--color-app-text-muted)]">Loading users...</p>
                )}
                {!loadingUsers && visibleAssignableUsers.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1 dark:text-[var(--color-app-text-muted)]">
                    {userRole === 'admin' || userRole === 'super_admin'
                      ? 'No managers, leads, or employees available yet.'
                      : 'No assignable users available yet.'}
                  </p>
                )}
              </div>
              {isCompanyAdmin && (
                <div>
                  <CreatableSelectField
                    name="department_id"
                    label="Department"
                    value={selectedDepartmentId}
                    onChange={setSelectedDepartmentId}
                    className="input"
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
                  {loadingDepartments && (
                    <p className="text-xs text-gray-500 mt-1 dark:text-[var(--color-app-text-muted)]">Loading departments...</p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">
                  Priority
                </label>
                <select name="priority" className="input" defaultValue="medium">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">
                  Due date
                </label>
                <NaturalDateInput
                  value={dueDateValue}
                  onChange={(value) => setDueDateValue(value)}
                  onDateResolved={(date) => setDueDateValue(date ? date.toISOString() : '')}
                />
                <input type="hidden" name="due_date" value={dueDateValue} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">
                  Estimated hours
                </label>
                <input
                  type="number"
                  name="estimated_hours"
                  min="0.25"
                  step="0.25"
                  required
                  value={estimatedHoursValue}
                  onChange={(event) => setEstimatedHoursValue(event.target.value)}
                  className="input"
                  placeholder="8"
                />
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary flex-1"
                >
                  {submitting ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={submitting}
                  className="btn btn-secondary flex-1"
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
        leads={assignableUsers.filter((item) => item.role === 'lead')}
        departmentId={selectedDepartmentId}
        canCreateLead={isCompanyAdmin}
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

function TaskGraphPanel({ rows, summary, onOpenTask }) {
  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-[var(--color-app-border)]">
        <div className="flex items-center gap-1.5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-[var(--color-app-text)]">Tasks</h2>
          <span className="flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] text-gray-500 dark:border-[var(--color-app-border)] dark:text-[var(--color-app-text-muted)]">?</span>
        </div>
        <div className="hidden flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-[var(--color-app-text-muted)] sm:flex">
          {Object.entries(TASK_GRAPH_PRIORITY_COLORS).map(([priority, color]) => (
            <span key={priority} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              {priority.replace(/\b\w/g, (letter) => letter.toUpperCase())}
            </span>
          ))}
        </div>
      </div>

      <div className="grid border-b border-gray-200 dark:border-[var(--color-app-border)] sm:grid-cols-3">
        <TaskGraphStat icon={ListTodo} label="Total tasks" value={summary.total} />
        <TaskGraphStat icon={Calendar} label="Active tasks" value={summary.active} muted />
        <TaskGraphStat icon={CheckCircle2} label="Completed" value={summary.completed} muted />
      </div>

      <div className="p-3">
        {rows.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {rows.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onOpenTask(task)}
                title={`${task.title}: ${task.statusLabel}, ${task.priorityLabel} priority, ${task.progress}% progress`}
                className="rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:border-primary-300 hover:bg-gray-50 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-muted)] dark:hover:border-primary-700 dark:hover:bg-[var(--color-app-surface-subtle)]"
              >
                <div className="flex items-start gap-3">
                  <TaskProgressRing value={task.progress} color={task.priorityColor} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-5 text-gray-900 dark:text-[var(--color-app-text)]">{task.title}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-[var(--color-app-text-muted)]">{task.assignee}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-[var(--color-app-surface-subtle)] dark:text-[var(--color-app-text-muted)]">{task.statusLabel}</span>
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: task.priorityColor }}>{task.priorityLabel}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-[var(--color-app-text-muted)]">
                    <span>Status Progress</span>
                    <span>{task.progress}%</span>
                  </div>
                  {/* <TaskStatusBar value={task.progress} color={task.priorityColor} /> */}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title="No task graph data" description="Tasks will appear here when they match your filters." />
        )}
      </div>
    </section>
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

export default Tasks
