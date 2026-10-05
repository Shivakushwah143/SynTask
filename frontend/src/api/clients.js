import api from './axios'

export const clientsAPI = {
  // Create client
  createClient: async (formData) => {
    const response = await api.post('/clients', formData)
    return response.data
  },

  // List clients
  listClients: async (params = {}) => {
    const response = await api.get('/clients', { params })
    return response.data
  },

  // Get client details
  getClient: async (clientId) => {
    const response = await api.get(`/clients/${clientId}`)
    return response.data
  },

  getLifecycleRules: async () => {
    const response = await api.get('/clients/lifecycle/rules')
    return response.data
  },

  getOverviewDashboard: async (params = {}) => {
    const response = await api.get('/clients/overview/dashboard', { params })
    return response.data
  },

  getInsights: async (params = {}) => {
    const response = await api.get('/clients/insights/summary', { params })
    return response.data
  },

  runAutomation: async (params = {}) => {
    const response = await api.post('/clients/automation/run', null, { params })
    return response.data
  },

  listSavedViews: async () => {
    const response = await api.get('/clients/saved-views')
    return response.data
  },

  createSavedView: async (payload) => {
    const response = await api.post('/clients/saved-views', payload)
    return response.data
  },

  updateSavedView: async (viewId, payload) => {
    const response = await api.patch(`/clients/saved-views/${viewId}`, payload)
    return response.data
  },

  deleteSavedView: async (viewId) => {
    const response = await api.delete(`/clients/saved-views/${viewId}`)
    return response.data
  },

  // Get client workspace
  getWorkspace: async (clientId) => {
    const response = await api.get(`/clients/${clientId}/workspace`)
    return response.data
  },

  getActivity: async (clientId, params = {}) => {
    const response = await api.get(`/clients/${clientId}/activity`, { params })
    return response.data
  },

  getFinance: async (clientId) => {
    const response = await api.get(`/clients/${clientId}/finance`)
    return response.data
  },
  getHealth: async (clientId) => {
    const response = await api.get(`/clients/${clientId}/health`)
    return response.data
  },
  getAIBrief: async (clientId, params = {}) => {
    const response = await api.get(`/clients/${clientId}/ai/brief`, { params })
    return response.data
  },
  askAI: async (clientId, payload) => {
    const response = await api.post(`/clients/${clientId}/ai/ask`, payload)
    return response.data
  },
  updateNextActionStatus: async (clientId, payload) => {
    const response = await api.post(`/clients/${clientId}/next-action/status`, payload)
    return response.data
  },

  updateRenewal: async (clientId, payload) => {
    const response = await api.patch(`/clients/${clientId}/renewal`, payload)
    return response.data
  },

  startRenewal: async (clientId, payload = {}) => {
    const response = await api.post(`/clients/${clientId}/renewal/start`, payload)
    return response.data
  },

  markRenewed: async (clientId, payload = {}) => {
    const response = await api.post(`/clients/${clientId}/renewal/renewed`, payload)
    return response.data
  },

  markChurned: async (clientId, payload) => {
    const response = await api.post(`/clients/${clientId}/churn`, payload)
    return response.data
  },

  archiveClient: async (clientId, payload) => {
    const response = await api.post(`/clients/${clientId}/archive`, payload)
    return response.data
  },

  saveOnboardingData: async (clientId, values) => {
    const formData = new FormData()
    Object.entries(values || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) formData.append(key, value)
    })
    const response = await api.put(`/clients/${clientId}`, formData)
    return response.data
  },

  updateOnboardingData: async (clientId, values) => {
    const response = await api.patch(`/clients/${clientId}/onboarding/data`, values)
    return response.data
  },

  getOnboardingAssets: async (clientId) => {
    const response = await api.get(`/clients/${clientId}/onboarding/assets`)
    return response.data
  },

  addAssetSubmission: async (clientId, payload) => {
    const formData = new FormData()
    formData.append('source', payload.source || 'manual_upload')
    formData.append('requirement_ids', JSON.stringify(payload.requirement_ids || []))
    if (payload.received_from_contact_id) formData.append('received_from_contact_id', payload.received_from_contact_id)
    if (payload.received_by_user_id) formData.append('received_by_user_id', payload.received_by_user_id)
    if (payload.received_date) formData.append('received_date', payload.received_date)
    if (payload.notes) formData.append('notes', payload.notes)
    Array.from(payload.files || []).forEach((file) => formData.append('files', file))
    const response = await api.post(`/clients/${clientId}/onboarding/assets/submissions`, formData)
    return response.data
  },

  updateAssetRequirement: async (clientId, requirementId, payload) => {
    const response = await api.patch(`/clients/${clientId}/onboarding/assets/requirements/${requirementId}`, payload)
    return response.data
  },

  uploadAssetRequirementFiles: async (clientId, requirementId, payload) => {
    const files = Array.from(payload.files || [])
    if (!files.length) throw new Error('At least one file is required')
    const formData = new FormData()
    formData.append('source', payload.source || 'manual_upload')
    if (payload.received_from_contact_id) formData.append('received_from_contact_id', payload.received_from_contact_id)
    if (payload.received_date) formData.append('received_date', payload.received_date)
    if (payload.notes) formData.append('notes', payload.notes)
    files.forEach((file) => formData.append('files', file))
    const response = await api.post(`/clients/${clientId}/onboarding/assets/requirements/${requirementId}/files`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  generateAssetRequestLink: async (clientId, requirementId, payload = {}) => {
    const response = await api.post(`/clients/${clientId}/onboarding/assets/requirements/${requirementId}/request-link`, payload)
    return response.data
  },

  revokeAssetRequestLink: async (clientId, requirementId) => {
    const response = await api.post(`/clients/${clientId}/onboarding/assets/requirements/${requirementId}/request-link/revoke`)
    return response.data
  },

  getAssetUploadRequest: async (token) => {
    const response = await api.get(`/clients/asset-upload/${token}`, { allowUnauthenticated: true, skipAuthRefresh: true })
    return response.data
  },

  uploadAssetRequestFiles: async (token, payload = {}) => {
    const files = Array.from(payload.files || [])
    if (!files.length) throw new Error('At least one file is required')
    const formData = new FormData()
    if (payload.notes) formData.append('notes', payload.notes)
    files.forEach((file) => formData.append('files', file))
    const response = await api.post(`/clients/asset-upload/${token}`, formData, { allowUnauthenticated: true, skipAuthRefresh: true })
    return response.data
  },

  updateProfile: async (clientId, values) => {
    const response = await api.patch(`/clients/${clientId}/profile`, values)
    return response.data
  },

  setPrimaryContact: async (clientId, contactId) => {
    const formData = new FormData()
    formData.append('contact_id', contactId)
    const response = await api.patch(`/clients/${clientId}/onboarding/primary-contact`, formData)
    return response.data
  },

  updateContactRoles: async (clientId, contactId, roles) => {
    const response = await api.patch(`/clients/${clientId}/contacts/${contactId}/roles`, { roles })
    return response.data
  },

  listServices: async (clientId) => {
    const response = await api.get(`/clients/${clientId}/services`)
    return response.data
  },

  createService: async (clientId, payload) => {
    const response = await api.post(`/clients/${clientId}/services`, payload)
    return response.data
  },

  updateService: async (clientId, serviceId, payload) => {
    const response = await api.patch(`/clients/${clientId}/services/${serviceId}`, payload)
    return response.data
  },

  updateServiceStatus: async (clientId, serviceId, action) => {
    const response = await api.post(`/clients/${clientId}/services/${serviceId}/${action}`)
    return response.data
  },

  linkServiceProject: async (clientId, serviceId, projectId) => {
    const response = await api.post(`/clients/${clientId}/services/${serviceId}/projects`, { project_id: projectId })
    return response.data
  },

  unlinkServiceProject: async (clientId, serviceId, projectId) => {
    const response = await api.delete(`/clients/${clientId}/services/${serviceId}/projects/${projectId}`)
    return response.data
  },

  listDeliverables: async (clientId, params = {}) => {
    const response = await api.get(`/clients/${clientId}/deliverables`, { params })
    return response.data
  },

  createDeliverable: async (clientId, payload) => {
    const response = await api.post(`/clients/${clientId}/deliverables`, payload)
    return response.data
  },

  updateDeliverable: async (clientId, deliverableId, payload) => {
    const response = await api.patch(`/clients/${clientId}/deliverables/${deliverableId}`, payload)
    return response.data
  },

  linkDeliverableTasks: async (clientId, deliverableId, taskIds) => {
    const response = await api.post(`/clients/${clientId}/deliverables/${deliverableId}/tasks`, { task_ids: taskIds })
    return response.data
  },

  updateDeliverableStatus: async (clientId, deliverableId, status) => {
    const response = await api.post(`/clients/${clientId}/deliverables/${deliverableId}/status`, { status })
    return response.data
  },

  sendDeliverableReview: async (clientId, deliverableId, payload = {}) => {
    const response = await api.post(`/clients/${clientId}/deliverables/${deliverableId}/send-review`, payload)
    return response.data
  },

  approveDeliverable: async (clientId, deliverableId, payload = {}) => {
    const response = await api.post(`/clients/${clientId}/deliverables/${deliverableId}/approve`, payload)
    return response.data
  },

  requestDeliverableRevision: async (clientId, deliverableId, payload = {}) => {
    const response = await api.post(`/clients/${clientId}/deliverables/${deliverableId}/request-revision`, payload)
    return response.data
  },

  generateOnboardingDocument: async (clientId) => {
    const response = await api.post(`/clients/${clientId}/onboarding/document/generate`)
    return response.data
  },

  // Update client
  updateClient: async (clientId, formData) => {
    const response = await api.put(`/clients/${clientId}`, formData)
    return response.data
  },

  // Delete client
  deleteClient: async (clientId) => {
    const response = await api.delete(`/clients/${clientId}`)
    return response.data
  },

  // Add project to client
  addProjectToClient: async (clientId, projectId, budget, startDate, deliveryDate) => {
    const formData = new FormData()
    formData.append('project_id', projectId)
    if (budget) formData.append('budget', budget)
    if (startDate) formData.append('start_date', startDate)
    if (deliveryDate) formData.append('delivery_date', deliveryDate)
    
    const response = await api.post(`/clients/${clientId}/projects`, formData)
    return response.data
  },

  // Remove project from client
  removeProjectFromClient: async (clientId, projectId) => {
    const response = await api.delete(`/clients/${clientId}/projects/${projectId}`)
    return response.data
  },

  // Upload client document
  uploadDocument: async (clientId, file, documentName) => {
    const formData = new FormData()
    formData.append('file', file)
    if (documentName) formData.append('document_name', documentName)
    
    const response = await api.post(`/clients/${clientId}/documents`, formData)
    return response.data
  },

  // Update client status only
  updateClientStatus: async (clientId, status, reason = '', metadata = null) => {
    const formData = new FormData()
    formData.append('status', status)
    if (reason) formData.append('lifecycle_reason', reason)
    if (metadata) formData.append('lifecycle_metadata', JSON.stringify(metadata))
    const response = await api.put(`/clients/${clientId}`, formData)
    return response.data
  },

  // Delete client document
  deleteDocument: async (clientId, documentIndex) => {
    const response = await api.delete(`/clients/${clientId}/documents/${documentIndex}`)
    return response.data
  },
}
