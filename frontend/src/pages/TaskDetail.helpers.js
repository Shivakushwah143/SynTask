import { normalizeRole } from '../utils/roles'

export const getUserId = (user) => String(user?.id || user?._id || '')

export const getUserDisplayName = (user) => {
  if (!user) return ''
  return user.name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || 'Team member'
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
  if (role === 'admin' || role === 'super_admin') return true
  if (role === 'employee') return false
  if (role === 'manager') {
    return Boolean(currentUser?.department_id && task?.department_id && String(currentUser.department_id) === String(task.department_id))
  }
  return role === 'lead'
}

export const TASK_STATUS_TONES = {
  todo: {
    label: 'To Do',
    chipClass: 'border-gray-200 bg-gray-100 text-gray-800',
    selectClass: 'border-gray-300 bg-gray-50 text-gray-800',
    dotClass: 'bg-gray-500',
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
