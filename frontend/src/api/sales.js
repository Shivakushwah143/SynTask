import api from './axios'

const toFormData = (data) => {
  const formData = new FormData()
  Object.entries(data || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    formData.append(key, Array.isArray(value) ? value.join('|') : value)
  })
  return formData
}

export const salesApi = {
  getOverview: () => api.get('/sales/dashboard'),
  getContacts: (params) => api.get('/sales/contacts/', { params }),
  getContact: (id) => api.get(`/sales/contacts/${id}`),
  createContact: (data) => api.post('/sales/contacts/', data),
  updateContact: (id, data) => api.put(`/sales/contacts/${id}`, data),
  deleteContact: (id) => api.delete(`/sales/contacts/${id}`),
  shareContact: (data) => api.post('/sales/contacts/share', data),
  getProspects: (params) => api.get('/sales/prospects/', { params }),
  getProspect: (id) => api.get(`/sales/prospects/${id}`),
  createProspect: (data) => api.post('/sales/prospects/', data instanceof FormData ? data : toFormData(data)),
  updateProspect: (id, data) => api.put(`/sales/prospects/${id}`, data),
  updateStage: (id, stageId) => {
    const formData = new FormData()
    formData.append('current_stage', stageId)
    return api.put(`/sales/prospects/${id}`, formData)
  },
  bulkUploadProspects: (data) => api.post('/sales/prospects/bulk-upload', data),
  getProspectReport: (params) => api.get('/sales/reports/prospect', { params }),
  getSalesReport: (params) => api.get('/sales/reports/sales', { params }),
  getActivityReport: (params) => api.get('/sales/reports/team-activity', { params }),
  getLostReport: (params) => api.get('/sales/reports/lost', { params }),
  getInventoryReport: (params) => api.get('/sales/reports/inventory', { params }),
  getStages: () => api.get('/sales/masters/stages'),
  createStage: (data) => api.post('/sales/masters/stages', toFormData(data)),
  getTags: () => api.get('/sales/masters/tags'),
  createTag: (data) => api.post('/sales/masters/tags', toFormData(data)),
  getChannels: () => api.get('/sales/masters/channels'),
  createChannel: (data) => api.post('/sales/masters/channels', toFormData(data)),
  getLostReasons: () => api.get('/sales/masters/reasons-for-lost'),
  getCategories: () => api.get('/sales/categories/'),
  createCategory: (data) => api.post('/sales/categories/', null, { params: { name: data.name } }),
  getProducts: () => api.get('/sales/products/'),
  createProduct: (data) => api.post('/sales/products/', Array.isArray(data) ? data : [data]),
}
