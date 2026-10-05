import { normalizeRole } from '../utils/roles'

export const getUserId = (user) => String(user?.id || user?._id || '')

export const getUserDisplayName = (user) => {
  if (!user) return ''
  return user.name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || 'Team member'
}

// Context for the color-coded "Revision reason" panel on the task detail page:
// the latest written reason the reviewer gave, whether the task currently waits
// in Revision Required, who requested the revision, and the review round.
export const getRevisionReasonContext = (task = {}, { status = '', users = [] } = {}) => {
  const reason = String(task?.latest_revision_reason || '').trim()
  const isRevisionRequired = String(status || task?.status || '').toLowerCase() === 'revision_required'
  const requesterId = task?.revision_requested_by ? String(task.revision_requested_by) : ''
  let requesterName = ''
  if (requesterId) {
    const requester = users.find((item) => getUserId(item) === requesterId)
    if (requester) {
      requesterName = getUserDisplayName(requester)
    } else if (requesterId === String(task?.reviewer_id || '')) {
      requesterName = task?.reviewer_name || ''
    }
  }
  return {
    reason,
    isRevisionRequired,
    requesterName,
    reviewRound: Number(task?.review_round) || 0,
    revisionRequestedAt: task?.revision_requested_at || null,
    show: isRevisionRequired || Boolean(reason),
  }
}

export const buildTaskAssignmentOptions = (users = [], currentUser = null) => {
  const byId = new Map()
  users.forEach((item) => {
    const id = getUserId(item)
    if (id) byId.set(id, item)
  })
  const currentUserId = getUserId(currentUser)
  if (currentUserId && normalizeRole(currentUser?.role) === 'lead' && !byId.has(currentUserId)) {
    byId.set(currentUserId, currentUser)
  }

  const allUsers = [...byId.values()]
  return {
    leads: allUsers.filter((item) => ['lead', 'employee', 'manager', 'sub_admin'].includes(normalizeRole(item.role))),
    employees: allUsers,
  }
}

export const getProjectLeadName = (project = {}, users = [], currentUser = null) => {
  const safeProject = project || {}
  const assignedUsers = Array.isArray(safeProject.assigned_users) ? safeProject.assigned_users : []
  const leadFromProject = assignedUsers.find((item) => ['employee', 'lead', 'manager', 'sub_admin'].includes(normalizeRole(item.role)))
  if (leadFromProject) return getUserDisplayName(leadFromProject)

  const leadIds = [
    safeProject.lead_id,
    ...(Array.isArray(safeProject.assigned_user_ids) ? safeProject.assigned_user_ids : []),
  ].filter(Boolean).map(String)
  const candidates = [...users, currentUser].filter(Boolean)
  const lead = candidates.find((item) => leadIds.includes(getUserId(item)) && ['employee', 'lead', 'manager', 'sub_admin'].includes(normalizeRole(item.role)))
  return getUserDisplayName(lead) || 'No leader assigned'
}

export const canEditTaskDetails = (currentUser = null, task = {}) => {
  const role = normalizeRole(currentUser?.role)
  if (role === 'admin' || role === 'super_admin' || role === 'sub_admin') return true
  if (role === 'employee') return false
  if (role === 'manager') return true
  return role === 'lead'
}

export const TASK_STATUS_TONES = {
  todo: {
    label: 'To Do',
    chipClass: 'border-gray-200 bg-gray-100 text-gray-800',
    selectClass: 'border-gray-300 bg-gray-50 text-gray-800',
    dotClass: 'bg-gray-500',
  },
  assigned: {
    label: 'Assigned',
    chipClass: 'border-indigo-200 bg-indigo-100 text-indigo-800',
    selectClass: 'border-indigo-300 bg-indigo-50 text-indigo-800',
    dotClass: 'bg-indigo-600',
  },
  in_progress: {
    label: 'In Progress',
    chipClass: 'border-blue-200 bg-blue-100 text-blue-800',
    selectClass: 'border-blue-300 bg-blue-50 text-blue-800',
    dotClass: 'bg-blue-600',
  },
  in_review: {
    label: 'In Review',
    chipClass: 'border-yellow-200 bg-yellow-100 text-yellow-800',
    selectClass: 'border-yellow-300 bg-yellow-50 text-yellow-800',
    dotClass: 'bg-yellow-500',
  },
  revision_required: {
    label: 'Revision Required',
    chipClass: 'border-red-200 bg-red-100 text-red-800',
    selectClass: 'border-red-300 bg-red-50 text-red-800',
    dotClass: 'bg-red-500',
  },
  approved: {
    label: 'Approved',
    chipClass: 'border-emerald-200 bg-emerald-100 text-emerald-800',
    selectClass: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    dotClass: 'bg-emerald-600',
  },
  completed: {
    label: 'Completed',
    chipClass: 'border-green-200 bg-green-100 text-green-800',
    selectClass: 'border-green-300 bg-green-50 text-green-800',
    dotClass: 'bg-green-600',
  },
  on_hold: {
    label: 'On Hold',
    chipClass: 'border-purple-200 bg-purple-100 text-purple-800',
    selectClass: 'border-purple-300 bg-purple-50 text-purple-800',
    dotClass: 'bg-purple-600',
  },
  cancelled: {
    label: 'Cancelled',
    chipClass: 'border-red-200 bg-red-100 text-red-800',
    selectClass: 'border-red-300 bg-red-50 text-red-800',
    dotClass: 'bg-red-600',
  },
}

export const getTaskStatusTone = (status) => {
  const key = String(status || 'todo').toLowerCase()
  return TASK_STATUS_TONES[key] || {
    label: key.replace(/_/g, ' '),
    chipClass: 'border-gray-200 bg-gray-100 text-gray-800',
    selectClass: 'border-gray-300 bg-gray-50 text-gray-800',
    dotClass: 'bg-gray-500',
  }
}

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'ogv', 'wmv', 'flv', '3gp', 'mpg', 'mpeg']
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif']

/**
 * Classify an attachment URL for preview rendering: 'image' | 'video' | 'document' | 'file'.
 */
export const getAttachmentKind = (url) => {
  const clean = String(url || '').split('?')[0]
  const ext = clean.split('.').pop()?.toLowerCase() || ''
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image'
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video'
  if (ext && ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'md'].includes(ext)) return 'document'
  return 'file'
}

