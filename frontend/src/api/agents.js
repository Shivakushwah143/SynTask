import api from './axios'

export const agentsAPI = {
  createEmailDraftRun: (data) => api.post('/agents/email-draft/runs', data),
}
