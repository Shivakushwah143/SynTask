import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Calendar, User, MoreVertical, Search, Filter } from 'lucide-react'
import { tasksAPI } from '../api/tasks'
import { usersAPI } from '../api/users'
import { departmentsAPI } from '../api/departments'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { EmptyState, SkeletonKanban } from '../components/ui'
import ViewToggle from '../components/layout/ViewToggle'
import NaturalDateInput from '../components/tasks/NaturalDateInput'
import { useViewStore } from '../store/viewStore'
import { ROLE, hasCompanyAdminAccess, normalizeRole } from '../utils/roles'

const Tasks = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const { view } = useViewStore()
  const userRole = normalizeRole(user?.role)
  const canManageTasks = [ROLE.ADMIN, ROLE.SUPER_ADMIN, ROLE.LEAD].includes(userRole)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    priority: '',
    assigned_to: '',
    department_id: '',
  })
  const [assignableUsers, setAssignableUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [departments, setDepartments] = useState([])
  const [loadingDepartments, setLoadingDepartments] = useState(false)
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('')
  const [dueDateValue, setDueDateValue] = useState('')

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

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true)
      const data = await tasksAPI.listTasks(filters)
      let filteredTasks = data.tasks || []
      
      // Apply search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        filteredTasks = filteredTasks.filter(task =>
          task.title?.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query)
        )
      }
      
      setTasks(filteredTasks)
    } catch (error) {
      console.error('Error loading tasks:', error)
      toast.error('Failed to load tasks')
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [filters, searchQuery])

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

  // Get tasks by status
  const getTasksByStatus = (status) => {
    return tasks.filter(task => task.status === status)
  }

  const visibleAssignableUsers = selectedDepartmentId
    ? assignableUsers.filter((item) => item.department_id === selectedDepartmentId)
    : assignableUsers

  const closeCreateModal = () => {
    if (submitting) return
    setShowCreateModal(false)
    setSelectedDepartmentId('')
    setDueDateValue('')
  }

  // Handle create task
  const handleCreateTask = async (e) => {
    e.preventDefault()
    if (submitting) return

    const formData = new FormData(e.target)
    
    try {
      setSubmitting(true)
      
      const taskData = {
        title: formData.get('title'),
        description: formData.get('description') || '',
        assigned_to: formData.get('assigned_to') || '',
        priority: formData.get('priority') || 'medium',
        due_date: formData.get('due_date') || dueDateValue || '',
      }

      if (isCompanyAdmin && selectedDepartmentId) {
        taskData.department_id = selectedDepartmentId
      }

      await tasksAPI.createTask(taskData)
      toast.success('✅ Task created successfully!')
      setShowCreateModal(false)
      setSelectedDepartmentId('')
      setDueDateValue('')
      await fetchTasks()
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

  return (
    <div className="p-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Tasks</h1>
          <p className="text-gray-600 text-xs mt-0.5">Track work and priorities.</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle />
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
        </div>

        {showFilters && (
          <div className="mt-4 grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Assignee</label>
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
            {isCompanyAdmin && (
              <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
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
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-4 py-6 text-center text-sm text-gray-500">
                      No tasks yet.
                    </td>
                  </tr>
                ) : (
                  tasks.map((task) => (
                    <tr
                      key={task.id}
                      onClick={() => handleTaskClick(task)}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{task.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{task.status}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{priorities[task.priority]?.label || task.priority}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
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
                  <h3 className="font-semibold text-gray-900">{status.label}</h3>
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
                        className="p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <p className="font-medium text-gray-900 text-sm flex-1">
                            {task.title}
                          </p>
                          <div className="dropdown relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                // Handle menu
                              }}
                              className="p-1 hover:bg-gray-100 rounded"
                            >
                              <MoreVertical className="h-4 w-4 text-gray-500" />
                            </button>
                          </div>
                        </div>
                        
                        {task.description && (
                          <p className="text-xs text-gray-500 mb-2 line-clamp-2">
                            {task.description}
                          </p>
                        )}
                        
                        <div className="flex items-center justify-between mt-2">
                          <span className={`badge ${priorities[task.priority]?.color || 'badge-secondary'} text-xs`}>
                            {priorities[task.priority]?.label || task.priority}
                          </span>
                          {task.due_date && (
                            <div className="flex items-center text-xs text-gray-500">
                              <Calendar className="h-3 w-3 mr-1" />
                              {format(new Date(task.due_date), 'MMM d')}
                            </div>
                          )}
                        </div>
                        
                        {task.assigned_to && (
                          <div className="flex items-center mt-2 text-xs text-gray-500">
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
                          <div className="mt-2 text-xs text-gray-500">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-screen overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">New task</h2>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assignee
                </label>
                <select
                  name="assigned_to"
                  className="input"
                  disabled={loadingUsers}
                >
                  <option value="">Unassigned</option>
                  {visibleAssignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.first_name} {u.last_name} ({u.role === 'lead' ? 'Lead' : 'Employee'})
                    </option>
                  ))}
                </select>
                {loadingUsers && (
                  <p className="text-xs text-gray-500 mt-1">Loading users...</p>
                )}
                {!loadingUsers && visibleAssignableUsers.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {userRole === ROLE.ADMIN 
                      ? 'No leads or employees available yet.'
                      : 'No employees available yet.'}
                  </p>
                )}
              </div>
              {isCompanyAdmin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Department
                  </label>
                  <select
                    name="department_id"
                    value={selectedDepartmentId}
                    onChange={(event) => setSelectedDepartmentId(event.target.value)}
                    className="input"
                    disabled={loadingDepartments}
                  >
                    <option value="">No department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                  {loadingDepartments && (
                    <p className="text-xs text-gray-500 mt-1">Loading departments...</p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Due date
                </label>
                <NaturalDateInput
                  value={dueDateValue}
                  onChange={(value) => setDueDateValue(value)}
                  onDateResolved={(date) => setDueDateValue(date ? date.toISOString() : '')}
                />
                <input type="hidden" name="due_date" value={dueDateValue} />
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

    </div>
  )
}

export default Tasks
