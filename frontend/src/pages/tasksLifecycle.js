// Canonical Task lifecycle tabs, attention conditions, and query helpers for
// the Tasks workspace. Lifecycle tabs map 1:1 to backend TaskStatus values;
// attention conditions (Blocked/Overdue/Due Today/Critical) are NOT statuses
// and stay separate so a task can be in_progress AND blocked AND overdue at
// the same time.

export const LIFECYCLE_TABS = [
  { id: '', label: 'All Tasks' },
  { id: 'todo', label: 'To Do' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'In Review' },
  { id: 'revision_required', label: 'Revision Required' },
  { id: 'approved', label: 'Approved' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
]

export const STATUS_LABELS = LIFECYCLE_TABS.slice(1).reduce((labels, tab) => {
  labels[tab.id] = tab.label
  return labels
}, {})

// Active lifecycle columns shown on the Board; Cancelled stays reachable from
// its own tab and is excluded from the active board per the redesign spec.
export const BOARD_STATUSES = LIFECYCLE_TABS.slice(1, 8)

// Attention conditions are page-like quick views: each has its own accent
// color and appearance so the group reads as separate destinations (like the
// lifecycle tabs) rather than filter chips. They are still NOT task statuses.
export const ATTENTION_FILTERS = [
  {
    id: 'blocked',
    label: 'Blocked',
    dotClass: 'bg-slate-400',
    activeClass:
      'border-slate-500 bg-slate-600 text-white shadow-sm dark:border-slate-500 dark:bg-slate-600',
    idleClass:
      'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600',
  },
  {
    id: 'overdue',
    label: 'Overdue',
    dotClass: 'bg-orange-500',
    activeClass:
      'border-orange-500 bg-orange-500 text-white shadow-sm dark:border-orange-500 dark:bg-orange-500',
    idleClass:
      'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 hover:text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300 dark:hover:bg-orange-900/40',
  },
  {
    id: 'due_today',
    label: 'Due Today',
    dotClass: 'bg-amber-500',
    activeClass:
      'border-amber-500 bg-amber-500 text-white shadow-sm dark:border-amber-500 dark:bg-amber-500',
    idleClass:
      'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40',
  },
  {
    id: 'critical',
    label: 'Critical',
    dotClass: 'bg-red-500',
    activeClass:
      'border-red-500 bg-red-600 text-white shadow-sm dark:border-red-500 dark:bg-red-600',
    idleClass:
      'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/40',
  },
]

export const ATTENTION_TO_QUERY = {
  blocked: { blocked: true },
  overdue: { overdue: true },
  due_today: { due_today: true },
  critical: { critical: true },
}

export function tabCount(summary, tabId) {
  if (!summary) return 0
  if (!tabId) return Number(summary.all || 0)
  return Number(summary[tabId] || 0)
}

export function attentionCount(summary, attentionId) {
  if (!summary) return 0
  return Number(summary[attentionId] || 0)
}

// Build the backend list query (filters + attention + search + pagination).
// Lifecycle status stays a separate dimension from attention conditions.
export function buildTaskQueryParams({ filters = {}, attention = '', search = '', page = 1, pageSize = 20 }) {
  const params = {}
  if (filters.status) params.status = filters.status
  if (filters.priority) params.priority = filters.priority
  if (filters.assigned_to) params.assigned_to = filters.assigned_to
  if (filters.department_id) params.department_id = filters.department_id
  if (filters.project_id) params.project_id = filters.project_id
  if (filters.due_from) params.due_from = filters.due_from
  if (filters.due_to) params.due_to = filters.due_to
  const attentionQuery = ATTENTION_TO_QUERY[attention]
  if (attentionQuery) Object.assign(params, attentionQuery)
  // Sales follow-up items are not standalone tasks and never appear on the
  // Tasks page, so the server-side total matches the tab counts.
  params.exclude_follow_up = true
  if (search && search.trim()) params.search = search.trim()
  params.skip = (page - 1) * pageSize
  params.limit = pageSize
  return params
}

export function activeFilterCount(filters = {}, attention = '', search = '') {
  let count = 0
  if (filters.status) count += 1
  if (filters.priority) count += 1
  if (filters.assigned_to) count += 1
  if (filters.department_id) count += 1
  if (filters.project_id) count += 1
  if (filters.due_from || filters.due_to) count += 1
  if (attention) count += 1
  if (search && search.trim()) count += 1
  return count
}

// Empty-state copy: status tabs get a status-specific message, attention
// filters a dedicated message, everything else falls back to the generic one.
export function emptyStateMessage({ filters = {}, attention = '', search = '' }) {
  const hasFilters = activeFilterCount(filters, attention, search) > 0
  if (!hasFilters) {
    return 'No tasks yet. Create your first task to get started.'
  }
  if (filters.status && !attention && activeFilterCount(filters, '', search) === 1) {
    return `No Tasks are currently in ${STATUS_LABELS[filters.status] || filters.status}.`
  }
  if (attention) {
    const label = ATTENTION_FILTERS.find((item) => item.id === attention)?.label || attention
    return `No tasks match the ${label} attention filter.`
  }
  return 'No Tasks match the selected filters.'
}

// Project-scoped empty-state copy for the Project Workspace Tasks view.
// Same lifecycle/attention semantics as the global page, with project context.
export function projectEmptyStateMessage({ filters = {}, attention = '', search = '' }) {
  const hasFilters = activeFilterCount(filters, attention, search) > 0
  if (!hasFilters) {
    return 'No Tasks have been created for this Project yet.'
  }
  if (filters.status && !attention && activeFilterCount(filters, '', search) === 1) {
    return `No Tasks are currently in ${STATUS_LABELS[filters.status] || filters.status}.`
  }
  if (attention) {
    const label = ATTENTION_FILTERS.find((item) => item.id === attention)?.label || attention
    return `No Project Tasks are currently ${label.toLowerCase()}.`
  }
  return 'No Tasks match the selected filters for this Project.'
}