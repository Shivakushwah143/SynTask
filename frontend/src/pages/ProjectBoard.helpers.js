import { normalizeRole } from '../utils/roles'

export function normalizeEstimatedHours(value) {
  const hours = Number(value)
  if (!Number.isFinite(hours) || hours <= 0) return null
  return String(hours)
}

export const getUserDisplayName = (user) => {
  if (!user) return ''
  return user.name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || ''
}

export const getTaskAssigneeUsers = (users = [], currentUser = null) => {
  const currentUserId = currentUser?.id || currentUser?._id
  const seen = new Set()

  return users.filter((item) => {
    const id = String(item?.id || item?._id || '')
    const role = normalizeRole(item?.role)
    if (!id || seen.has(id) || id === String(currentUserId || '')) return false
    if (item?.status && String(item.status).toLowerCase() !== 'active') return false
    seen.add(id)
    return true
  })
}

export const getProjectRoleNames = (projectRecord = {}, assignableUsers = [], currentUser = null) => {
  const assignedProjectUsers = Array.isArray(projectRecord.assigned_users) ? projectRecord.assigned_users : []
  const assignedProjectIds = projectRecord.assigned_user_ids || [projectRecord.assigned_to, projectRecord.lead_id].filter(Boolean)
  const usersById = new Map()
  assignableUsers.forEach((item) => {
    usersById.set(String(item.id || item._id), item)
  })
  if (currentUser?.id || currentUser?._id) {
    usersById.set(String(currentUser.id || currentUser._id), currentUser)
  }

  const namesByRole = { manager: [], lead: [] }
  const addName = (role, name) => {
    let normalizedRole = normalizeRole(role)
    if (normalizedRole === 'employee') normalizedRole = 'lead'
    const displayName = String(name || '').trim()
    if (!displayName || !namesByRole[normalizedRole]) return
    if (!namesByRole[normalizedRole].includes(displayName)) namesByRole[normalizedRole].push(displayName)
  }

  assignedProjectUsers.forEach((item) => {
    addName(item.role, getUserDisplayName(item))
  })

  assignedProjectIds.forEach((id) => {
    const match = usersById.get(String(id))
    if (match) addName(match.role, getUserDisplayName(match))
  })

  if (projectRecord.assigned_to_name && projectRecord.assigned_to) {
    const assignedUser = usersById.get(String(projectRecord.assigned_to))
    addName(assignedUser?.role, projectRecord.assigned_to_name)
  }

  return namesByRole
}

export const getProjectRoleAssignmentIds = (projectRecord = {}, assignableUsers = [], currentUser = null) => {
  const assignedProjectUsers = Array.isArray(projectRecord.assigned_users) ? projectRecord.assigned_users : []
  const assignedProjectIds = projectRecord.assigned_user_ids || [projectRecord.assigned_to, projectRecord.lead_id].filter(Boolean)
  const rolesById = new Map()
  assignableUsers.forEach((item) => {
    rolesById.set(String(item.id || item._id), normalizeRole(item.role))
  })
  if (currentUser?.id || currentUser?._id) {
    rolesById.set(String(currentUser.id || currentUser._id), normalizeRole(currentUser.role))
  }
  assignedProjectUsers.forEach((item) => {
    rolesById.set(String(item.id || item._id), normalizeRole(item.role))
  })

  return assignedProjectIds.reduce((result, id) => {
    const role = rolesById.get(String(id))
    if (role === 'manager' && !result.manager) result.manager = String(id)
    if ((role === 'employee' || role === 'lead' || role === 'manager' || role === 'sub_admin') && !result.lead) result.lead = String(id)
    return result
  }, { manager: '', lead: '' })
}
