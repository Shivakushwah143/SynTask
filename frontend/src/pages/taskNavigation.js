export function resolveTaskBackTarget(historyState, fallbackPath = '/tasks') {
  return historyState && typeof historyState.idx === 'number' && historyState.idx > 0 ? null : fallbackPath
}
