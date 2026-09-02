import api from './axios'

export const workRequestsAPI = {
  list: async (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.append(key, value)
    })
    const query = params.toString()
    const response = await api.get(query ? `/work-requests/?${query}` : '/work-requests/')
    return response.data
  },

  get: async (requestId) => {
    const response = await api.get(`/work-requests/${requestId}`)
    return response.data
  },

  create: async (payload) => {
    const response = await api.post('/work-requests/', payload)
    return response.data
  },

  startReview: async (requestId) => {
    const response = await api.post(`/work-requests/${requestId}/start-review`)
    return response.data
  },

  approve: async (requestId, reason = '') => {
    const response = await api.post(`/work-requests/${requestId}/approve`, { reason })
    return response.data
  },

  reject: async (requestId, reason) => {
    const response = await api.post(`/work-requests/${requestId}/reject`, { reason })
    return response.data
  },

  cancel: async (requestId, reason = '') => {
    const response = await api.post(`/work-requests/${requestId}/cancel`, { reason })
    return response.data
  },

  convert: async (requestId, payload) => {
    const response = await api.post(`/work-requests/${requestId}/convert`, payload)
    return response.data
  },
}
