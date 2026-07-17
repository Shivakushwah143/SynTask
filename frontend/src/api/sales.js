import api from './axios'
import { crmApi } from './crm'

const toFormData = (data) => {
  const formData = new FormData()
  Object.entries(data || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    formData.append(key, Array.isArray(value) ? value.join('|') : value)
  })
  return formData
}

const toProspectFormData = (data) => {
  const formData = toFormData(data)
  const today = new Date().toISOString().slice(0, 10)
  const defaults = {
    category_id: ' ',
    product_ids: ' ',
    interest_level: 'medium',
    estimated_close_date: today,
    assigned_to: '',
    current_stage: 'new',
    email: '',
    contact_id: '',
    due_date: '',
    due_time: '',
    remark: '',
    company_name: '',
    crm_company_id: '',
    relationship_type: '',
    channel: '',
    designation: '',
    nationality: '',
    language: '',
    owner_name: '',
    owner_contact_no: '',
    tag: '',
    greeting_preference: '',
    custom_fields: '',
  }

  Object.entries(defaults).forEach(([key, fallback]) => {
    if (!formData.has(key)) formData.append(key, fallback)
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
  createProspect: (data) => api.post('/sales/prospects/', data instanceof FormData ? data : toProspectFormData(data)),
  bulkUploadProspects: (payload) => {
    if (payload instanceof FormData) {
      return api.post('/sales/prospects/bulk-upload', payload)
    }

    const formData = new FormData()
    if (payload?.file) formData.append('file', payload.file)
    if (payload?.strategy) formData.append('strategy', payload.strategy)
    if (payload?.target_user_id) formData.append('target_user_id', payload.target_user_id)
    if (payload?.target_department_id) formData.append('target_department_id', payload.target_department_id)
    return api.post('/sales/prospects/bulk-upload', formData)
  },
  previewBulkUploadProspects: (payload) => {
    const formData = new FormData()
    if (payload?.file) formData.append('file', payload.file)
    if (payload?.strategy) formData.append('strategy', payload.strategy)
    if (payload?.target_user_id) formData.append('target_user_id', payload.target_user_id)
    if (payload?.target_department_id) formData.append('target_department_id', payload.target_department_id)
    return api.post('/sales/prospects/bulk-upload/preview', formData)
  },
  getImportHistory: () => api.get('/sales/prospects/imports'),
  retryImportJob: (id) => api.post(`/sales/prospects/imports/${id}/retry`),
  updateProspect: (id, data) => api.put(`/sales/prospects/${id}`, data),
  updateProspectForm: (id, data) => api.put(`/sales/prospects/${id}`, toFormData(data)),
  updateStage: (id, stageId) => {
    return crmApi.updatePipelineStage(id, { stage: stageId })
  },
  getDuplicateProspects: (params) => api.get('/sales/prospects/duplicates', { params }),
  mergeProspects: (payload) => api.post('/sales/prospects/merge', payload),
  getProspectReport: (params) => api.get('/sales/reports/prospect', { params }),
  getSalesReport: (params) => api.get('/sales/reports/sales', { params }),
  getActivityReport: (params) => api.get('/sales/reports/team-activity', { params }),
  getLostReport: (params) => api.get('/sales/reports/lost', { params }),
  getInventoryReport: (params) => api.get('/sales/reports/inventory', { params }),
  getStages: () => api.get('/sales/masters/stages'),
  createStage: (data) => api.post('/sales/masters/stages', toFormData(data)),
  updateStageMaster: (stageId, data) => api.put(`/sales/masters/stages/${stageId}`, toFormData(data)),
  deleteStageMaster: (stageId) => api.delete(`/sales/masters/stages/${stageId}`),
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

// Canonical Lead methods use legacy endpoints to preserve API behavior.
salesApi.getLeads = salesApi.getProspects
salesApi.getLead = salesApi.getProspect
salesApi.createLead = salesApi.createProspect
salesApi.bulkUploadLeads = salesApi.bulkUploadProspects
salesApi.previewBulkUploadLeads = salesApi.previewBulkUploadProspects
salesApi.updateLead = salesApi.updateProspect
salesApi.updateLeadForm = salesApi.updateProspectForm
salesApi.getDuplicateLeads = salesApi.getDuplicateProspects
salesApi.mergeLeads = salesApi.mergeProspects
salesApi.getLeadReport = salesApi.getProspectReport

// Temporary compatibility aliases above retain Prospect-named consumers.
