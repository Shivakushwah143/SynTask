import api from './axios'

const toFormData = (data) => {
  const formData = new FormData()
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') formData.append(key, value)
  })
  return formData
}

export const leavesAPI = {
  create: (data) => api.post('/leaves/', toFormData(data)),
  list: (params = {}) => api.get('/leaves/', { params }),
  calendar: (params = {}) => api.get('/leaves/calendar', { params }),
  availability: (params = {}) => api.get('/leaves/availability', { params }),
  approve: (id, comment = '') => api.post(`/leaves/${id}/approve`, toFormData({ comment })),
  reject: (id, comment = '') => api.post(`/leaves/${id}/reject`, toFormData({ comment })),
  forward: (id, comment = '') => api.post(`/leaves/${id}/forward`, toFormData({ comment })),
  cancel: (id) => api.post(`/leaves/${id}/cancel`),
}
