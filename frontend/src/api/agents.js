import api from './axios'

export const agentsAPI = {
  listDefinitions: async (params = {}) => {
    const response = await api.get('/agents/definitions', { params })
    return response.data
  },

  listDefinitionVersions: async (agentId) => {
    const response = await api.get(`/agents/definitions/${agentId}/versions`)
    return response.data
  },

  createRun: async (data) => {
    const response = await api.post('/agents/runs', data)
    return response.data
  },

  createProjectRun: async (data) => {
    const response = await api.post('/agents/project/runs', data)
    return response.data
  },

  createEmailDraftRun: async (data) => {
    const response = await api.post('/agents/email-draft/runs', data)
    return response.data
  },

  createTaskPerformanceRun: async (data) => {
    const response = await api.post('/agents/task-performance/runs', data)
    return response.data
  },

  getRun: async (runId) => {
    const response = await api.get(`/agents/runs/${runId}`)
    return response.data
  },

  cancelRun: async (runId) => {
    const response = await api.post(`/agents/runs/${runId}/cancel`)
    return response.data
  },

  listRunEvents: async (runId) => {
    const response = await api.get(`/agents/runs/${runId}/events`)
    return response.data
  },

  listRunProposals: async (runId) => {
    const response = await api.get(`/agents/runs/${runId}/proposals`)
    return response.data
  },
}
