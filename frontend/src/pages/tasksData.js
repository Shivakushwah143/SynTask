import { timeService } from '@/services/timeService'

const STATUS_PROGRESS = {
  todo: 12,
  open: 12,
  in_progress: 45,
  in_review: 75,
  review: 75,
  completed: 100,
  done: 100,
}

const STATUS_LABELS = {
  todo: 'To Do',
  open: 'Open',
  in_progress: 'In Progress',
  in_review: 'Review',
  review: 'Review',
  completed: 'Completed',
  done: 'Completed',
  scheduled: 'Scheduled',
}

export const TASK_GRAPH_PRIORITY_COLORS = {
  critical: '#991B1B',
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#2FB47C',
}

// Follow-up tasks (e.g. scheduled from a Sales lead) are not standalone tasks
// and should be excluded from the Task Overview graph.
export const isFollowUpTask = (task) => String(task?.source_type || '').toLowerCase() === 'sales_follow_up'

const normalizeStatus = (status) => String(status || 'todo').toLowerCase()

const normalizePriority = (priority) => {
  const value = String(priority || 'medium').toLowerCase()
  return TASK_GRAPH_PRIORITY_COLORS[value] ? value : 'medium'
}

const displayName = (user) => (
  user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.name || user.full_name || user.email || ''
    : ''
)

const buildUserNameLookup = (users = []) => users.reduce((lookup, user) => {
  const id = String(user?.id || user?._id || '')
  if (id && !lookup[id]) lookup[id] = displayName(user)
  return lookup
}, {})

const getAssigneeName = (task, userNameById = {}) => (
  task.assigned_to_name
  || task.assignee_name
  || task.user_name
  || task.assigned_user?.name
  || task.assigned_user?.full_name
  || displayName(task.assigned_user)
  || displayName(task.assignee)
  || userNameById[String(task.assigned_to || '')]
  || 'Unassigned'
)

export function buildTaskGraphRows(tasks, usersOrLimit = [], maybeLimit = 8) {
  const users = Array.isArray(usersOrLimit) ? usersOrLimit : []
  const limit = Array.isArray(usersOrLimit) ? maybeLimit : usersOrLimit
  const userNameById = buildUserNameLookup(users)
  // Exclude follow-up tasks so only standalone tasks appear in the overview
  const standalone = tasks.filter((task) => !isFollowUpTask(task))
  // Sort by created_at descending (newest first) so the most recent tasks appear at the top
  const sorted = [...standalone].sort((a, b) => {
    const aTime = timeService.instantTime(a.created_at || 0)
    const bTime = timeService.instantTime(b.created_at || 0)
    return bTime - aTime
  })
  return sorted.slice(0, limit).map((task) => {
    const statusKey = normalizeStatus(task.status)
    const priorityKey = normalizePriority(task.priority)
    return {
      id: task.id || task._id,
      title: task.title || 'Untitled task',
      isScheduled: Boolean(task.is_scheduled_placeholder),
      scheduledRunAt: task.scheduled_run_at,
      assignee: getAssigneeName(task, userNameById),
      statusKey,
      statusLabel: STATUS_LABELS[statusKey] || statusKey.replace(/_/g, ' '),
      progress: STATUS_PROGRESS[statusKey] ?? 12,
      priorityKey,
      priorityLabel: priorityKey.replace(/\b\w/g, (letter) => letter.toUpperCase()),
      priorityColor: TASK_GRAPH_PRIORITY_COLORS[priorityKey],
      dueDate: task.due_date,
      created_at: task.created_at,
      projectId: task.project_id,
    }
  })
}

export function buildTaskGraphSummary(tasks) {
  return tasks.reduce((summary, task) => {
    if (isFollowUpTask(task)) return summary
    const status = normalizeStatus(task.status)
    summary.total += 1
    if (['completed', 'done'].includes(status)) summary.completed += 1
    else summary.active += 1
    return summary
  }, { total: 0, active: 0, completed: 0 })
}
