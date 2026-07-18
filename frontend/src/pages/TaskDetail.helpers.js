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
    leads: allUsers.filter((item) => normalizeRole(item.role) === 'lead'),
    employees: allUsers.filter((item) => normalizeRole(item.role) === 'employee'),
  }
}

export const getProjectLeadName = (project = {}, users = [], currentUser = null) => {
  const safeProject = project || {}
  const assignedUsers = Array.isArray(safeProject.assigned_users) ? safeProject.assigned_users : []
  const leadFromProject = assignedUsers.find((item) => normalizeRole(item.role) === 'lead')
  if (leadFromProject) return getUserDisplayName(leadFromProject)

  const leadIds = [
    safeProject.lead_id,
    ...(Array.isArray(safeProject.assigned_user_ids) ? safeProject.assigned_user_ids : []),
  ].filter(Boolean).map(String)
  const candidates = [...users, currentUser].filter(Boolean)
  const lead = candidates.find((item) => leadIds.includes(getUserId(item)) && normalizeRole(item.role) === 'lead')
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
