import api from './axios'

export const activityAPI = {
  // Get activity timeline
  getTimeline: async (filters = {}) => {
    const params = new URLSearchParams()
    if (filters.entity_type) params.append('entity_type', filters.entity_type)
    if (filters.entity_id) params.append('entity_id', filters.entity_id)
    if (filters.days) params.append('days', filters.days)
    if (filters.skip) params.append('skip', filters.skip)
    if (filters.limit) params.append('limit', filters.limit)
    
    const response = await api.get(`/activity/timeline?${params.toString()}`)
    return response.data
  },
}

