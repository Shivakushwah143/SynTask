import { normalizeRole } from '../utils/roles'

export function normalizeEstimatedHours(value) {
  const hours = Number(value)
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return null
  return String(hours)
}

export const getUserDisplayName = (user) => {
  if (!user) return ''
  return user.name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || ''
}

export const getProjectRoleNames = (projectRecord = {}, assignableUsers = [], currentUser = null) => {
  const assignedProjectUsers = Array.isArray(projectRecord.assigned_users) ? projectRecord.assigned_users : []
  const assignedProjectIds = projectRecord.assigned_user_ids || (projectRecord.assigned_to ? [projectRecord.assigned_to] : [])
  const usersById = new Map()
  assignableUsers.forEach((item) => {
    usersById.set(String(item.id || item._id), item)
  })
  if (currentUser?.id || currentUser?._id) {
    usersById.set(String(currentUser.id || currentUser._id), currentUser)
  }

  const namesByRole = { manager: [], lead: [] }
  const addName = (role, name) => {
    const normalizedRole = normalizeRole(role)
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
  const assignedProjectIds = projectRecord.assigned_user_ids || (projectRecord.assigned_to ? [projectRecord.assigned_to] : [])
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
    if ((role === 'manager' || role === 'lead') && !result[role]) result[role] = String(id)
    return result
  }, { manager: '', lead: '' })
}
