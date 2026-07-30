const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value))

const getProgress = (project) => {
  if (typeof project.progress_percentage === 'number') return clamp(Math.round(project.progress_percentage))
  const total = Number(project.task_count || project.tasks_count || project.tasks?.length || 0)
  if (!total) return 0
  return clamp(Math.round((Number(project.completed_task_count || 0) / total) * 100))
}

const getUserDisplayName = (user) => (
  user?.name
  || [user?.first_name, user?.last_name].filter(Boolean).join(' ')
  || user?.email
  || ''
)

const getRoleOwnerLine = (project) => {
  const assignedUsers = Array.isArray(project.assigned_users) ? project.assigned_users : []
  const managerNames = assignedUsers
    // Show all active users as potential project owners (employees, managers, leads, sub admins)
    .filter((user) => user.status === 'active')
    .map(getUserDisplayName)
    .filter(Boolean)
  const leadNames = assignedUsers
    .filter((user) => user.status === 'active')
    .map(getUserDisplayName)
    .filter(Boolean)
  const parts = []
  if (managerNames.length) parts.push(`Manager: ${managerNames.join(', ')}`)
  if (leadNames.length) parts.push(`Lead: ${leadNames.join(', ')}`)
  return parts.join(' / ')
}

const getOwner = (project) => (
  getRoleOwnerLine(project)
  ||
  project.assigned_to_name
  || project.lead_name
  || project.owner_name
  || project.manager_name
  || project.created_by_name
  || 'Unassigned'
)

export function buildProjectGraphRows(projects, limit = 6) {
  // Sort by created_at descending (newest first) so the most recent projects appear at the top
  const sorted = [...projects].sort((a, b) => {
    const aTime = new Date(a.created_at || 0).getTime()
    const bTime = new Date(b.created_at || 0).getTime()
    return bTime - aTime
  })
  return sorted.slice(0, limit).map((project) => {
    const totalTasks = Number(project.task_count || project.tasks_count || project.tasks?.length || 0)
    const progress = getProgress(project)
    const completedTasks = Number(project.completed_task_count ?? Math.round((progress / 100) * totalTasks))
    return {
      id: project.id,
      name: project.name || 'Untitled project',
      key: project.key || project.project_id || '',
      created_at: project.created_at,
      owner: getOwner(project),
      assigned_to: project.assigned_to || '',
      lead_id: project.lead_id || '',
      progress,
      completedTasks,
      totalTasks,
      remainingTasks: Math.max(totalTasks - completedTasks, 0),
      status: project.status || 'active',
    }
  })
}

export function buildProjectGraphSummary(projects) {
  return projects.reduce((summary, project) => {
    const totalTasks = Number(project.task_count || project.tasks_count || project.tasks?.length || 0)
    const completedTasks = Number(project.completed_task_count ?? Math.round((getProgress(project) / 100) * totalTasks))
    summary.totalTasks += totalTasks
    summary.remainingTasks += Math.max(totalTasks - completedTasks, 0)
    return summary
  }, { totalTasks: 0, remainingTasks: 0 })
}

export function filterProjects(projects, { searchQuery = '', filters = {} } = {}) {
  const query = searchQuery.trim().toLowerCase()
  return projects.filter((project) => {
    const matchesQuery = !query || [project.name, project.key, project.description, project.status, project.type]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query))
    const matchesStatus = !filters.status || (project.status || '').toLowerCase() === filters.status
    const matchesType = !filters.type || (project.type || '').toLowerCase() === filters.type
    const matchesOwner = !filters.owner || project.assigned_to === filters.owner || project.lead_id === filters.owner
    return matchesQuery && matchesStatus && matchesType && matchesOwner
  })
}

export function getProjectGridPageSize(columns) {
  const safeColumns = Number(columns) || 1
  if (safeColumns >= 3) return 12
  if (safeColumns === 2) return 10
  return 6
}

export function getVisibleProjectCountForGrid({ columns, page = 1, total = 0 }) {
  const pageSize = getProjectGridPageSize(columns)
  return Math.min(Math.max(1, page) * pageSize, total)
}
