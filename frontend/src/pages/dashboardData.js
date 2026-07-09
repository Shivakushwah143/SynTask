import { addDays, format, isValid, parseISO, startOfDay } from 'date-fns'

const PRIORITIES = ['high', 'medium', 'low']
const PROJECT_STATUSES = ['active', 'planning', 'completed', 'on_hold']

const normalizePriority = (priority) => {
  const value = String(priority || '').toLowerCase()
  if (value === 'critical') return 'high'
  return PRIORITIES.includes(value) ? value : 'low'
}

const parseDate = (value) => {
  if (!value) return null
  const date = typeof value === 'string' ? parseISO(value) : new Date(value)
  return isValid(date) ? date : null
}

export function buildTaskDuePriorityData(tasks, today = new Date(), days = 7) {
  const start = startOfDay(today)
  const buckets = Array.from({ length: days }, (_, index) => {
    const date = addDays(start, index)
    return {
      date: format(date, 'MMM d'),
      isoDate: format(date, 'yyyy-MM-dd'),
      high: 0,
      medium: 0,
      low: 0,
      route: '/tasks',
    }
  })

  tasks.forEach((task) => {
    const dueDate = parseDate(task.due_date)
    if (!dueDate) return
    const isoDate = format(dueDate, 'yyyy-MM-dd')
    const bucket = buckets.find((item) => item.isoDate === isoDate)
    if (!bucket) return
    bucket[normalizePriority(task.priority)] += 1
  })

  return buckets.filter((bucket) => bucket.high || bucket.medium || bucket.low)
}

export function buildProjectHealthData(projects) {
  return projects.map((project) => {
    const status = String(project.status || 'active').toLowerCase().replace(/\s+/g, '_')
    const value = Number(project.task_count ?? project.tasks_count ?? project.tasks?.length ?? 0)
    const row = {
      id: project.id,
      name: project.name || 'Untitled project',
      status,
      tasks: value,
      route: project.id ? `/projects/${project.id}/board` : '/projects',
    }

    PROJECT_STATUSES.forEach((key) => {
      row[key] = key === status ? value : 0
    })
    if (!PROJECT_STATUSES.includes(status)) row.active = value
    return row
  })
}

export const DASHBOARD_PROJECT_STATUSES = PROJECT_STATUSES
