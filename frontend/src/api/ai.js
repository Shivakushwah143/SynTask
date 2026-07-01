import api from './axios'

export const aiAPI = {
  generateTaskPrioritization: async (payload = {}) => {
    const response = await api.post('/ai/task-prioritization', payload)
    return response.data
  },

  generateTaskBreakdown: async (payload = {}) => {
    const response = await api.post('/ai/task-breakdown', payload)
    return response.data
  },

  generateBreakdown: async (payload = {}) => {
    const response = await api.post('/ai/breakdown', payload)
    return response.data
  },

  generateDailyReport: async (payload = {}) => {
    const response = await api.post('/ai/daily-report', payload)
    return response.data
  },

  chat: async (payload = {}) => {
    const response = await api.post('/ai/chat', payload)
    return response.data
  },

  listLogs: async (limit = 20) => {
    const response = await api.get(`/ai/logs?limit=${limit}`)
    return response.data
  },
}
