import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, Trash2, Paperclip, Eye, History, Mail,
  X, Lock, Share2, MoreVertical, Maximize2, CheckSquare,
  Zap, Sparkles
} from 'lucide-react'
import { useConfirmation } from '../hooks/useConfirmation'
import { aiAPI } from '../api/ai'
import { tasksAPI } from '../api/tasks'
import { filesAPI } from '../api/files'
import { usersAPI } from '../api/users'
import { watchersApi } from '../api/watchers'
import { changelogApi } from '../api/changelog'
import { projectsApi } from '../api/projects'
import { useAuthStore } from '../store/authStore'
import { EmailComposer } from '../components/EmailComposer'
import { EmptyState } from '../components/ui'
import { buildTaskShareUrl, resolveTaskBackTarget, resolveTaskCloseFallback } from './taskNavigation'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const dedupeUsersById = (items = []) => {
  const seen = new Set()
  return items.filter((item) => {
    const id = String(item?.id || item?._id || '')
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

const TaskDetail = () => {
  const { projectId, taskId } = useParams()
  const navigate = useNavigate()
  const { confirm } = useConfirmation()
  const { user } = useAuthStore()
  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [loadingComments, setLoadingComments] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState({})
  const [users, setUsers] = useState([])
  const [activeTab, setActiveTab] = useState('all')
  const [watchers, setWatchers] = useState([])
  const [isWatching, setIsWatching] = useState(false)
  const [changelog, setChangelog] = useState([])
  const [projectInfo, setProjectInfo] = useState(null)
  const [taskStatus, setTaskStatus] = useState('')
  const [detailsExpanded, setDetailsExpanded] = useState(true)
  const [breakdown, setBreakdown] = useState(null)
  const [breakdownLoading, setBreakdownLoading] = useState(false)
  const [breakdownError, setBreakdownError] = useState('')
  const [commenting, setCommenting] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [updatingWatch, setUpdatingWatch] = useState(false)
  const [updatingField, setUpdatingField] = useState(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [extensionRequests, setExtensionRequests] = useState([])
  const [extensionForm, setExtensionForm] = useState({ requested_due_date: '', reason: '' })
  const [submittingExtension, setSubmittingExtension] = useState(false)
  const [reviewingExtensionId, setReviewingExtensionId] = useState(null)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const pageRef = useRef(null)
  const detailsRef = useRef(null)
  const historyRef = useRef(null)

  const navigateBack = useCallback(() => {
    const fallbackPath = resolveTaskCloseFallback(projectId || task?.project_id)
    const historyState = window.history.state || {}
    const target = resolveTaskBackTarget(historyState, fallbackPath)
    if (target) {
      navigate(target)
      return
    }
    navigate(-1)
  }, [navigate, projectId, task?.project_id])

  const loadTask = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError('')
      const data = await tasksAPI.getTask(taskId)
      setTask(data)
      setTaskStatus(data.status)

      if (data.attachments) {
        const API_URL = import.meta.env.VITE_API_URL || '/api/v1'
        const BASE_URL = API_URL.replace('/api/v1', '') || ''
        const fullAttachments = data.attachments.map((url) => {
          if (url.startsWith('http://') || url.startsWith('https://')) {
            return url
          }
          if (url.startsWith('/api/v1/files/')) {
            return `${BASE_URL}${url}`
          }
          if (url.startsWith('/files/')) {
            return `${BASE_URL}/api/v1${url}`
          }
          const filename = url.split('/').pop().split('\\').pop()
          return `${BASE_URL}/api/v1/files/${filename}`
        })
        setAttachments(fullAttachments)
      } else {
        setAttachments([])
      }

      setEditData({
        title: data.title,
        description: data.description || '',
        priority: data.priority,
        assigned_to: data.assigned_to || '',
        due_date: data.due_date ? format(new Date(data.due_date), "yyyy-MM-dd'T'HH:mm") : '',
        estimated_hours: data.estimated_hours ?? '',
        tags: data.tags ? data.tags.join(', ') : '',
        issue_type_id: data.issue_type_id || '',
        component_id: data.component_id || '',
        fix_version_id: data.fix_version_id || '',
      })

      if (data.project_id) {
        try {
          const response = await projectsApi.getProject(data.project_id)
          setProjectInfo(response.data)
        } catch (error) {
          console.error('Error loading project:', error)
        }
      }

      try {
        setLoadingComments(true)
        const commentsData = await tasksAPI.getComments(taskId)
        setComments(commentsData.comments || [])
      } catch (error) {
        console.error('Error loading comments:', error)
        setComments([])
      } finally {
        setLoadingComments(false)
      }

      try {
        const usersData = await usersAPI.getAssignableUsers()
        setUsers(dedupeUsersById(usersData.users || []))
      } catch (error) {
        console.error('Error loading users:', error)
      }

      try {
        const watchersResponse = await watchersApi.getWatchers(data.id)
        setWatchers(watchersResponse.data.watchers || [])
        setIsWatching(watchersResponse.data.watchers?.some(w => w.user_id === user.id) || false)
      } catch (error) {
        console.error('Error loading watchers:', error)
      }

      try {
        const changelogResponse = await changelogApi.getChangelog(data.id)
        setChangelog(changelogResponse.data.changelog || [])
      } catch (error) {
        console.error('Error loading changelog:', error)
      }

      try {
        const extensionData = await tasksAPI.listExtensionRequests(data.id)
        setExtensionRequests(extensionData.requests || [])
      } catch (error) {
        console.error('Error loading extension requests:', error)
      }
    } catch (error) {
      console.error('Error loading task:', error)
      setLoadError(error.response?.data?.detail || error.message || 'Failed to load task')
      toast.error('Failed to load task')
      navigate(-1)
    } finally {
      setLoading(false)
    }
  }, [navigate, taskId, user.id])

  useEffect(() => {
    if (taskId) {
      loadTask()
    }
  }, [taskId, loadTask])

  useEffect(() => {
    const refreshCurrentTask = (event) => {
      const relatedId = event?.detail?.relatedId
      const metadataTaskId = event?.detail?.metadata?.task_id
      if (
        relatedId &&
        String(relatedId) !== String(taskId) &&
        (!metadataTaskId || String(metadataTaskId) !== String(taskId))
      ) return
      const notificationType = String(event?.detail?.type || '').toLowerCase()
      const eventName = String(event?.detail?.metadata?.event || '').toLowerCase()
      if (notificationType === 'task_comment' || eventName === 'task_comment_added') {
        const refreshComments = async () => {
          try {
            const data = await tasksAPI.getComments(taskId)
            setComments(data.comments || [])
          } catch (error) {
            console.error('Error refreshing comments:', error)
          }
        }
        refreshComments()
        return
      }
      if (taskId) {
        loadTask()
      }
    }
    window.addEventListener('syntask:tasks-updated', refreshCurrentTask)
    return () => window.removeEventListener('syntask:tasks-updated', refreshCurrentTask)
  }, [taskId, loadTask])

  const loadWatchers = async () => {
    if (!task) return
    try {
      const response = await watchersApi.getWatchers(task.id)
      setWatchers(response.data.watchers || [])
      setIsWatching(response.data.watchers?.some(w => w.user_id === user.id) || false)
    } catch (error) {
      console.error('Error loading watchers:', error)
    }
  }

  const loadComments = async () => {
    if (!taskId) return
    try {
      setLoadingComments(true)
      const data = await tasksAPI.getComments(taskId)
      setComments(data.comments || [])
    } catch (error) {
      console.error('Error loading comments:', error)
    } finally {
      setLoadingComments(false)
    }
  }

  const handleAddComment = async (e) => {
    e.preventDefault()
    if (!newComment.trim() || !taskId || commenting) return

    try {
      setCommenting(true)
      await tasksAPI.addComment(taskId, newComment)
      toast.success('Comment added')
      setNewComment('')
      await loadComments()
    } catch (error) {
      toast.error('Failed to add comment')
    } finally {
      setCommenting(false)
    }
  }

  const handleStatusChange = async (newStatus) => {
    if (!taskId || updatingStatus) return
    try {
      setUpdatingStatus(true)
      await tasksAPI.updateTaskStatus(taskId, newStatus)
      setTaskStatus(newStatus)
      toast.success('Status updated')
      await loadTask()
    } catch (error) {
      toast.error('Failed to update status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!taskId || savingEdit) return
    try {
      setSavingEdit(true)
      await tasksAPI.updateTask(taskId, editData)
      toast.success('Task updated successfully')
      setIsEditing(false)
      await loadTask()
    } catch (error) {
      toast.error('Failed to update task')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleExtensionRequest = async (event) => {
    event.preventDefault()
    if (!taskId || submittingExtension) return
    try {
      setSubmittingExtension(true)
      await tasksAPI.requestExtension(taskId, extensionForm)
      toast.success('Extension request submitted')
      setExtensionForm({ requested_due_date: '', reason: '' })
      await loadTask()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to request extension')
    } finally {
      setSubmittingExtension(false)
    }
  }

  const handleExtensionReview = async (requestId, action) => {
    if (!requestId || reviewingExtensionId) return
    try {
      setReviewingExtensionId(requestId)
      if (action === 'approve') {
        await tasksAPI.approveExtensionRequest(requestId)
        toast.success('Extension approved')
      } else {
        await tasksAPI.rejectExtensionRequest(requestId)
        toast.success('Extension rejected')
      }
      await loadTask()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to review extension')
    } finally {
      setReviewingExtensionId(null)
    }
  }

  const handleDelete = async () => {
    if (deleting) return
    const confirmed = await confirm({
      title: 'Delete Task',
      message: 'Are you sure you want to delete this task?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDangerous: true,
    })
    if (!confirmed) return
    if (!taskId) return
    
    try {
      setDeleting(true)
      await tasksAPI.deleteTask(taskId)
      toast.success('Task deleted successfully')
      navigateBack()
    } catch (error) {
      toast.error('Failed to delete task')
    } finally {
      setDeleting(false)
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !taskId) return

    try {
      setUploading(true)
      // Upload file
      const result = await filesAPI.uploadFile(file)
      
      // Get full file URL - convert relative path to full URL
      const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'
      const BASE_URL = API_BASE.replace('/api/v1', '') || ''
      let fullFileUrl = result.file_url
      
      // If it's a relative path, convert to full URL
      if (fullFileUrl.startsWith('/api/v1/files/')) {
        // file_url is like "/api/v1/files/filename.png"
        fullFileUrl = `${BASE_URL}${fullFileUrl}`
      } else if (fullFileUrl.startsWith('/files/')) {
        fullFileUrl = `${BASE_URL}/api/v1${fullFileUrl}`
      } else if (!fullFileUrl.startsWith('http')) {
        // Just a filename, construct full path
        fullFileUrl = `${BASE_URL}/api/v1/files/${fullFileUrl}`
      }
      
      // Save attachment to task
      await tasksAPI.addTaskAttachment(taskId, fullFileUrl)
      
      // Update local state
      const newAttachments = [...attachments, fullFileUrl]
      setAttachments(newAttachments)
      
      // Reload task to get updated attachments
      await loadTask()
      
      toast.success('File uploaded successfully')
    } catch (error) {
      console.error('File upload error:', error)
      toast.error(error.response?.data?.detail || 'Failed to upload file')
    } finally {
      setUploading(false)
      // Reset file input
      e.target.value = ''
    }
  }

  const handleToggleWatch = async () => {
    if (!taskId || updatingWatch) return
    try {
      setUpdatingWatch(true)
      if (isWatching) {
        await watchersApi.removeWatcher(taskId)
        toast.success('Stopped watching')
      } else {
        await watchersApi.addWatcher(taskId)
        toast.success('Now watching')
      }
      await loadWatchers()
    } catch (error) {
      toast.error('Failed to update watch status')
    } finally {
      setUpdatingWatch(false)
    }
  }

  const handleGenerateBreakdown = async () => {
    if (!task?.id || breakdownLoading) return

    try {
      setBreakdownLoading(true)
      setBreakdownError('')
      const data = await aiAPI.generateTaskBreakdown({
        task_id: task.id,
        max_subtasks: 5,
      })
      setBreakdown(data)
      toast.success('Task breakdown generated')
    } catch (error) {
      console.error('Failed to generate task breakdown', error)
      setBreakdownError(error.response?.data?.detail || error.message || 'Failed to generate task breakdown')
      toast.error(error.response?.data?.detail || 'Failed to generate task breakdown')
    } finally {
      setBreakdownLoading(false)
    }
  }

  const focusDetails = useCallback(() => {
    setDetailsExpanded(true)
    detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const focusHistory = useCallback(() => {
    setActiveTab('history')
    setHeaderMenuOpen(false)
    historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleShareTask = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildTaskShareUrl(window.location.href))
      toast.success('Task link copied')
    } catch (error) {
      toast.error('Could not copy task link')
    }
  }, [])

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await pageRef.current?.requestFullscreen()
      }
    } catch (error) {
      toast.error('Fullscreen is not available')
    }
  }, [])

  const openProjectBoard = useCallback(() => {
    const targetProjectId = projectId || task?.project_id
    if (targetProjectId) navigate(`/projects/${targetProjectId}/board`)
  }, [navigate, projectId, task?.project_id])

  const priorities = {
    low: { label: 'Low', color: 'text-gray-600 bg-gray-100' },
    medium: { label: 'Medium', color: 'text-blue-600 bg-blue-100' },
    high: { label: 'High', color: 'text-orange-600 bg-orange-100' },
    critical: { label: 'Critical', color: 'text-red-600 bg-red-100' },
  }

  const statuses = {
    todo: { label: 'To Do', color: 'bg-gray-100 text-gray-800' },
    in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
    in_review: { label: 'In Review', color: 'bg-yellow-100 text-yellow-800' },
    completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
    on_hold: { label: 'On Hold', color: 'bg-purple-100 text-purple-800' },
    cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-6">
        <EmptyState
          title="Could not load task"
          description={loadError}
          action={(
            <button
              type="button"
              onClick={loadTask}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              Try again
            </button>
          )}
        />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Task not found</p>
      </div>
    )
  }

  return (
    <>
    <div ref={pageRef} className="h-full flex flex-col bg-white -m-6" style={{ minHeight: 'calc(100vh - 96px)' }}>
      {/* Top Header */}
      <div className="border-b border-gray-200 px-6 py-3 flex items-center justify-between bg-white">
        <div className="flex items-center gap-4">
          <button
            onClick={navigateBack}
            className="text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {projectInfo && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <button
                type="button"
                onClick={openProjectBoard}
                className="font-medium text-gray-700 hover:text-primary-700 hover:underline"
              >
                {projectInfo.name}
              </button>
              <span>/</span>
              <CheckSquare className="h-4 w-4" />
              <span className="font-mono">{task.id?.slice(0, 6)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Mail className="inline-block h-4 w-4 mr-1" />
            Send Email
          </button>
          <button
            type="button"
            onClick={focusDetails}
            className="p-2 hover:bg-gray-100 rounded"
            aria-label="Open task details"
            title="Open task details"
          >
            <Lock className="h-5 w-5 text-gray-600" />
          </button>
          <button
            type="button"
            onClick={handleToggleWatch}
            disabled={updatingWatch}
            className={`p-2 hover:bg-gray-100 rounded relative disabled:opacity-60 ${isWatching ? 'bg-primary-50' : ''}`}
            aria-label={isWatching ? 'Stop watching task' : 'Watch task'}
            title={isWatching ? 'Stop watching task' : 'Watch task'}
          >
            <Eye className={`h-5 w-5 ${isWatching ? 'text-primary-700' : 'text-gray-600'}`} />
            {watchers.length > 0 && (
              <span className="absolute top-0 right-0 bg-primary-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {watchers.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={handleShareTask}
            className="p-2 hover:bg-gray-100 rounded"
            aria-label="Copy task link"
            title="Copy task link"
          >
            <Share2 className="h-5 w-5 text-gray-600" />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setHeaderMenuOpen((open) => !open)}
              className="p-2 hover:bg-gray-100 rounded"
              aria-label="Open task actions"
              aria-expanded={headerMenuOpen}
              title="Open task actions"
            >
              <MoreVertical className="h-5 w-5 text-gray-600" />
            </button>
            {headerMenuOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                <button type="button" onClick={focusHistory} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                  <History className="h-4 w-4" />
                  View history
                </button>
                <button type="button" onClick={handleDelete} disabled={deleting} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-60">
                  <Trash2 className="h-4 w-4" />
                  {deleting ? 'Deleting...' : 'Delete task'}
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 hover:bg-gray-100 rounded"
            aria-label="Toggle fullscreen"
            title="Toggle fullscreen"
          >
            <Maximize2 className="h-5 w-5 text-gray-600" />
          </button>
          <button
            type="button"
            onClick={navigateBack}
            className="p-2 hover:bg-gray-100 rounded"
            aria-label="Close task detail"
            title="Close task detail"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Task Title */}
          <div className="mb-6">
            {isEditing ? (
              <input
                type="text"
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                className="text-2xl font-bold w-full border-b-2 border-primary-500 focus:outline-none pb-2"
                onBlur={handleSaveEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveEdit()
                  }
                }}
              />
            ) : (
              <h1 
                className="text-2xl font-bold text-gray-900 cursor-pointer hover:bg-gray-50 p-2 rounded"
                onClick={() => setIsEditing(true)}
              >
                {task.title}
              </h1>
            )}
          </div>

          {/* Description */}
          <div className="mb-6">
            {isEditing ? (
              <textarea
                value={editData.description}
                onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                className="w-full min-h-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Add a description..."
                onBlur={handleSaveEdit}
              />
            ) : (
              <div 
                className="text-gray-700 whitespace-pre-wrap cursor-pointer hover:bg-gray-50 p-3 rounded"
                onClick={() => setIsEditing(true)}
              >
                {task.description || 'No description'}
              </div>
            )}
          </div>

          {isEditing && (
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Due date</label>
                <input
                  type="datetime-local"
                  value={editData.due_date || ''}
                  onChange={(e) => setEditData({ ...editData, due_date: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                  onBlur={handleSaveEdit}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Estimated hours</label>
                <input
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={editData.estimated_hours}
                  onChange={(e) => setEditData({ ...editData, estimated_hours: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                  onBlur={handleSaveEdit}
                />
              </div>
            </div>
          )}

          {/* AI Task Breakdown */}
          <div className="mb-6 rounded-2xl border border-primary-200 bg-primary-50/60 p-4 dark:border-primary-900/40 dark:bg-primary-950/20">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">AI Task Breakdown</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Generate subtasks, dependencies, and milestones for this task.
                </p>
              </div>
              <button
                type="button"
                onClick={handleGenerateBreakdown}
                disabled={breakdownLoading}
                className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {breakdownLoading ? 'Generating...' : 'Generate breakdown'}
              </button>
            </div>

            {breakdownError ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
                {breakdownError}
              </div>
            ) : null}

            {breakdown ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-900">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-600">Summary</div>
                  <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{breakdown.summary}</p>
                  <div className="mt-3 grid gap-2 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
                    <div>Total estimate: {breakdown.time_estimate_hours} hours</div>
                    <div>Dependencies: {breakdown.dependencies?.length || 0}</div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-900">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Subtasks</h4>
                    <div className="mt-3 space-y-3">
                      {breakdown.subtasks?.map((item) => (
                        <div key={`${item.order}-${item.title}`} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                          <div className="flex items-start justify-between gap-3">
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              {item.order}. {item.title}
                            </div>
                            <div className="text-xs font-semibold text-primary-600">{item.estimated_hours}h</div>
                          </div>
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{item.description}</p>
                          {item.dependencies?.length ? (
                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                              Depends on: {item.dependencies.join(', ')}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-900">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Dependencies</h4>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {breakdown.dependencies?.length ? (
                          breakdown.dependencies.map((item, index) => (
                            <span key={`${item}-${index}`} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                              {item}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-gray-500 dark:text-gray-400">No explicit dependencies detected.</span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-900">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Milestones</h4>
                      <div className="mt-3 space-y-3">
                        {breakdown.milestones?.map((item) => (
                          <div key={item.title} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                            <div className="font-medium text-gray-900 dark:text-gray-100">{item.title}</div>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{item.description}</p>
                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{item.success_criteria}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Attachments */}
          <div ref={historyRef} className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Attachments ({attachments.length})</h3>
            {attachments.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
                {attachments.map((url, index) => {
                  const fileName = url.split('/').pop()
                  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)
                  return (
                    <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                      {isImage ? (
                        <img 
                          src={url} 
                          alt={fileName}
                          className="w-full h-32 object-cover cursor-pointer"
                          crossOrigin="anonymous"
                          loading="lazy"
                          onClick={() => window.open(url, '_blank')}
                          onError={(e) => {
                            // Log error for debugging
                            console.error('Image load error:', url, e.target.src)
                            // Hide broken image and show placeholder
                            e.target.onerror = null
                            e.target.style.display = 'none'
                            // Create placeholder div if it doesn't exist
                            if (!e.target.nextElementSibling || !e.target.nextElementSibling.classList.contains('image-error-placeholder')) {
                              const placeholder = document.createElement('div')
                              placeholder.className = 'image-error-placeholder w-full h-32 bg-gray-100 flex items-center justify-center text-gray-400 text-xs'
                              placeholder.textContent = 'Failed to load'
                              e.target.parentNode.appendChild(placeholder)
                            }
                          }}
                          onLoad={() => {
                            console.log('Image loaded successfully:', url)
                          }}
                        />
                      ) : (
                        <div 
                          className="w-full h-32 bg-gray-100 flex items-center justify-center cursor-pointer hover:bg-gray-200"
                          onClick={() => window.open(url, '_blank')}
                        >
                          <Paperclip className="h-8 w-8 text-gray-400" />
                        </div>
                      )}
                      <div className="p-2">
                        <p className="text-xs text-gray-600 truncate">{fileName}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <label className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer">
              <Paperclip className="h-4 w-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload File'}
              <input
                type="file"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>

          {/* Activity Section */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Activity</h3>
            
            {/* Activity Tabs */}
            <div className="border-b border-gray-200 mb-4">
              <div className="flex space-x-4">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`py-2 px-4 border-b-2 font-medium text-sm ${
                    activeTab === 'all'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setActiveTab('comments')}
                  className={`py-2 px-4 border-b-2 font-medium text-sm ${
                    activeTab === 'comments'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Comments ({comments.length})
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`py-2 px-4 border-b-2 font-medium text-sm ${
                    activeTab === 'history'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  History
                </button>
              </div>
            </div>

            {/* Activity Content */}
            {activeTab === 'all' || activeTab === 'comments' ? (
              <div>
                {/* Comment Input */}
                <div className="mb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary-600 font-semibold text-sm">
                        {user?.first_name?.[0]}{user?.last_name?.[0]}
                      </span>
                    </div>
                    <form onSubmit={handleAddComment} className="flex-1">
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment..."
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                        rows="3"
                      />
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
                          >
                            Suggest a reply...
                          </button>
                          <button
                            type="button"
                            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
                          >
                            Status update...
                          </button>
                          <button
                            type="button"
                            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
                          >
                            Thanks...
                          </button>
                        </div>
                        <button
                          type="submit"
                          disabled={!newComment.trim() || commenting}
                          aria-busy={commenting || undefined}
                          className="btn btn-primary btn-sm"
                        >
                          {commenting ? 'Commenting...' : 'Comment'}
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">Press M to comment</p>
                    </form>
                  </div>
                </div>

                {/* Comments List */}
                <div className="space-y-4">
                  {loadingComments ? (
                    <p className="text-gray-500 text-sm">Loading comments...</p>
                  ) : comments.length === 0 ? (
                    <p className="text-gray-500 text-sm">No comments yet</p>
                  ) : (
                    comments.map((comment) => (
                      <div key={comment.id} className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-gray-600 font-semibold text-sm">
                            {comment.user_name?.[0] || 'U'}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-900">{comment.user_name}</span>
                            <span className="text-xs text-gray-500">
                              {format(new Date(comment.created_at), 'MMMM d, yyyy')} at {format(new Date(comment.created_at), 'h:mm a')}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700">{comment.content}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : activeTab === 'history' && (
              <div className="space-y-3">
                {changelog.length === 0 ? (
                  <p className="text-gray-500 text-sm">No changes recorded</p>
                ) : (
                  changelog.map((change) => (
                    <div key={change.id} className="flex items-start gap-3">
                      <History className="h-4 w-4 text-gray-400 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-sm">
                          <span className="font-medium">{change.user_name}</span>
                          {' '}changed{' '}
                          <span className="font-medium capitalize">{change.field}</span>
                          {' '}from{' '}
                          <span className="text-gray-600">{change.old_value || 'None'}</span>
                          {' '}to{' '}
                          <span className="text-gray-600">{change.new_value || 'None'}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {format(new Date(change.created_at), 'MMMM d, yyyy')} at {format(new Date(change.created_at), 'h:mm a')}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-80 border-l border-gray-200 overflow-y-auto bg-gray-50">
          <div className="p-4 space-y-4">
            {/* Status and Actions */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-gray-500">Status</span>
                  {updatingStatus && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Updating...
                    </span>
                  )}
                </div>
                <select
                  value={taskStatus}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  disabled={updatingStatus}
                  aria-busy={updatingStatus || undefined}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium bg-white transition ${
                    updatingStatus ? 'cursor-wait opacity-70' : ''
                  }`}
                >
                  {Object.entries(statuses).map(([key, status]) => (
                    <option key={key} value={key}>{status.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-end">
                <button className="p-2 hover:bg-gray-200 rounded">
                  <Zap className="h-4 w-4 text-gray-600" />
                </button>
              </div>
              <button className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium flex items-center justify-center gap-2">
                <span>✨</span>
                Improve Task
              </button>
            </div>

            {/* Details Section */}
            <div ref={detailsRef}>
              <button
                onClick={() => setDetailsExpanded(!detailsExpanded)}
                className="w-full flex items-center justify-between text-sm font-semibold text-gray-900 mb-2"
              >
                <span>Details</span>
                {detailsExpanded ? (
                  <span className="text-gray-400">▼</span>
                ) : (
                  <span className="text-gray-400">▶</span>
                )}
              </button>
              
              {detailsExpanded && (
                <div className="space-y-3 bg-white rounded-lg p-3 border border-gray-200">
                  {/* Assignee */}
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-gray-500">Assignee</label>
                      {updatingField === 'assignee' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600">
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Updating...
                        </span>
                      )}
                    </div>
                    <select
                      value={task.assigned_to || ''}
                      disabled={updatingField === 'assignee'}
                      aria-busy={updatingField === 'assignee' || undefined}
                      onChange={async (e) => {
                        const newAssignee = e.target.value
                        try {
                          setUpdatingField('assignee')
                          await tasksAPI.updateTask(task.id, { assigned_to: newAssignee || null })
                          toast.success('Task reassigned')
                          await loadTask()
                        } catch (error) {
                          toast.error('Failed to reassign task')
                        } finally {
                          setUpdatingField(null)
                        }
                      }}
                      className={`w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white transition ${
                        updatingField === 'assignee' ? 'cursor-wait opacity-70' : ''
                      }`}
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id || u._id} value={u.id || u._id}>
                          {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Team member'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Priority */}
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-gray-500">Priority</label>
                      {updatingField === 'priority' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600">
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Updating...
                        </span>
                      )}
                    </div>
                    <select
                      value={task.priority}
                      disabled={updatingField === 'priority'}
                      aria-busy={updatingField === 'priority' || undefined}
                      onChange={async (e) => {
                        try {
                          setUpdatingField('priority')
                          await tasksAPI.updateTask(task.id, { priority: e.target.value })
                          toast.success('Priority updated')
                          await loadTask()
                        } catch (error) {
                          toast.error('Failed to update priority')
                        } finally {
                          setUpdatingField(null)
                        }
                      }}
                      className={`w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white transition ${
                        updatingField === 'priority' ? 'cursor-wait opacity-70' : ''
                      }`}
                    >
                      {Object.entries(priorities).map(([key, priority]) => (
                        <option key={key} value={key}>{priority.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Parent */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Parent</label>
                    <p className="text-sm text-gray-700">None</p>
                  </div>

                  {/* Due Date */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Due date</label>
                    {task.due_date ? (
                      <p className="text-sm text-gray-700">
                        {format(new Date(task.due_date), 'MMM d, yyyy')}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-500">None</p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Health</label>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${
                      task.health_status === 'overdue'
                        ? 'bg-red-100 text-red-700'
                        : task.health_status === 'due_today'
                          ? 'bg-amber-100 text-amber-700'
                          : task.health_status === 'extended'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {(task.health_status || 'healthy').replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Labels */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Labels</label>
                    {task.tags && task.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {task.tags.map((tag, index) => (
                          <span key={index} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">None</p>
                    )}
                  </div>

                  {/* Team */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Team</label>
                    <p className="text-sm text-gray-500">None</p>
                  </div>

                  {/* Start Date */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Start date</label>
                    <p className="text-sm text-gray-500">None</p>
                  </div>

                  {/* Sprint */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Sprint</label>
                    <p className="text-sm text-gray-500">None</p>
                  </div>
                </div>
              )}
            </div>

            {task.assigned_to === String(user?.id || user?._id) && task.status !== 'completed' && task.due_date ? (
              <div className="pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900">Request extension</h3>
                <form className="mt-3 space-y-3" onSubmit={handleExtensionRequest}>
                  <input
                    type="datetime-local"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={extensionForm.requested_due_date}
                    onChange={(event) => setExtensionForm((state) => ({ ...state, requested_due_date: event.target.value }))}
                    required
                  />
                  <textarea
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    rows={3}
                    placeholder="Reason"
                    value={extensionForm.reason}
                    onChange={(event) => setExtensionForm((state) => ({ ...state, reason: event.target.value }))}
                    required
                  />
                  <button type="submit" disabled={submittingExtension} className="w-full rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    {submittingExtension ? 'Submitting...' : 'Submit extension request'}
                  </button>
                </form>
              </div>
            ) : null}

            {extensionRequests.length ? (
              <div className="pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900">Extension requests</h3>
                <div className="mt-3 space-y-2">
                  {extensionRequests.map((request) => (
                    <article key={request.id} className="rounded-xl border border-gray-200 p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-gray-900">{request.status}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {request.requested_due_date ? format(new Date(request.requested_due_date), 'MMM d, yyyy') : 'No date'}
                          </p>
                        </div>
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">{request.status}</span>
                      </div>
                      <p className="mt-2 text-xs text-gray-600">{request.reason}</p>
                      {request.status === 'pending' && user.role !== 'employee' ? (
                        <div className="mt-3 flex gap-2">
                          <button type="button" disabled={reviewingExtensionId === request.id} onClick={() => handleExtensionReview(request.id, 'approve')} className="flex-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-60">Approve</button>
                          <button type="button" disabled={reviewingExtensionId === request.id} onClick={() => handleExtensionReview(request.id, 'reject')} className="flex-1 rounded-lg bg-red-600 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-60">Reject</button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Actions */}
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleWatch}
                  disabled={updatingWatch}
                  aria-busy={updatingWatch || undefined}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${
                    isWatching
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Eye className="h-4 w-4" />
                  {updatingWatch ? 'Updating...' : isWatching ? 'Watching' : 'Watch'}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  aria-busy={deleting || undefined}
                  aria-label={deleting ? 'Deleting task' : 'Delete task'}
                  className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
      <EmailComposer
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        initialData={{
          to: task?.assigned_to ? [{ email: users.find((item) => String(item.id) === String(task.assigned_to))?.email || '', name: users.find((item) => String(item.id) === String(task.assigned_to))?.first_name || '' }] : [],
          subject: task?.title ? `Task update: ${task.title}` : 'Task update',
          html: '<p>Hello,</p><p></p>',
          text: 'Hello,',
          related_entity_type: 'task',
          related_entity_id: task?.id || '',
          related_module: 'tasks',
        }}
      />
    </>
  )
}

export default TaskDetail
