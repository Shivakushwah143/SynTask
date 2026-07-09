const PRIORITY_ORDER = ['low', 'medium', 'high', 'critical', 'urgent']

export const AI_BRIEFING_PRIORITY_COLORS = {
  urgent: '#7F1D1D',
  critical: '#991B1B',
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#2FB47C',
  default: '#4285F4',
}

const normalizePriority = (priority) => {
  const value = String(priority || 'medium').toLowerCase()
  return AI_BRIEFING_PRIORITY_COLORS[value] ? value : 'medium'
}

const titleCase = (value) => String(value).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

const higherPriority = (current, next) => (
  PRIORITY_ORDER.indexOf(next) > PRIORITY_ORDER.indexOf(current) ? next : current
)

export function buildBriefingChartData(tasks) {
  const groups = new Map()

  tasks.forEach((task) => {
    const label = task.status || 'unknown'
    const priority = normalizePriority(task.priority)
    const existing = groups.get(label) || { label, value: 0, priorityKey: priority }
    existing.value += 1
    existing.priorityKey = higherPriority(existing.priorityKey, priority)
    groups.set(label, existing)
  })

  return Array.from(groups.values()).map((item) => ({
    ...item,
    priority: titleCase(item.priorityKey === 'urgent' ? 'critical' : item.priorityKey),
    color: AI_BRIEFING_PRIORITY_COLORS[item.priorityKey] || AI_BRIEFING_PRIORITY_COLORS.default,
  }))
}
