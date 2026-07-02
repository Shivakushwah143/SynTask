import api from './axios'

export const crmApi = {
  getDashboard: () => api.get('/crm/dashboard'),
  getPipeline: () => api.get('/crm/pipeline'),
  updatePipelineStage: (leadId, payload) => api.patch(`/crm/pipeline/${leadId}/stage`, payload),
  getPipelineHistory: (leadId) => api.get(`/crm/pipeline/history/${leadId}`),
}
