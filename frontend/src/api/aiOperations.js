import api from './axios'

export const aiOperationsAPI = {
  // GET /ai-operations/overview?days=&agent=
  overview: async (params = {}) => {
    const response = await api.get('/ai-operations/overview', { params })
    return response.data
  },

  // GET /ai-operations/traces?days=&agent=&status=&error_type=&limit=&offset=
  listTraces: async (params = {}) => {
    const response = await api.get('/ai-operations/traces', { params })
    return response.data
  },

  // GET /ai-operations/traces/{trace_id}
  getTrace: async (trace_id) => {
    const response = await api.get(`/ai-operations/traces/${trace_id}`)
    return response.data
  },

  // GET /ai-operations/agents?days=
  agents: async (params = {}) => {
    const response = await api.get('/ai-operations/agents', { params })
    return response.data?.agents || []
  },

  // GET /ai-operations/tools?days=
  tools: async (params = {}) => {
    const response = await api.get('/ai-operations/tools', { params })
    return response.data?.tools || []
  },

  // GET /ai-operations/provider?days=
  provider: async (params = {}) => {
    const response = await api.get('/ai-operations/provider', { params })
    return response.data
  },
}

export const AI_OPS_RANGE_PRESETS = [
  { label: 'Last 24 hours', days: 1 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
]
