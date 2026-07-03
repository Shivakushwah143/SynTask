import api from './axios'

export const crmApi = {
  getDashboard: () => api.get('/crm/dashboard'),
  getPipeline: () => api.get('/crm/pipeline'),
  updatePipelineStage: (leadId, payload) => api.patch(`/crm/pipeline/${leadId}/stage`, payload),
  getPipelineHistory: (leadId) => api.get(`/crm/pipeline/history/${leadId}`),
  getLeadTimeline: (leadId) => api.get(`/crm/leads/${leadId}/timeline`),
  getLeadFiles: (leadId) => api.get(`/crm/leads/${leadId}/files`),
  uploadLeadFile: (leadId, payload) => api.post(`/crm/leads/${leadId}/files`, payload),
  deleteLeadFile: (leadId, fileId) => api.delete(`/crm/leads/${leadId}/files/${fileId}`),
  getLeadNotes: (leadId) => api.get(`/crm/leads/${leadId}/notes`),
  createLeadNote: (leadId, payload) => api.post(`/crm/leads/${leadId}/notes`, payload),
  updateLeadNote: (leadId, noteId, payload) => api.patch(`/crm/leads/${leadId}/notes/${noteId}`, payload),
  deleteLeadNote: (leadId, noteId) => api.delete(`/crm/leads/${leadId}/notes/${noteId}`),
}
