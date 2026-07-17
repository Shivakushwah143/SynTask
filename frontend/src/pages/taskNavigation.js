export function resolveTaskBackTarget(historyState, fallbackPath = '/tasks') {
  return historyState && typeof historyState.idx === 'number' && historyState.idx > 0 ? null : fallbackPath
}

export function resolveTaskCloseFallback(projectId) {
  return projectId ? `/projects/${projectId}/board` : '/tasks'
}

export function buildTaskShareUrl(href) {
  const url = new URL(href)
  url.search = ''
  url.hash = ''
  return url.toString()
}
