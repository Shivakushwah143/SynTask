import api from './axios'

export const aiAPI = {
  generateTaskPrioritization: async (payload = {}) => {
    const response = await api.post('/ai/task-prioritization', payload)
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
