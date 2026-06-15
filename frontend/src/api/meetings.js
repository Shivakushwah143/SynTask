import api from './axios'

export const meetingsApi = {
  list: (params) => api.get('/meetings/', { params }),
  get: (id) => api.get(`/meetings/${id}`),
  create: (data) => api.post('/meetings/', data),
  delete: (id) => api.delete(`/meetings/${id}`),
}
