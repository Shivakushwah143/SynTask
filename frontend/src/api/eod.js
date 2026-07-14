import api from './axios'

const toFormData = (data) => {
  const formData = new URLSearchParams()
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null) formData.append(key, value)
  })
  return formData
}

export const eodAPI = {
  today: () => api.get('/eod/today'),
  mine: (reportDate) => api.get('/eod/mine', { params: reportDate ? { report_date: reportDate } : {} }),
  submit: (data) => api.post('/eod/', toFormData(data), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }),
  list: (params = {}) => api.get('/eod/', { params }),
  pending: (params = {}) => api.get('/eod/pending', { params }),
}
