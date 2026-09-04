// Canonical Project lifecycle tabs, health/attention filters, and URL/query
// helpers for the Work -> Projects workspace. Lifecycle tabs map 1:1 to the
// backend Project lifecycle values (legacy `active`/`kickoff` stored statuses
// fold under Execution server-side); health levels and the derived
// `needs_setup` attention condition are separate dimensions so a project can
// be `execution` AND `at_risk` AND still have a plan.

export const PROJECT_LIFECYCLE_TABS = [
  { id: '', label: 'All Projects' },
  { id: 'created', label: 'Created' },
  { id: 'execution', label: 'Execution' },
  { id: 'review', label: 'Review' },
  { id: 'completed', label: 'Completed' },
  { id: 'reporting', label: 'Reporting' },
  { id: 'on_hold', label: 'On Hold' },
  { id: 'archived', label: 'Archived' },
  { id: 'cancelled', label: 'Cancelled' },
]

export const PROJECT_STATUS_LABELS = PROJECT_LIFECYCLE_TABS.slice(1).reduce((labels, tab) => {
  labels[tab.id] = tab.label
  return labels
}, {})

// Health is never a lifecycle status. Needs Setup is a derived attention
// condition (its own backend filter) and is listed here with the health
// quick-filters only for presentation; it maps to `attention=needs_setup`.
export const PROJECT_HEALTH_FILTERS = [
  { id: 'healthy', label: 'Healthy', kind: 'health' },
  { id: 'needs_attention', label: 'Needs Attention', kind: 'health' },
  { id: 'at_risk', label: 'At Risk', kind: 'health' },
  { id: 'needs_setup', label: 'Needs Setup', kind: 'attention' },
]

// Stage accent colors (dots / active fills) kept with the canonical tab data
// so the pipeline, board columns, and cards can share one palette.
export const PROJECT_STAGE_COLORS = {
  created: '#8B5CF6',
  execution: '#3B82F6',
  review: '#F59E0B',
  completed: '#10B981',
  reporting: '#14B8A6',
  on_hold: '#F97316',
  archived: '#6B7280',
  cancelled: '#EF4444',
}

export const EMPTY_ADVANCED_FILTERS = {
  client_id: '',
  owner_id: '',
  priority: '',
  type: '',
  delivery: '',
}

export function tabCount(summary, tabId) {
  if (!summary) return 0
  if (!tabId) return Number(summary.all || 0)
  return Number(summary[tabId] || 0)
}

export function healthFilterCount(summary, filter) {
  if (!summary) return 0
  return Number(summary[filter.id] || 0)
}

// Read URL state -> { status, health, attention, view, search, page, filters }.
// Unknown values are tolerated (server answers 400) except view which falls
// back to 'list'.
export function readProjectsRouteState(searchParams) {
  const params = searchParams || new URLSearchParams()
  const health = (params.get('health') || '').trim().toLowerCase()
  const attention = (params.get('attention') || '').trim().toLowerCase()
  return {
    status: (params.get('status') || '').trim().toLowerCase(),
    health: PROJECT_HEALTH_FILTERS.some((item) => item.id === health) ? health : '',
    attention: attention === 'needs_setup' ? attention : '',
    view: params.get('view') === 'board' ? 'board' : 'list',
    search: (params.get('q') || '').trim(),
    page: Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1),
    filters: {
      client_id: params.get('client_id') || '',
      owner_id: params.get('owner_id') || '',
      priority: params.get('priority') || '',
      type: params.get('type') || '',
      delivery: params.get('delivery') || '',
    },
  }
}

export function writeProjectsRouteState(searchParams, next) {
  const params = new URLSearchParams(searchParams || undefined)
  const set = (key, value) => {
    if (value) params.set(key, value)
    else params.delete(key)
  }
  set('status', next.status)
  set('health', next.health)
  set('attention', next.attention)
  set('view', next.view)
  set('q', next.search)
  set('client_id', next.filters?.client_id)
  set('owner_id', next.filters?.owner_id)
  set('priority', next.filters?.priority)
  set('type', next.filters?.type)
  set('delivery', next.filters?.delivery)
  set('page', next.page && next.page > 1 ? String(next.page) : '')
  return params
}

export function patchProjectsRoute(searchParams, patch, { replace = false } = {}) {
  const current = readProjectsRouteState(searchParams)
  const nextParams = writeProjectsRouteState(searchParams, { ...current, ...patch, filters: { ...current.filters, ...(patch.filters || {}) } })
  return { nextParams, replace }
}

// Backend list query from route state + pagination.
export function buildProjectQueryParams({ status = '', health = '', attention = '', search = '', filters = {}, page = 1, pageSize = 12 }) {
  const params = {}
  if (status) params.status = status
  if (health) params.health = health
  if (attention === 'needs_setup') params.attention = 'needs_setup'
  const { client_id, owner_id, priority, type, delivery } = filters
  if (client_id) params.client_id = client_id
  if (owner_id) params.owner_id = owner_id
  if (priority) params.priority = priority
  if (type) params.type = type
  if (delivery) params.delivery = delivery
  if (search && search.trim()) params.search = search.trim()
  params.skip = (page - 1) * pageSize
  params.limit = pageSize
  return params
}

export function activeProjectFilterCount({ status = '', health = '', attention = '', search = '', filters = {} }) {
  let count = 0
  if (status) count += 1
  if (health) count += 1
  if (attention) count += 1
  const { client_id, owner_id, priority, type, delivery } = filters
  if (client_id) count += 1
  if (owner_id) count += 1
  if (priority) count += 1
  if (type) count += 1
  if (delivery) count += 1
  if (search && search.trim()) count += 1
  return count
}

export function emptyProjectsStateMessage({ status = '', health = '', attention = '', search = '', filters = {} }) {
  const hasFilters = activeProjectFilterCount({ status, health, attention, search, filters })
  if (!hasFilters) {
    return 'No Projects yet. Create your first project to get started.'
  }
  if (status && !health && !attention && activeProjectFilterCount({ status, search, filters }) === 1) {
    return `No Projects are currently in ${PROJECT_STATUS_LABELS[status] || status}.`
  }
  if (attention === 'needs_setup') {
    return 'All Projects have an execution plan.'
  }
  if (health) {
    const label = PROJECT_HEALTH_FILTERS.find((item) => item.id === health)?.label || health
    return `No accessible Projects are currently ${label}.`
  }
  return 'No Projects match the selected filters.'
}
