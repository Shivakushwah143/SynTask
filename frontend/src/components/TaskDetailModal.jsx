import { useState, useEffect, useCallback } from 'react'
import { X, Trash2, Paperclip, Send, User, Plus, List, Edit, Save, Eye, Link2, History } from 'lucide-react'
import { tasksAPI } from '../api/tasks'
import { filesAPI, MAX_UPLOAD_SIZE, formatFileSize, getUploadErrorMessage } from '../api/files'
import { useConfirmation } from '../hooks/useConfirmation'
import { usersAPI } from '../api/users'
import { watchersApi } from '../api/watchers'
import { issueLinksApi } from '../api/issueLinks'
import { changelogApi } from '../api/changelog'
import { issueTypesApi } from '../api/issueTypes'
import { componentsApi } from '../api/components'
import { versionsApi } from '../api/versions'
import { useAuthStore } from '../store/authStore'
import { hasCompanyAdminAccess, isLeadRole, getRoleLabel } from '../utils/roles'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { timeService } from '@/services/timeService'

const TaskDetailModal = ({ task, onClose, onStatusChange, onDelete, onRefresh }) => {
  const { user } = useAuthStore()
  const { confirm } = useConfirmation()
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [loadingComments, setLoadingComments] = useState(true)
  const [subtasks, setSubtasks] = useState([])
  const [showSubtaskForm, setShowSubtaskForm] = useState(false)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [newSubtaskDueDate, setNewSubtaskDueDate] = useState('')
  const [newSubtaskEstimatedHours, setNewSubtaskEstimatedHours] = useState('')
  const [creatingSubtask, setCreatingSubtask] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState({})
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [activeTab, setActiveTab] = useState('details')
  const [watchers, setWatchers] = useState([])
  const [isWatching, setIsWatching] = useState(false)
  const [issueLinks, setIssueLinks] = useState([])
  const [changelog, setChangelog] = useState([])
  const [issueTypes, setIssueTypes] = useState([])
  const [components, setComponents] = useState([])
  const [versions, setVersions] = useState([])
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [dragOverColumn, setDragOverColumn] = useState(null)
  const [linkForm, setLinkForm] = useState({ destination_task_id: '', link_type: 'relates_to' })

  useEffect(() => {
    loadComments()
    loadSubtasks()
    loadUsers()
    loadWatchers()
    loadIssueLinks()
    loadChangelog()
    loadIssueTypes()
    if (task.project_id) {
      loadComponents()
      loadVersions()
    }
    if (task.attachments) {
      setAttachments(task.attachments)
    }
    if (task.subtasks) {
      setSubtasks(task.subtasks)
    }
    setEditData({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      assigned_to: task.assigned_to || '',
      due_date: task.due_date ? timeService.toZonedDateTimeInput(task.due_date) : '',
      tags: task.tags ? task.tags.join(', ') : '',
      issue_type_id: task.issue_type_id || '',
      component_id: task.component_id || '',
      fix_version_id: task.fix_version_id || '',
    })
  }, [task.id, task.assigned_to, task.attachments, task.component_id, task.description, task.due_date, task.fix_version_id, task.issue_type_id, task.priority, task.project_id, task.subtasks, task.tags, task.title, loadComments, loadSubtasks, loadUsers, loadWatchers, loadIssueLinks, loadChangelog, loadIssueTypes, loadComponents, loadVersions])

  const loadUsers = useCallback(async () => {
    try {
      setLoadingUsers(true)
      // Use assignable users endpoint (merged with juniors) to get users based on role
      const data = await usersAPI.getAssignableUsersWithJuniors()
      // Exclude current logged-in user from assign dropdowns
      const filtered = (data.users || []).filter((u) => String(u.id || u._id) !== String(user.id || user._id))
      setUsers(filtered)
    } catch (error) {
      console.error('Error loading users:', error)
      // Fallback to list users if assignable endpoint fails
      try {
        const fallbackData = await usersAPI.listUsers(user.company_id)
        let fallbackUsers = fallbackData.users || []
        // Show all team members in assign dropdown regardless of role
        // Ensure current user is not present in assign dropdown
        setUsers(fallbackUsers.filter((u) => String(u.id || u._id) !== String(user.id || user._id)))
      } catch (fallbackError) {
        console.error('Error loading fallback users:', fallbackError)
      }
    } finally {
      setLoadingUsers(false)
    }
  }, [user.company_id, user.role])

  const loadWatchers = useCallback(async () => {
    try {
      const response = await watchersApi.getWatchers(task.id)
      setWatchers(response.data.watchers || [])
      setIsWatching(response.data.watchers?.some(w => w.user_id === user.id) || false)
    } catch (error) {
      console.error('Error loading watchers:', error)
    }
  }, [task.id, user.id])

  const handleToggleWatch = async () => {
    try {
      if (isWatching) {
        await watchersApi.removeWatcher(task.id)
        toast.success('Stopped watching')
      } else {
        await watchersApi.addWatcher(task.id)
        toast.success('Now watching')
      }
      loadWatchers()
    } catch (error) {
      toast.error('Failed to update watch status')
    }
  }

  const loadIssueLinks = useCallback(async () => {
    try {
      const response = await issueLinksApi.getLinks(task.id)
      setIssueLinks(response.data.links || [])
    } catch (error) {
      console.error('Error loading issue links:', error)
    }
  }, [task.id])

  const handleCreateLink = async (e) => {
    e.preventDefault()
    try {
      await issueLinksApi.createLink(task.id, linkForm)
      toast.success('Issue link created')
      setShowLinkModal(false)
      setLinkForm({ destination_task_id: '', link_type: 'relates_to' })
      loadIssueLinks()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create link')
    }
  }

  const loadChangelog = useCallback(async () => {
    try {
      const response = await changelogApi.getChangelog(task.id)
      setChangelog(response.data.changelog || [])
    } catch (error) {
      console.error('Error loading changelog:', error)
    }
  }, [task.id])

  const loadIssueTypes = useCallback(async () => {
    try {
      const response = await issueTypesApi.getIssueTypes({ project_id: task.project_id })
      setIssueTypes(response.data.issue_types || [])
    } catch (error) {
      console.error('Error loading issue types:', error)
    }
  }, [task.project_id])

  const loadComponents = useCallback(async () => {
    if (!task.project_id) return
    try {
      const response = await componentsApi.getComponents(task.project_id)
      setComponents(response.data.components || [])
    } catch (error) {
      console.error('Error loading components:', error)
    }
  }, [task.project_id])

  const loadVersions = useCallback(async () => {
    if (!task.project_id) return
    try {
      const response = await versionsApi.getVersions(task.project_id)
      setVersions(response.data.versions || [])
    } catch (error) {
      console.error('Error loading versions:', error)
    }
  }, [task.project_id])

  const loadComments = useCallback(async () => {
    try {
      setLoadingComments(true)
      const data = await tasksAPI.getComments(task.id)
      setComments(data.comments || [])
    } catch (error) {
      console.error('Error loading comments:', error)
    } finally {
      setLoadingComments(false)
    }
  }, [task.id])

  const handleAddComment = async (e) => {
    e.preventDefault()
    if (!newComment.trim()) return

    try {
      await tasksAPI.addComment(task.id, newComment)
      toast.success('Comment added')
      setNewComment('')
      await loadComments()
    } catch (error) {
      toast.error('Failed to add comment')
    }
  }

  const loadSubtasks = useCallback(async () => {
    try {
      const data = await tasksAPI.getSubtasks(task.id)
      setSubtasks(data.subtasks || [])
    } catch (error) {
      console.error('Error loading subtasks:', error)
    }
  }, [task.id])

  const handleCreateSubtask = async (e) => {
    e.preventDefault()
    if (!newSubtaskTitle.trim()) return

    try {
      setCreatingSubtask(true)
      const formData = new URLSearchParams()
      formData.append('title', newSubtaskTitle)
      formData.append('parent_task_id', task.id)
      formData.append('priority', 'medium')
      
      await tasksAPI.createTask({
        title: newSubtaskTitle,
        parent_task_id: task.id,
        priority: 'medium',
        due_date: newSubtaskDueDate || null,
        estimated_hours: newSubtaskEstimatedHours ? parseFloat(newSubtaskEstimatedHours) : null,
      })
      toast.success('Subtask created')
      setNewSubtaskTitle('')
      setNewSubtaskDueDate('')
      setNewSubtaskEstimatedHours('')
      setShowSubtaskForm(false)
      await loadSubtasks()
    } catch (error) {
      toast.error('Failed to create subtask')
    } finally {
      setCreatingSubtask(false)
    }
  }

  const handleSaveEdit = async () => {
    try {
      await tasksAPI.updateTask(task.id, editData)
      toast.success('Task updated successfully')
      setIsEditing(false)
      onRefresh()
    } catch (error) {
      toast.error('Failed to update task')
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Client-side size pre-check for a clear, immediate message
    if (file.size > MAX_UPLOAD_SIZE) {
      toast.error(
        `File is too large (${formatFileSize(file.size)}). Maximum allowed size is ${formatFileSize(MAX_UPLOAD_SIZE)}.`
      )
      e.target.value = ''
      return
    }

    try {
      setUploading(true)
      const result = await filesAPI.uploadFile(file)
      // Convert relative path to a full URL (same logic as TaskDetail.jsx)
      const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'
      const BASE_URL = API_BASE.replace('/api/v1', '') || ''
      let fullFileUrl = result.file_url
      if (fullFileUrl.startsWith('/api/v1/files/')) {
        fullFileUrl = `${BASE_URL}${fullFileUrl}`
      } else if (fullFileUrl.startsWith('/files/')) {
        fullFileUrl = `${BASE_URL}/api/v1${fullFileUrl}`
      } else if (!fullFileUrl.startsWith('http')) {
        fullFileUrl = `${BASE_URL}/api/v1/files/${fullFileUrl}`
      }
      const newAttachments = [...attachments, fullFileUrl]
      setAttachments(newAttachments)
      toast.success('File uploaded successfully')
      onRefresh?.()
    } catch (error) {
      toast.error(getUploadErrorMessage(error))
    } finally {
      setUploading(false)
    }
  }

  const priorities = {
    low: { label: 'Low', color: 'badge-secondary' },
    medium: { label: 'Medium', color: 'badge-primary' },
    high: { label: 'High', color: 'badge-warning' },
    critical: { label: 'Critical', color: 'badge-danger' },
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-screen overflow-y-auto shadow-modal dark:bg-gray-950" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{task.title}</h2>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-4">
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveTab('details')}
              className={`py-2 px-4 border-b-2 font-medium text-sm ${
                activeTab === 'details'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab('watchers')}
              className={`py-2 px-4 border-b-2 font-medium text-sm flex items-center ${
                activeTab === 'watchers'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Eye className="h-4 w-4 mr-1" />
              Watchers ({watchers.length})
            </button>
            <button
              onClick={() => setActiveTab('links')}
              className={`py-2 px-4 border-b-2 font-medium text-sm flex items-center ${
                activeTab === 'links'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Link2 className="h-4 w-4 mr-1" />
              Links ({issueLinks.length})
            </button>
            <button
              onClick={() => setActiveTab('changelog')}
              className={`py-2 px-4 border-b-2 font-medium text-sm flex items-center ${
                activeTab === 'changelog'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <History className="h-4 w-4 mr-1" />
              History
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Tab Content */}
          {activeTab === 'details' && (
            <>
              {/* Task Details */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Task Details</h3>
                {!isEditing ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="btn btn-secondary btn-sm flex items-center"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </button>
                ) : (
                  <button
                    onClick={handleSaveEdit}
                    className="btn btn-primary btn-sm flex items-center"
                  >
                    <Save className="h-4 w-4 mr-1" />
                    Save
                  </button>
                )}
              </div>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Title *</label>
                <input
                  type="text"
                  value={editData.title}
                  onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                  className="input mt-1"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={editData.description}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  rows="3"
                  className="input mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Priority</label>
                  <select
                    value={editData.priority}
                    onChange={(e) => setEditData({ ...editData, priority: e.target.value })}
                    className="input mt-1"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Assign To</label>
                  <select
                    value={editData.assigned_to}
                    onChange={(e) => setEditData({ ...editData, assigned_to: e.target.value })}
                    className="input mt-1"
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.first_name} {u.last_name} ({getRoleLabel(u.role)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Due Date</label>
                <input
                  type="datetime-local"
                  value={editData.due_date}
                  onChange={(e) => setEditData({ ...editData, due_date: e.target.value })}
                  className="input mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={editData.tags}
                  onChange={(e) => setEditData({ ...editData, tags: e.target.value })}
                  className="input mt-1"
                  placeholder="tag1, tag2, tag3"
                />
              </div>
              
              {task.project_id && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Issue Type</label>
                    <select
                      value={editData.issue_type_id}
                      onChange={(e) => setEditData({ ...editData, issue_type_id: e.target.value })}
                      className="input mt-1"
                    >
                      <option value="">None</option>
                      {issueTypes.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Component</label>
                    <select
                      value={editData.component_id}
                      onChange={(e) => setEditData({ ...editData, component_id: e.target.value })}
                      className="input mt-1"
                    >
                      <option value="">None</option>
                      {components.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Fix Version</label>
                    <select
                      value={editData.fix_version_id}
                      onChange={(e) => setEditData({ ...editData, fix_version_id: e.target.value })}
                      className="input mt-1"
                    >
                      <option value="">None</option>
                      {versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <button
                onClick={() => setIsEditing(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <p className="text-gray-900 mt-1">{task.description || 'No description'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Status</label>
                  <select
                    value={task.status}
                    onChange={(e) => {
                      onStatusChange(task.id, e.target.value)
                    }}
                    className="input mt-1"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="in_review">Review</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Priority</label>
                  <p className="text-gray-900 mt-1">
                    <span className={`badge ${priorities[task.priority]?.color || 'badge-secondary'}`}>
                      {priorities[task.priority]?.label || task.priority}
                    </span>
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Assign To</label>
                <select
                  value={task.assigned_to || ''}
                  onChange={async (e) => {
                    const newAssignee = e.target.value
                    try {
                      await tasksAPI.updateTask(task.id, { assigned_to: newAssignee || null })
                      toast.success('Task reassigned successfully')
                      onRefresh()
                    } catch (error) {
                      toast.error('Failed to reassign task')
                    }
                  }}
                  className="input mt-1"
                  disabled={loadingUsers}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                        {u.first_name} {u.last_name} ({getRoleLabel(u.role)})
                      </option>
                    ))}
                  </select>
                {task.assigned_to && (() => {
                  const assignedUser = users.find(u => u.id === task.assigned_to)
                  return assignedUser ? (
                    <p className="text-xs text-gray-500 mt-1">
                      Currently assigned to: {assignedUser.first_name} {assignedUser.last_name}
                    </p>
                  ) : null
                })()}
              </div>

              {task.due_date && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Due Date</label>
                  <p className="text-gray-900 mt-1">
                    {timeService.formatPattern(task.due_date, 'PPpp')}
                  </p>
                </div>
              )}

              {task.tags && task.tags.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Tags</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {task.tags.map((tag, index) => (
                      <span key={index} className="badge badge-secondary text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Subtasks Section - Kanban Board */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700">Subtasks ({subtasks.length})</label>
              <button
                onClick={() => setShowSubtaskForm(!showSubtaskForm)}
                className="inline-flex items-center gap-1 rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100 dark:bg-primary-900/20 dark:text-primary-300 dark:hover:bg-primary-900/30"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Subtask
              </button>
            </div>
            
            {showSubtaskForm && (
              <form onSubmit={handleCreateSubtask} className="mb-4 space-y-2">
                <input
                  type="text"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  placeholder="Subtask title..."
                  className="input w-full text-sm"
                  required
                  autoFocus
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="mb-0.5 block text-[10px] font-medium text-gray-500">Due date</label>
                    <input
                      type="date"
                      value={newSubtaskDueDate}
                      onChange={(e) => setNewSubtaskDueDate(e.target.value)}
                      className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:border-primary-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                    />
                  </div>
                  <div className="w-24">
                    <label className="mb-0.5 block text-[10px] font-medium text-gray-500">Hours</label>
                    <input
                      type="number"
                      min="0.25"
                      step="0.25"
                      value={newSubtaskEstimatedHours}
                      onChange={(e) => setNewSubtaskEstimatedHours(e.target.value)}
                      placeholder="0.5"
                      className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:border-primary-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={creatingSubtask}
                    className="btn btn-primary btn-sm flex-1"
                  >
                    {creatingSubtask ? 'Creating...' : 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSubtaskForm(false)
                      setNewSubtaskTitle('')
                      setNewSubtaskDueDate('')
                      setNewSubtaskEstimatedHours('')
                    }}
                    className="btn btn-secondary btn-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
            
            {subtasks.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  { id: 'todo', label: 'To Do', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
                  { id: 'in_progress', label: 'In Progress', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
                  { id: 'in_review', label: 'Review', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
                  { id: 'completed', label: 'Completed', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
                ].map((column) => {
                  const columnSubtasks = subtasks.filter((s) => s.status === column.id)
                  const isOver = dragOverColumn === column.id
                  return (
                    <div key={column.id}
                      onDragOver={(e) => { e.preventDefault(); setDragOverColumn(column.id) }}
                      onDragEnter={(e) => { e.preventDefault(); setDragOverColumn(column.id) }}
                      onDragLeave={(e) => {
                        if (e.currentTarget.contains(e.relatedTarget)) return
                        setDragOverColumn(null)
                      }}
                      onDrop={async (e) => {
                        e.preventDefault()
                        setDragOverColumn(null)
                        const draggedId = e.dataTransfer.getData('text/plain')
                        if (!draggedId) return
                        const draggedSubtask = subtasks.find((s) => s.id === draggedId)
                        if (!draggedSubtask || draggedSubtask.status === column.id) return
                        try {
                          await tasksAPI.updateTaskStatus(draggedId, column.id)
                          toast.success('Subtask moved')
                          await loadSubtasks()
                        } catch (error) {
                          toast.error('Failed to move subtask')
                        }
                      }}
                      className={`rounded-xl border bg-white shadow-sm transition-all duration-200 ${
                        isOver
                          ? 'border-indigo-400 bg-indigo-50/50 shadow-md ring-2 ring-indigo-200 dark:border-indigo-500 dark:bg-indigo-950/20 dark:ring-indigo-800'
                          : 'border-gray-200 dark:border-gray-700 dark:bg-gray-800/50'
                      }`}
                    >
                      <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${column.color}`}>
                            {column.label}
                          </span>
                          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-indigo-100 px-1.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                            {columnSubtasks.length}
                          </span>
                        </div>
                      </div>
                      <div className={`space-y-2 p-2 min-h-[80px] transition-colors ${isOver ? 'bg-indigo-50/30 dark:bg-indigo-950/10' : ''}`}>
                        {columnSubtasks.length === 0 ? (
                          <div className={`flex min-h-[60px] items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                            isOver ? 'border-indigo-300 bg-indigo-50/50 dark:border-indigo-600 dark:bg-indigo-950/30' : 'border-gray-200 dark:border-gray-700'
                          }`}>
                            <p className="text-[11px] text-gray-400">{isOver ? 'Drop here' : 'Empty'}</p>
                          </div>
                        ) : (
                          columnSubtasks.map((subtask) => (
                            <div
                              key={subtask.id}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', subtask.id)
                                e.dataTransfer.effectAllowed = 'move'
                              }}
                              className="group rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm transition-all hover:border-indigo-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-indigo-700 cursor-grab active:cursor-grabbing"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                                  {subtask.title}
                                </p>
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                  subtask.priority === 'critical' ? 'bg-red-100 text-red-700' :
                                  subtask.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                                  subtask.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {(subtask.priority || 'medium').charAt(0).toUpperCase() + (subtask.priority || 'medium').slice(1)}
                                </span>
                                <select
                                  value={subtask.assigned_to || ''}
                                  onChange={async (e) => {
                                    try {
                                      await tasksAPI.updateTask(subtask.id, { assigned_to: e.target.value || null })
                                      toast.success('Subtask reassigned')
                                      await loadSubtasks()
                                    } catch (error) {
                                      toast.error('Failed to reassign subtask')
                                    }
                                  }}
                                  className="max-w-[100px] rounded-md border border-gray-200 px-1 py-0.5 text-[10px] text-gray-600 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                                  onClick={(e) => e.stopPropagation()}
                                  title={users.find(u => u.id === subtask.assigned_to) ? `${users.find(u => u.id === subtask.assigned_to).first_name} ${users.find(u => u.id === subtask.assigned_to).last_name}` : 'Assign to...'}
                                >
                                  <option value="">Unassigned</option>
                                  {users.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.first_name} {u.last_name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="mt-2">
                                <select
                                  value={subtask.status}
                                  onChange={async (e) => {
                                    try {
                                      await tasksAPI.updateTaskStatus(subtask.id, e.target.value)
                                      toast.success('Subtask status updated')
                                      await loadSubtasks()
                                    } catch (error) {
                                      toast.error('Failed to update subtask status')
                                    }
                                  }}
                                  className="w-full rounded-md border border-gray-200 px-1.5 py-1 text-[10px] font-medium text-gray-700 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <option value="todo">To Do</option>
                                  <option value="in_progress">In Progress</option>
                                  <option value="in_review">Review</option>
                                  <option value="completed">Completed</option>
                                </select>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex min-h-[100px] items-center justify-center rounded-xl border-2 border-dashed border-gray-200 p-4 dark:border-gray-700">
                <div className="text-center">
                  <List className="mx-auto h-6 w-6 text-gray-300 dark:text-gray-600" />
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">No subtasks yet</p>
                  <button
                    onClick={() => setShowSubtaskForm(true)}
                    className="mt-2 inline-flex items-center gap-1 rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100 dark:bg-primary-900/20 dark:text-primary-300"
                  >
                    <Plus className="h-3 w-3" />
                    Create first subtask
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Attachments */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Attachments</label>
            <div className="space-y-2">
              {attachments.map((url, index) => (
                <a
                  key={index}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-primary-600 hover:text-primary-700 text-sm"
                >
                  <Paperclip className="h-4 w-4 mr-2" />
                  {url.split('/').pop()}
                </a>
              ))}
              <label className="flex items-center text-primary-600 hover:text-primary-700 cursor-pointer text-sm">
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
          </div>

          {/* Comments Section */}
          <div className="border-t pt-4">
            <label className="text-sm font-medium text-gray-700 mb-3 block">
              Comments ({comments.length})
            </label>
            
            {/* Comments List */}
            <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
              {loadingComments ? (
                <p className="text-gray-500 text-sm">Loading comments...</p>
              ) : comments.length === 0 ? (
                <p className="text-gray-500 text-sm">No comments yet</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center">
                        <User className="h-4 w-4 text-gray-400 mr-2" />
                        <span className="text-sm font-medium text-gray-900">
                          {comment.user_name}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {timeService.formatPattern(comment.created_at, 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 ml-6">{comment.content}</p>
                  </div>
                ))
              )}
            </div>

            {/* Add Comment Form */}
            <form onSubmit={handleAddComment} className="flex space-x-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment... (Use @username to mention)"
                className="input flex-1"
              />
              <button
                type="submit"
                className="btn btn-primary flex items-center"
              >
                <Send className="h-4 w-4 mr-1" />
                Send
              </button>
            </form>
          </div>

          {/* Actions */}
          <div className="flex space-x-3 pt-4 border-t">
            <button
              onClick={handleToggleWatch}
              className={`btn ${isWatching ? 'btn-primary' : 'btn-secondary'} flex items-center`}
            >
              <Eye className="h-4 w-4 mr-2" />
              {isWatching ? 'Watching' : 'Watch'}
            </button>
            <button
              onClick={() => onDelete(task.id)}
              className="btn btn-danger flex items-center"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </button>
            <button
              onClick={onClose}
              className="btn btn-secondary flex-1"
            >
              Close
            </button>
          </div>
            </>
          )}

          {/* Watchers Tab */}
          {activeTab === 'watchers' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Watchers</h3>
                <button
                  onClick={handleToggleWatch}
                  className={`btn btn-sm ${isWatching ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {isWatching ? 'Stop Watching' : 'Watch This Task'}
                </button>
              </div>
              {watchers.length === 0 ? (
                <p className="text-gray-500 text-sm">No watchers yet</p>
              ) : (
                <div className="space-y-2">
                  {watchers.map((watcher) => (
                    <div key={watcher.user_id} className="flex items-center p-3 bg-gray-50 rounded-lg">
                      <User className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <div className="font-medium text-sm">{watcher.user_name}</div>
                        <div className="text-xs text-gray-500">{watcher.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Issue Links Tab */}
          {activeTab === 'links' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Issue Links</h3>
                <button
                  onClick={() => setShowLinkModal(true)}
                  className="btn btn-primary btn-sm flex items-center"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Link
                </button>
              </div>
              {issueLinks.length === 0 ? (
                <p className="text-gray-500 text-sm">No links yet</p>
              ) : (
                <div className="space-y-2">
                  {issueLinks.map((link) => (
                    <div key={link.link_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <Link2 className="h-4 w-4 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm font-medium">{link.task_title}</div>
                          <div className="text-xs text-gray-500 capitalize">
                            {link.link_type.replace('_', ' ')}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          const confirmed = await confirm({
                            title: 'Delete Link',
                            message: 'Delete this link?',
                            confirmText: 'Delete',
                            cancelText: 'Cancel',
                            isDangerous: true,
                          })
                          if (confirmed) {
                            try {
                              await issueLinksApi.deleteLink(link.link_id)
                              toast.success('Link deleted')
                              loadIssueLinks()
                            } catch (error) {
                              toast.error('Failed to delete link')
                            }
                          }
                        }}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Changelog Tab */}
          {activeTab === 'changelog' && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Change History</h3>
              {changelog.length === 0 ? (
                <p className="text-gray-500 text-sm">No changes recorded</p>
              ) : (
                <div className="space-y-3">
                  {changelog.map((change) => (
                    <div key={change.id} className="flex items-start p-3 bg-gray-50 rounded-lg">
                      <History className="h-4 w-4 text-gray-400 mr-3 mt-0.5" />
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
                          {timeService.formatPattern(change.created_at, 'PPpp')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Link Modal */}
        {showLinkModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-bold mb-4">Link Issue</h3>
              <form onSubmit={handleCreateLink}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Task ID
                    </label>
                    <input
                      type="text"
                      required
                      value={linkForm.destination_task_id}
                      onChange={(e) => setLinkForm({ ...linkForm, destination_task_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Enter task ID"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Link Type
                    </label>
                    <select
                      value={linkForm.link_type}
                      onChange={(e) => setLinkForm({ ...linkForm, link_type: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="relates_to">Relates To</option>
                      <option value="blocks">Blocks</option>
                      <option value="is_blocked_by">Is Blocked By</option>
                      <option value="clones">Clones</option>
                      <option value="is_cloned_by">Is Cloned By</option>
                      <option value="duplicates">Duplicates</option>
                      <option value="is_duplicated_by">Is Duplicated By</option>
                      <option value="depends_on">Depends On</option>
                      <option value="is_depended_on_by">Is Depended On By</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    Create Link
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLinkModal(false)}
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
    </div>
  )
}

export default TaskDetailModal
