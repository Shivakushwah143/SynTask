import { differenceInCalendarDays, format, isValid, parseISO, startOfDay } from 'date-fns'
import { timeService } from '@/services/timeService'

const PROJECT_STATUSES = ['created', 'planning', 'active', 'kickoff', 'execution', 'review', 'completed', 'reporting', 'on_hold', 'archived']
export const TASK_PRIORITY_COLORS = {
  critical: '#991B1B',
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#2FB47C',
}

const normalizePriority = (priority) => {
  const value = String(priority || '').toLowerCase()
  return TASK_PRIORITY_COLORS[value] ? value : 'low'
}

const titleCase = (value) => String(value).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

const getTaskId = (task) => task.id || task._id

const getTaskTitle = (task) => task.title || task.name || 'Untitled task'

const truncate = (value, limit = 18) => {
  const text = String(value)
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text
}

const parseDate = (value) => {
  if (!value) return null
  const date = timeService.instant(value)
  return isValid(date) ? date : null
}

export function buildTaskDuePriorityData(tasks, today = timeService.now(), days = 7) {
  const start = startOfDay(today)
  return tasks
    .map((task) => {
      const dueDate = parseDate(task.due_date)
      if (!dueDate) return null
      const daysUntilDue = differenceInCalendarDays(startOfDay(dueDate), start)
      if (daysUntilDue < 0 || daysUntilDue >= days) return null
      const priorityKey = normalizePriority(task.priority)
      const taskId = getTaskId(task)
      const title = getTaskTitle(task)
      return {
        id: taskId,
        name: title,
        shortName: truncate(title),
        priority: titleCase(priorityKey),
        priorityKey,
        daysRemaining: daysUntilDue + 1,
        dueDate: format(dueDate, 'MMM d'),
        fill: TASK_PRIORITY_COLORS[priorityKey],
        route: taskId ? `/tasks/${taskId}` : '/tasks',
      }
    })
    .filter(Boolean)
    .sort((first, second) => first.daysRemaining - second.daysRemaining || first.name.localeCompare(second.name))
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
