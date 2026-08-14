import api from './axios'

const toFormData = (data) => {
  const formData = new FormData()
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      // Append each array item under the same key so the backend receives a list.
      value.forEach((entry) => {
        if (entry !== undefined && entry !== null && entry !== '') formData.append(key, entry)
      })
    } else {
      formData.append(key, value)
    }
  })
  return formData
}

export const leavesAPI = {
  create: (data) => api.post('/leaves/', toFormData(data)),
  list: (params = {}) => api.get('/leaves/', { params }),
  myLeaves: (params = {}) => api.get('/leaves/my', { params }),
  // Phase 3 self-service: active leave types + own balances.
  leaveTypes: (params = {}) => api.get('/leaves/types', { params }),
  myBalances: () => api.get('/leaves/balances/me'),
  calendar: (params = {}) => api.get('/leaves/calendar', { params }),
  availability: (params = {}) => api.get('/leaves/availability', { params }),
  forwardTargets: () => api.get('/leaves/forward-targets'),
  approve: (id, comment = '') => api.post(`/leaves/${id}/approve`, toFormData({ comment })),
  reject: (id, comment = '') => api.post(`/leaves/${id}/reject`, toFormData({ comment })),
  forward: (id, data = {}) => api.post(`/leaves/${id}/forward`, toFormData(data)),
  cancel: (id) => api.post(`/leaves/${id}/cancel`),
}
