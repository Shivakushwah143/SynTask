export const TASK_VIEW_PARAM = 'view'
export const TASK_SEARCH_PARAM = 'q'
export const TASK_FILTER_KEYS = ['status', 'priority', 'assigned_to', 'department_id', 'due_from', 'due_to']
const TASK_VIEW_VALUES = new Set(['list', 'board'])

export function readTaskRouteState(searchParams) {
  const getValue = (key) => String(searchParams?.get?.(key) || '').trim()
  const view = TASK_VIEW_VALUES.has(getValue(TASK_VIEW_PARAM)) ? getValue(TASK_VIEW_PARAM) : 'list'
  const filters = TASK_FILTER_KEYS.reduce((acc, key) => {
    const value = getValue(key)
    if (value) acc[key] = value
    return acc
  }, {})

  return {
    view,
    searchQuery: getValue(TASK_SEARCH_PARAM),
    filters,
  }
}

export function writeTaskRouteState(currentParams, nextState = {}) {
  const next = new URLSearchParams(currentParams || '')
  const setIfValue = (key, value) => {
    if (value === undefined || value === null || value === '') {
      next.delete(key)
      return
    }
    next.set(key, String(value))
  }

  setIfValue(TASK_VIEW_PARAM, nextState.view)
  setIfValue(TASK_SEARCH_PARAM, nextState.searchQuery)

  TASK_FILTER_KEYS.forEach((key) => {
    setIfValue(key, nextState.filters?.[key])
  })

  return next
}
