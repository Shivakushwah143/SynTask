import { normalizeRole } from '../utils/roles'

export const DEFAULT_STATUSES = [
  { id: 'todo', label: 'To Do' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'Review' },
  { id: 'revision_required', label: 'Revision' },
  { id: 'approved', label: 'Approved' },
  { id: 'completed', label: 'Completed' },
]

export const normalizeStatusId = (value) => String(value || '').trim().toLowerCase()

const normalizeBoardColumns = (columns) => {
  const source = Array.isArray(columns) && columns.length ? columns : DEFAULT_STATUSES
  return source.map((column) => ({
    ...column,
    id: normalizeStatusId(column.id || column.status || column.key),
    label: column.label || column.name || String(column.id || column.status || column.key || '').replace(/_/g, ' '),
  })).filter((column) => column.id)
}

export const normalizeBoardPayload = (payload) => {
  const data = payload?.data?.data || payload?.data || payload || {}
  const sourceTasksByStatus = data.tasks_by_status || data.tasksByStatus || data.board || {}
  const tasksByStatus = {}

  if (Array.isArray(data.tasks)) {
    data.tasks.forEach((task) => {
      const status = normalizeStatusId(task.status || task.status_id)
      if (!tasksByStatus[status]) tasksByStatus[status] = []
      tasksByStatus[status].push({ ...task, status })
    })
  } else {
    Object.entries(sourceTasksByStatus).forEach(([status, tasks]) => {
      const normalizedStatus = normalizeStatusId(status)
      if (!tasksByStatus[normalizedStatus]) tasksByStatus[normalizedStatus] = []
      tasksByStatus[normalizedStatus].push(...(Array.isArray(tasks) ? tasks : []).map((task) => ({
        ...task,
        id: task.id || task._id,
        status: normalizeStatusId(task.status || normalizedStatus),
      })))
    })
  }

  // Stage cards are driven by TASK STATUS, not by the project's configured
  // board columns. The standard kanban columns always render and any extra
  // status that actually has tasks gets its own card, so empty custom phase
  // columns (e.g. PLANNING/EXECUTION/DELIVERY) never mask real task statuses.
  const boardColumns = normalizeBoardColumns(DEFAULT_STATUSES)
  const standardIds = new Set(boardColumns.map((column) => column.id))
  Object.entries(tasksByStatus).forEach(([status, tasks]) => {
    if (tasks.length && !standardIds.has(status)) {
      boardColumns.push({
        id: status,
        label: status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      })
    }
  })

  return {
    ...data,
    board_columns: boardColumns,
    tasks_by_status: tasksByStatus,
  }
}

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
    if (role !== 'employee') return false
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

  const result = assignedProjectIds.reduce((current, id) => {
    const role = rolesById.get(String(id))
    if (role === 'manager' && !current.manager) current.manager = String(id)
    if ((role === 'employee' || role === 'lead' || role === 'sub_admin') && !current.lead) current.lead = String(id)
    return current
  }, { manager: '', lead: '' })
  if (projectRecord.lead_id) result.lead = String(projectRecord.lead_id)
  return result
}
