import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Search, Filter, User,
  X, Edit, Trash2, CheckSquare, Info, Tag,
  ChevronDown, ChevronUp, Settings
} from 'lucide-react'
import { projectsApi } from '../api/projects'
import { tasksAPI } from '../api/tasks'
import { usersAPI } from '../api/users'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import PageEditor from '../components/PageEditor'
import { EmptyState, SkeletonCard, SkeletonKanban } from '../components/ui'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { hasCompanyAdminAccess, isLeadRole, getRoleLabel } from '../utils/roles'

const MobileTaskList = ({ statuses, filteredTasks, priorities, onTaskClick, onStatusChange, onCreateTask }) => (
  <div className="space-y-4 md:hidden">
    {statuses.map((status) => {
      const tasks = filteredTasks(status.id)
      return (
        <section key={status.id} className="card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">{status.label}</h3>
            <span className="badge badge-secondary">{tasks.length}</span>
          </div>
          {tasks.length === 0 ? (
            <EmptyState
              title="No tasks"
              description="Nothing is currently in this status."
              action={<button type="button" onClick={() => onCreateTask(status.id)} className="btn btn-secondary">Create task</button>}
            />
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <article key={task.id} className="rounded-lg border border-surface-border bg-white p-3">
                  <button type="button" onClick={() => onTaskClick(task)} className="block w-full text-left">
                    <h4 className="text-sm font-medium text-text-primary">{task.title}</h4>
                    {task.description && <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{task.description}</p>}
                  </button>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className={`rounded px-2 py-1 text-xs font-medium ${priorities[task.priority]?.color || priorities.medium.color}`}>
                      {priorities[task.priority]?.label || task.priority}
                    </span>
                    <select
                      className="input max-w-36 py-1 text-xs"
                      value={task.status}
                      onChange={(event) => onStatusChange(task.id, event.target.value)}
                      aria-label={`Move ${task.title} to status`}
                    >
                      {statuses.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )
    })}
  </div>
)

const ProjectBoard = () => {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canManageColumns = hasCompanyAdminAccess(user?.role) || isLeadRole(user?.role)
  const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1').replace(/\/api\/v1$/, '')
  const isMobile = useMediaQuery('(max-width: 767px)')
  const [boardData, setBoardData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState('todo')
  const [submitting, setSubmitting] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [assignableUsers, setAssignableUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [activeTab, setActiveTab] = useState('summary')
  const [summaryData, setSummaryData] = useState(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [pages, setPages] = useState([])
  const [loadingPages, setLoadingPages] = useState(false)
  const [projectFiles, setProjectFiles] = useState([])
  const [loadingProjectFiles, setLoadingProjectFiles] = useState(false)
  const [selectedPage, setSelectedPage] = useState(null)
  const [showPageEditor, setShowPageEditor] = useState(false)
  const [editingPage, setEditingPage] = useState(null)
  const [projectInfo, setProjectInfo] = useState(null)
  const [showFilterSidebar, setShowFilterSidebar] = useState(false)
  const [activeFilterCategory, setActiveFilterCategory] = useState(null)
  const [filters, setFilters] = useState({
    status: [],
    assignee: [],
    priority: [],
    labels: [],
  })
  const [filterSearchQuery, setFilterSearchQuery] = useState('')
  const [availableLabels, setAvailableLabels] = useState([])

  // Dynamic columns will come from boardData
  const [statuses, setStatuses] = useState([
    { id: 'todo', label: 'TO DO', color: 'bg-gray-100', order: 0 },
    { id: 'in_progress', label: 'IN PROGRESS', color: 'bg-blue-100', order: 1 },
    { id: 'in_review', label: 'IN REVIEW', color: 'bg-yellow-100', order: 2 },
    { id: 'completed', label: 'COMPLETED', color: 'bg-green-100', order: 3 },
  ])

  // Column management states
  const [showColumnModal, setShowColumnModal] = useState(false)
  const [editingColumn, setEditingColumn] = useState(null)
  const [columnForm, setColumnForm] = useState({ label: '', color: 'bg-gray-100' })

  const priorities = {
    low: { label: 'Low', color: 'text-gray-600 bg-gray-100' },
    medium: { label: 'Medium', color: 'text-blue-600 bg-blue-100' },
    high: { label: 'High', color: 'text-orange-600 bg-orange-100' },
    critical: { label: 'Critical', color: 'text-red-600 bg-red-100' },
  }

  useEffect(() => {
    loadProjectInfo()
    if (activeTab === 'board') {
      loadBoardData()
    } else if (activeTab === 'summary') {
      loadSummaryData()
    } else if (activeTab === 'pages') {
      loadPages()
      loadProjectFiles()
    }
    if (activeTab !== 'pages') {
      loadAssignableUsers()
    }
  }, [projectId, refreshKey, activeTab])

  // Keyboard shortcut for filter sidebar (Shift + F)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.shiftKey && e.key === 'F' && activeTab === 'board') {
        e.preventDefault()
        setShowFilterSidebar(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab])

  const loadProjectInfo = async () => {
    try {
      const response = await projectsApi.getProject(projectId)
      setProjectInfo(response.data)
    } catch (error) {
      console.error('Error loading project info:', error)
    }
  }

  const loadPages = async () => {
    try {
      setLoadingPages(true)
      const response = await projectsApi.getPages(projectId)
      setPages(response.data.pages || [])
    } catch (error) {
      console.error('Error loading pages:', error)
      toast.error(error.response?.data?.detail || 'Failed to load pages')
      if (error.response?.status === 403) {
        navigate('/projects')
      }
    } finally {
      setLoadingPages(false)
    }
  }

  const loadProjectFiles = async () => {
    try {
      setLoadingProjectFiles(true)
      const response = await projectsApi.getProjectFiles(projectId)
      setProjectFiles(response.data.files || [])
    } catch (error) {
      console.error('Error loading project files:', error)
      toast.error(error.response?.data?.detail || 'Failed to load project files')
      if (error.response?.status === 403) {
        navigate('/projects')
      }
    } finally {
      setLoadingProjectFiles(false)
    }
  }

  const handleUploadProjectFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await projectsApi.uploadProjectFile(projectId, file)
      toast.success('File uploaded successfully')
      await loadProjectFiles()
    } catch (error) {
      console.error('Error uploading project file:', error)
      toast.error(error.response?.data?.detail || 'Failed to upload file')
    } finally {
      e.target.value = ''
    }
  }

  const handleDeleteProjectFile = async (fileId) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return
    try {
      await projectsApi.deleteProjectFile(projectId, fileId)
      toast.success('File deleted successfully')
      await loadProjectFiles()
    } catch (error) {
      console.error('Error deleting project file:', error)
      toast.error(error.response?.data?.detail || 'Failed to delete file')
    }
  }

  const getProjectFileUrl = (fileUrl) => {
    if (!fileUrl) return '#'
    return fileUrl.startsWith('http') ? fileUrl : `${apiBaseUrl}${fileUrl}`
  }

  const handleDeletePage = async (pageId) => {
    try {
      await projectsApi.deletePage(projectId, pageId)
      toast.success('Page deleted successfully')
      loadPages()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete page')
    }
  }

  const loadSummaryData = async () => {
    try {
      setLoadingSummary(true)
      const response = await projectsApi.getProjectSummary(projectId, 7)
      setSummaryData(response.data)
    } catch (error) {
      console.error('Error loading summary:', error)
      toast.error(error.response?.data?.detail || 'Failed to load project summary')
      if (error.response?.status === 403) {
        navigate('/projects')
      }
    } finally {
      setLoadingSummary(false)
    }
  }

  const loadAssignableUsers = async () => {
    try {
      setLoadingUsers(true)
      // Pass projectId to filter assignable users to project's lead and their employees
      const data = await usersAPI.getAssignableUsers(false, projectId)

      // Remove duplicates based on user ID
      const uniqueUsers = []
      const seenIds = new Set()

      for (const user of (data.users || [])) {
        const userId = user.id || user._id
        if (!seenIds.has(userId)) {
          seenIds.add(userId)
          uniqueUsers.push(user)
        }
      }

      setAssignableUsers(uniqueUsers)
    } catch (error) {
      console.error('Error loading assignable users:', error)
      setAssignableUsers([])
    } finally {
      setLoadingUsers(false)
    }
  }

  const loadBoardData = async () => {
    try {
      setLoading(true)
      const response = await projectsApi.getProjectBoard(projectId)
      setBoardData(response.data)

      // Update statuses from board columns if available
      if (response.data.board_columns && response.data.board_columns.length > 0) {
        setStatuses(response.data.board_columns)
      }
    } catch (error) {
      console.error('Error loading board:', error)
      toast.error(error.response?.data?.detail || 'Failed to load project board')
      if (error.response?.status === 403) {
        navigate('/projects')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleTaskClick = (task) => {
    if (projectId) {
      navigate(`/projects/${projectId}/tasks/${task.id}`)
    } else if (task.project_id) {
      navigate(`/projects/${task.project_id}/tasks/${task.id}`)
    } else {
      navigate(`/tasks/${task.id}`)
    }
  }

  const handleCreateTask = async (e) => {
    e.preventDefault()
    if (submitting) return

    const formData = new FormData(e.target)
    const taskData = {
      title: formData.get('title'),
      description: formData.get('description') || null,
      priority: formData.get('priority') || 'medium',
      assigned_to: formData.get('assigned_to') || null,
      due_date: formData.get('due_date') || null,
      project_id: projectId,
    }

    try {
      setSubmitting(true)
      await tasksAPI.createTask(taskData)
      toast.success('Task created successfully')
      setShowCreateModal(false)
      e.target.reset()
      setRefreshKey(prev => prev + 1)
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create task')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await tasksAPI.updateTaskStatus(taskId, newStatus)
      toast.success('Task status updated')
      setRefreshKey(prev => prev + 1)
    } catch (error) {
      toast.error('Failed to update task status')
    }
  }

  // Extract all unique labels from tasks
  useEffect(() => {
    if (boardData?.tasks_by_status) {
      const allTasks = Object.values(boardData.tasks_by_status).flat()
      const labels = new Set()
      allTasks.forEach(task => {
        if (task.tags && Array.isArray(task.tags)) {
          task.tags.forEach(tag => labels.add(tag))
        }
      })
      setAvailableLabels(Array.from(labels).sort())
    }
  }, [boardData])

  const filteredTasks = (status) => {
    if (!boardData?.tasks_by_status) return []
    let tasks = boardData.tasks_by_status[status] || []

    // Apply search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      tasks = tasks.filter(task =>
        task.title?.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        task.id?.toLowerCase().includes(query)
      )
    }

    // Apply status filter (if status filters are selected)
    if (filters.status.length > 0 && !filters.status.includes(status)) {
      return []
    }

    // Apply assignee filter
    if (filters.assignee.length > 0) {
      tasks = tasks.filter(task =>
        task.assigned_to && filters.assignee.includes(task.assigned_to)
      )
    }

    // Apply priority filter
    if (filters.priority.length > 0) {
      tasks = tasks.filter(task =>
        task.priority && filters.priority.includes(task.priority)
      )
    }

    // Apply labels/tags filter
    if (filters.labels.length > 0) {
      tasks = tasks.filter(task => {
        if (!task.tags || !Array.isArray(task.tags)) return false
        return filters.labels.some(label => task.tags.includes(label))
      })
    }

    return tasks
  }

  const toggleFilter = (category, value) => {
    setFilters(prev => {
      const currentValues = prev[category] || []
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value]
      return {
        ...prev,
        [category]: newValues
      }
    })
  }

  const clearFilters = () => {
    setFilters({
      status: [],
      assignee: [],
      priority: [],
      labels: [],
    })
    setFilterSearchQuery('')
  }

  const getFilterCount = () => {
    return Object.values(filters).reduce((sum, arr) => sum + arr.length, 0)
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-3 sm:mb-4 text-sm sm:text-base"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Projects
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
              {activeTab === 'summary' && summaryData ? summaryData.project.name :
                activeTab === 'pages' && projectInfo ? projectInfo.name :
                  boardData?.project?.name || projectInfo?.name || 'Project'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 font-mono truncate">
              {activeTab === 'summary' && summaryData ? summaryData.project.key :
                activeTab === 'pages' && projectInfo ? projectInfo.key :
                  boardData?.project?.key || projectInfo?.key || ''}
            </p>
          </div>
          {activeTab === 'board' && (
            <button
              onClick={() => {
                setSelectedStatus('todo')
                setShowCreateModal(true)
              }}
              className="flex items-center justify-center px-3 sm:px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
              Create Task
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="mt-4 sm:mt-6 border-b border-gray-200 overflow-x-auto">
          <nav className="flex space-x-4 sm:space-x-8 min-w-max">
            <button
              onClick={() => setActiveTab('summary')}
              className={`py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap ${activeTab === 'summary'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Summary
            </button>
            <button
              onClick={() => setActiveTab('board')}
              className={`py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap ${activeTab === 'board'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Board
            </button>
            <button
              onClick={() => setActiveTab('pages')}
              className={`py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap ${activeTab === 'pages'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Pages
            </button>
          </nav>
        </div>
      </div>

      {/* Summary Tab Content */}
      {activeTab === 'summary' && (
        loadingSummary ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((item) => <SkeletonCard key={item} lines={3} />)}
          </div>
        ) : summaryData ? (
          <div className="space-y-6">
            {/* Activity Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="text-sm text-gray-600 mb-1">Completed</div>
                <div className="text-2xl font-bold text-gray-900">{summaryData.activity_metrics.completed}</div>
                <div className="text-xs text-gray-500 mt-1">Last {summaryData.activity_metrics.days} days</div>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="text-sm text-gray-600 mb-1">Updated</div>
                <div className="text-2xl font-bold text-gray-900">{summaryData.activity_metrics.updated}</div>
                <div className="text-xs text-gray-500 mt-1">Last {summaryData.activity_metrics.days} days</div>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="text-sm text-gray-600 mb-1">Created</div>
                <div className="text-2xl font-bold text-gray-900">{summaryData.activity_metrics.created}</div>
                <div className="text-xs text-gray-500 mt-1">Last {summaryData.activity_metrics.days} days</div>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="text-sm text-gray-600 mb-1">Due Soon</div>
                <div className="text-2xl font-bold text-gray-900">{summaryData.activity_metrics.due_soon}</div>
                <div className="text-xs text-gray-500 mt-1">Next {summaryData.activity_metrics.days} days</div>
              </div>
            </div>

            {/* Status Overview and Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Status Overview */}
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-semibold mb-4">Status Overview</h3>
                <div className="text-center mb-4">
                  <div className="text-3xl font-bold text-gray-900">{summaryData.status_overview.total}</div>
                  <div className="text-sm text-gray-600">Total work items</div>
                </div>
                <div className="space-y-2">
                  {Object.entries(summaryData.status_overview.breakdown).map(([status, count]) => {
                    const colors = {
                      todo: 'bg-blue-500',
                      in_progress: 'bg-orange-500',
                      in_review: 'bg-yellow-500',
                      completed: 'bg-green-500',
                      cancelled: 'bg-red-500',
                      on_hold: 'bg-gray-500',
                    }
                    return (
                      <div key={status} className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className={`w-3 h-3 rounded-full ${colors[status] || 'bg-gray-400'} mr-2`}></div>
                          <span className="text-sm text-gray-700 capitalize">{status.replace('_', ' ')}</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Priority Breakdown */}
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-semibold mb-4">Priority Breakdown</h3>
                <div className="space-y-3">
                  {Object.entries(summaryData.priority_breakdown).map(([priority, count]) => {
                    if (count === 0) return null
                    const maxCount = Math.max(...Object.values(summaryData.priority_breakdown))
                    const width = maxCount > 0 ? (count / maxCount * 100) : 0
                    const colors = {
                      critical: 'bg-red-500',
                      high: 'bg-orange-500',
                      medium: 'bg-blue-500',
                      low: 'bg-yellow-500',
                    }
                    return (
                      <div key={priority}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700 capitalize">
                            {priority}
                          </span>
                          <span className="text-sm text-gray-600">{count}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${colors[priority] || 'bg-gray-400'}`}
                            style={{ width: `${width}%` }}
                          ></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Team Workload and Types of Work */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Team Workload */}
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-semibold mb-4">Team Workload</h3>
                <div className="space-y-4">
                  {summaryData.team_workload.length > 0 ? (
                    summaryData.team_workload.map((member) => (
                      <div key={member.user_id}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900">{member.user_name}</span>
                          <span className="text-sm text-gray-600">{member.workload_percentage}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="h-2 rounded-full bg-blue-500"
                            style={{ width: `${member.workload_percentage}%` }}
                          ></div>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {member.task_count} tasks • {member.in_progress} in progress • {member.completed} completed
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">No team members assigned tasks yet</p>
                  )}
                </div>
              </div>

              {/* Types of Work */}
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-semibold mb-4">Types of Work</h3>
                <div className="space-y-3">
                  {summaryData.types_of_work.length > 0 ? (
                    summaryData.types_of_work.map((workType) => (
                      <div key={workType.type}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center">
                            <CheckSquare className="h-4 w-4 text-gray-400 mr-2" />
                            <span className="text-sm font-medium text-gray-700">{workType.type}</span>
                          </div>
                          <span className="text-sm text-gray-600">{workType.count} ({workType.percentage}%)</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="h-2 rounded-full bg-primary-500"
                            style={{ width: `${workType.percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">No work items yet</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">Failed to load summary data</p>
          </div>
        )
      )}

      {/* Board Tab Content */}
      {activeTab === 'board' && (
        loading ? (
          <SkeletonKanban cols={4} />
        ) : boardData ? (
          <>
            {/* Filters */}
            <div className="mb-4 sm:mb-6 space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search board..."
                    autoComplete="off"
                    className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  {canManageColumns && (
                    <button
                      onClick={() => {
                        setEditingColumn(null)
                        setColumnForm({ label: '', color: 'bg-gray-100' })
                        setShowColumnModal(true)
                      }}
                      className="px-3 sm:px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50 transition-colors flex items-center gap-2 text-sm whitespace-nowrap"
                    >
                      <Settings className="h-4 w-4" />
                      <span className="hidden sm:inline">Manage Columns</span>
                      <span className="sm:hidden">Columns</span>
                    </button>
                  )}
                  <button
                    onClick={() => setShowFilterSidebar(!showFilterSidebar)}
                    className={`px-3 sm:px-4 py-2 rounded-lg border-2 transition-colors flex items-center gap-2 text-sm ${getFilterCount() > 0
                      ? 'border-primary-600 bg-primary-50 text-primary-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-primary-300'
                      }`}
                  >
                    <Filter className="h-4 w-4" />
                    Filters
                    {getFilterCount() > 0 && (
                      <span className="px-2 py-0.5 bg-primary-600 text-white text-xs rounded-full">
                        {getFilterCount()}
                      </span>
                    )}
                  </button>
                </div>
              </div>
              <div className="text-xs sm:text-sm text-gray-600">
                {boardData.statistics.total_tasks} tasks • {boardData.statistics.completion_percentage}% complete
              </div>
            </div>

            {/* Filter Sidebar */}
            {showFilterSidebar && (
              <div className="fixed inset-0 z-50 flex">
                {/* Backdrop */}
                <div
                  className="flex-1 bg-black bg-opacity-30"
                  onClick={() => setShowFilterSidebar(false)}
                />

                {/* Sidebar */}
                <div className="w-80 bg-white shadow-xl overflow-y-auto">
                  <div className="p-4 border-b border-gray-200 sticky top-0 bg-white z-10">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
                      <button
                        onClick={() => setShowFilterSidebar(false)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={filterSearchQuery}
                        onChange={(e) => setFilterSearchQuery(e.target.value)}
                        placeholder="Search status..."
                        autoComplete="off"
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                      />
                    </div>
                  </div>

                  <div className="p-4 space-y-4">
                    {/* Status Filter */}
                    <div>
                      <button
                        onClick={() => setActiveFilterCategory(activeFilterCategory === 'status' ? null : 'status')}
                        className="w-full flex items-center justify-between text-left p-2 hover:bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center">
                          <CheckSquare className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="font-medium text-gray-900">Status</span>
                        </div>
                        {activeFilterCategory === 'status' ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </button>
                      {activeFilterCategory === 'status' && (
                        <div className="mt-2 space-y-2 pl-8">
                          {statuses.map((status) => (
                            <label key={status.id} className="flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={filters.status.includes(status.id)}
                                onChange={() => toggleFilter('status', status.id)}
                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              />
                              <span className="ml-2 text-sm text-gray-700">{status.label}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Assignee Filter */}
                    <div>
                      <button
                        onClick={() => setActiveFilterCategory(activeFilterCategory === 'assignee' ? null : 'assignee')}
                        className="w-full flex items-center justify-between text-left p-2 hover:bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center">
                          <User className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="font-medium text-gray-900">Assignee</span>
                        </div>
                        {activeFilterCategory === 'assignee' ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </button>
                      {activeFilterCategory === 'assignee' && (
                        <div className="mt-2 space-y-2 pl-8 max-h-64 overflow-y-auto">
                          {assignableUsers.length > 0 ? (
                            assignableUsers.map((user) => (
                              <label key={user.id} className="flex items-center cursor-pointer py-1">
                                <input
                                  type="checkbox"
                                  checked={filters.assignee.includes(user.id)}
                                  onChange={() => toggleFilter('assignee', user.id)}
                                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                />
                                <div className="ml-2 flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center">
                                    <span className="text-xs font-medium text-primary-600">
                                      {user.first_name?.[0]}{user.last_name?.[0]}
                                    </span>
                                  </div>
                                  <span className="text-sm text-gray-700">
                                    {user.first_name} {user.last_name}
                                  </span>
                                </div>
                              </label>
                            ))
                          ) : (
                            <p className="text-sm text-gray-500 pl-2">No assignees available</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Priority Filter */}
                    <div>
                      <button
                        onClick={() => setActiveFilterCategory(activeFilterCategory === 'priority' ? null : 'priority')}
                        className="w-full flex items-center justify-between text-left p-2 hover:bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center">
                          <Info className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="font-medium text-gray-900">Priority</span>
                        </div>
                        {activeFilterCategory === 'priority' ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </button>
                      {activeFilterCategory === 'priority' && (
                        <div className="mt-2 space-y-2 pl-8">
                          {Object.entries(priorities).map(([key, priority]) => (
                            <label key={key} className="flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={filters.priority.includes(key)}
                                onChange={() => toggleFilter('priority', key)}
                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              />
                              <span className={`ml-2 text-sm px-2 py-1 rounded ${priority.color}`}>
                                {priority.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Labels/Tags Filter */}
                    {availableLabels.length > 0 && (
                      <div>
                        <button
                          onClick={() => setActiveFilterCategory(activeFilterCategory === 'labels' ? null : 'labels')}
                          className="w-full flex items-center justify-between text-left p-2 hover:bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center">
                            <Tag className="h-4 w-4 text-gray-400 mr-2" />
                            <span className="font-medium text-gray-900">Labels</span>
                          </div>
                          {activeFilterCategory === 'labels' ? (
                            <ChevronUp className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          )}
                        </button>
                        {activeFilterCategory === 'labels' && (
                          <div className="mt-2 space-y-2 pl-8 max-h-64 overflow-y-auto">
                            {availableLabels.map((label) => (
                              <label key={label} className="flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={filters.labels.includes(label)}
                                  onChange={() => toggleFilter('labels', label)}
                                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="ml-2 text-sm text-gray-700">{label}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Clear Filters */}
                    {getFilterCount() > 0 && (
                      <div className="pt-4 border-t border-gray-200">
                        <button
                          onClick={clearFilters}
                          className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          Clear all filters
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="sticky bottom-0 p-4 bg-white border-t border-gray-200">
                    <p className="text-xs text-gray-500 text-center">
                      Press Shift + F to open and close
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Kanban Board */}
            {isMobile ? (
              <MobileTaskList
                statuses={statuses}
                filteredTasks={filteredTasks}
                priorities={priorities}
                onTaskClick={handleTaskClick}
                onStatusChange={handleStatusChange}
                onCreateTask={(statusId) => {
                  setSelectedStatus(statusId)
                  setShowCreateModal(true)
                }}
              />
            ) : (
            <div className="overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="grid gap-4 sm:gap-6 inline-grid" style={{ gridTemplateColumns: `repeat(${statuses.length}, minmax(280px, 1fr))` }}>
                {statuses.map((status) => {
                  const tasks = filteredTasks(status.id)
                  return (
                    <div key={status.id} className="bg-white rounded-lg shadow-sm border border-gray-200">
                      {/* Column Header */}
                      <div className={`${status.color} px-4 py-3 rounded-t-lg flex items-center justify-between group`}>
                        <div className="flex items-center gap-2 flex-1">
                          <h3 className="font-semibold text-gray-900">{status.label}</h3>
                          {canManageColumns && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingColumn(status)
                                setColumnForm({ label: status.label, color: status.color })
                                setShowColumnModal(true)
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 rounded"
                              title="Edit column"
                            >
                              <Edit className="h-3 w-3 text-gray-600" />
                            </button>
                          )}
                        </div>
                        <span className="text-sm font-medium text-gray-700">{tasks.length}</span>
                      </div>

                      {/* Tasks */}
                      <div className="p-4 space-y-3 min-h-[400px] max-h-[600px] overflow-y-auto">
                        {tasks.length === 0 ? (
                          <div className="text-center py-8 text-gray-400 text-sm">
                            <button
                              onClick={() => {
                                setSelectedStatus(status.id)
                                setShowCreateModal(true)
                              }}
                              className="text-primary-600 hover:text-primary-700 font-medium"
                            >
                              + Create
                            </button>
                          </div>
                        ) : (
                          tasks.map((task) => (
                            <div
                              key={task.id}
                              onClick={() => handleTaskClick(task)}
                              className="bg-white rounded-lg border border-gray-200 cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
                            >
                              {/* Task Image Preview */}
                              {task.attachments && task.attachments.length > 0 && (() => {
                                const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
                                const firstImage = task.attachments.find(url => {
                                  const fileName = url.split('/').pop()
                                  return /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)
                                })

                                if (firstImage) {
                                  let imageUrl = firstImage
                                  // Convert relative URL to full URL if needed
                                  if (!imageUrl.startsWith('http')) {
                                    if (imageUrl.startsWith('/api/v1/files/')) {
                                      const BASE_URL = API_URL.replace('/api/v1', '') || 'http://localhost:8000'
                                      imageUrl = `${BASE_URL}${imageUrl}`
                                    } else if (imageUrl.startsWith('/files/')) {
                                      imageUrl = `${API_URL}${imageUrl}`
                                    } else {
                                      const filename = imageUrl.split('/').pop()
                                      imageUrl = `${API_URL}/files/${filename}`
                                    }
                                  }

                                  return (
                                    <div className="w-full h-32 overflow-hidden bg-gray-100">
                                      <img
                                        src={imageUrl}
                                        alt={task.title}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          e.target.style.display = 'none'
                                        }}
                                      />
                                    </div>
                                  )
                                }
                                return null
                              })()}

                              {/* Task Content */}
                              <div className="p-3">
                                {/* Task Title */}
                                <div className="mb-2">
                                  <h4 className="font-medium text-sm text-gray-900 line-clamp-2">
                                    {task.title}
                                  </h4>
                                </div>

                                {/* Task Metadata */}
                                <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
                                  <div className="flex items-center gap-2">
                                    {task.assigned_to_name && (
                                      <div className="flex items-center">
                                        <div className="w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-medium">
                                          {task.assigned_to_name?.charAt(0).toUpperCase() || 'U'}
                                        </div>
                                      </div>
                                    )}
                                    {task.story_points && (
                                      <span className="px-1.5 py-0.5 bg-gray-100 rounded">
                                        {task.story_points} SP
                                      </span>
                                    )}
                                  </div>
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${priorities[task.priority]?.color || priorities.medium.color
                                    }`}>
                                    {priorities[task.priority]?.label || task.priority}
                                  </span>
                                </div>

                                {/* Task ID and Assignee */}
                                <div className="mt-2 flex items-center justify-between text-xs">
                                  <span className="text-gray-500 font-mono">
                                    {boardData.project.key}-{task.id.slice(0, 6)}
                                  </span>
                                  {task.assigned_to_name && (
                                    <div className="flex items-center text-gray-600">
                                      <User className="h-3 w-3 mr-1" />
                                      {task.assigned_to_name.split(' ')[0]}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">Failed to load project board</p>
            <button
              onClick={() => navigate('/projects')}
              className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Back to Projects
            </button>
          </div>
        )
      )}

      {/* Pages Tab Content */}
      {activeTab === 'pages' && (
        loadingPages ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((item) => <SkeletonCard key={item} lines={3} />)}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Pages Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Pages</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Capture your team knowledge and improve the way you get work done.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingPage(null)
                  setShowPageEditor(true)
                }}
                className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                <Plus className="h-5 w-5 mr-2" />
                Create Page
              </button>
            </div>

            {/* Project Files */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Project files</h3>
                  <p className="text-sm text-gray-600">
                    Files uploaded here are visible to the assigned lead and their team.
                  </p>
                </div>
                <label className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 cursor-pointer">
                  <Plus className="h-5 w-5 mr-2" />
                  Upload file
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleUploadProjectFile}
                  />
                </label>
              </div>

              {loadingProjectFiles ? (
                <div className="flex items-center justify-center py-6">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                </div>
              ) : projectFiles.length === 0 ? (
                <p className="text-sm text-gray-500">No files uploaded yet.</p>
              ) : (
                <div className="space-y-3">
                  {projectFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-md px-3 py-2"
                    >
                      <div className="min-w-0">
                        <a
                          href={getProjectFileUrl(file.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-primary-600 hover:underline break-all"
                        >
                          {file.name || file.original_name}
                        </a>
                        <div className="text-xs text-gray-500">
                          {file.type?.toUpperCase() || 'FILE'} • {(file.size / 1024).toFixed(1)} KB • Uploaded by {file.uploaded_by_name || 'Unknown'}
                        </div>
                      </div>
                      {(hasCompanyAdminAccess(user?.role) || isLeadRole(user?.role)) && (
                        <button
                          onClick={() => handleDeleteProjectFile(file.id)}
                          className="text-red-600 hover:text-red-700 p-1"
                          title="Delete file"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pages List */}
            {pages.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <h3 className="text-lg font-medium text-gray-900 mb-2">No pages yet</h3>
                <p className="text-gray-600 mb-4">
                  Pages are the place to capture all your important information. Start with a blank page and add rich content.
                </p>
                <button
                  onClick={() => {
                    setEditingPage(null)
                    setShowPageEditor(true)
                  }}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Create Your First Page
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pages.map((page) => (
                  <div
                    key={page.id}
                    onClick={async () => {
                      try {
                        const response = await projectsApi.getPage(projectId, page.id)
                        setSelectedPage(response.data)
                        setEditingPage(response.data)
                        setShowPageEditor(true)
                      } catch (error) {
                        toast.error('Failed to load page')
                      }
                    }}
                    className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900 line-clamp-2">{page.title}</h3>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (window.confirm('Are you sure you want to delete this page?')) {
                            handleDeletePage(page.id)
                          }
                        }}
                        className="text-red-600 hover:text-red-700 p-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-3 mb-3">
                      {page.content || 'No content'}
                    </p>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{format(new Date(page.updated_at), 'MMM d, yyyy')}</span>
                      <span className="capitalize px-2 py-1 bg-gray-100 rounded">
                        {page.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {/* Page Editor Modal */}
      {showPageEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-xl font-bold">
                {editingPage ? 'Edit Page' : 'Create Page'}
              </h2>
              <button
                onClick={() => {
                  setShowPageEditor(false)
                  setEditingPage(null)
                  setSelectedPage(null)
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <PageEditor
              projectId={projectId}
              page={editingPage || selectedPage}
              onClose={() => {
                setShowPageEditor(false)
                setEditingPage(null)
                setSelectedPage(null)
              }}
              onSave={async () => {
                await loadPages()
                setRefreshKey(prev => prev + 1)
              }}
            />
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Create Task</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTask}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    name="title"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    name="description"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Priority
                    </label>
                    <select
                      name="priority"
                      defaultValue="medium"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      name="status"
                      defaultValue={selectedStatus}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      {statuses.map(status => (
                        <option key={status.id} value={status.id}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Due Date
                  </label>
                  <input
                    type="datetime-local"
                    name="due_date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assign To
                  </label>
                  <select
                    name="assigned_to"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    disabled={loadingUsers}
                  >
                    <option value="">Unassigned</option>
                    {assignableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.first_name} {u.last_name} {getRoleLabel(u.role) ? `(${getRoleLabel(u.role)})` : ''}
                      </option>
                    ))}
                  </select>
                  {loadingUsers && (
                    <p className="text-xs text-gray-500 mt-1">Loading team members...</p>
                  )}
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Task'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Column Management Modal */}
      {showColumnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {editingColumn ? 'Edit Column' : 'Create Column'}
            </h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!columnForm.label.trim()) {
                  toast.error('Column name is required')
                  return
                }

                try {
                  if (editingColumn) {
                    // Update column
                    await projectsApi.updateBoardColumn(projectId, editingColumn.id, {
                      label: columnForm.label,
                      color: columnForm.color,
                    })
                    toast.success('Column updated successfully')
                  } else {
                    // Create column
                    await projectsApi.createBoardColumn(projectId, {
                      label: columnForm.label,
                      color: columnForm.color,
                    })
                    toast.success('Column created successfully')
                  }
                  setShowColumnModal(false)
                  setEditingColumn(null)
                  setColumnForm({ label: '', color: 'bg-gray-100' })
                  await loadBoardData()
                } catch (error) {
                  toast.error(error.response?.data?.detail || 'Failed to save column')
                }
              }}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Column Name *
                  </label>
                  <input
                    type="text"
                    value={columnForm.label}
                    onChange={(e) => setColumnForm({ ...columnForm, label: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="e.g., TO DO, IN PROGRESS"
                    required
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Color
                  </label>
                  <select
                    value={columnForm.color}
                    onChange={(e) => setColumnForm({ ...columnForm, color: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="bg-gray-100">Gray</option>
                    <option value="bg-blue-100">Blue</option>
                    <option value="bg-green-100">Green</option>
                    <option value="bg-yellow-100">Yellow</option>
                    <option value="bg-red-100">Red</option>
                    <option value="bg-purple-100">Purple</option>
                    <option value="bg-pink-100">Pink</option>
                    <option value="bg-indigo-100">Indigo</option>
                  </select>
                </div>

                {editingColumn && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.confirm('Are you sure you want to delete this column?')) {
                          try {
                            await projectsApi.deleteBoardColumn(projectId, editingColumn.id)
                            toast.success('Column deleted successfully')
                            setShowColumnModal(false)
                            setEditingColumn(null)
                            setColumnForm({ label: '', color: 'bg-gray-100' })
                            await loadBoardData()
                          } catch (error) {
                            toast.error(error.response?.data?.detail || 'Failed to delete column')
                          }
                        }
                      }}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Delete Column
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  {editingColumn ? 'Update Column' : 'Create Column'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowColumnModal(false)
                    setEditingColumn(null)
                    setColumnForm({ label: '', color: 'bg-gray-100' })
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
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

export default ProjectBoard
