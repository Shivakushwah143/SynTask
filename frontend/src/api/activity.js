import api from './axios'

export const activityAPI = {
  // Get activity timeline
  getTimeline: async (filters = {}) => {
    const params = new URLSearchParams()
    const entityType = String(filters.entity_type || '').trim()
    if (entityType && entityType !== 'all') params.append('entity_type', entityType)
    const entityId = String(filters.entity_id || '').trim()
    if (entityId) params.append('entity_id', entityId)
    const days = Number(filters.days)
    if (Number.isFinite(days) && days > 0) params.append('days', String(days))
    const skip = Number(filters.skip)
    if (Number.isFinite(skip) && skip > 0) params.append('skip', String(skip))
    const limit = Number(filters.limit)
    if (Number.isFinite(limit) && limit > 0) params.append('limit', String(limit))

    const response = await api.get(`/activity/timeline?${params.toString()}`)
    return response.data
  },
}
