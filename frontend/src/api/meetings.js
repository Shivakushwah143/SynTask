import api from './axios'

export const meetingsApi = {
  list: (params) => api.get('/meetings/', { params }),
  get: (id) => api.get(`/meetings/${id}`),
  create: (data) => api.post('/meetings/', data),
  update: (id, data) => api.patch(`/meetings/${id}`, data),
  cancel: (id) => api.post(`/meetings/${id}/cancel`),
  start: (id) => api.post(`/meetings/${id}/start`),
  complete: (id) => api.post(`/meetings/${id}/complete`),
  delete: (id) => api.delete(`/meetings/${id}`),
}
