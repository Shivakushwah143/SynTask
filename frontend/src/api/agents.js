import api from './axios'

export const agentsAPI = {
  createEmailDraftRun: (data) => api.post('/agents/email-draft/runs', data),
  createTaskPerformanceRun: (data) => api.post('/agents/task-performance/runs', data),
}
