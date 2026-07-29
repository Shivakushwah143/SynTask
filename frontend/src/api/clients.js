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

  // Get client workspace
  getWorkspace: async (clientId) => {
    const response = await api.get(`/clients/${clientId}/workspace`)
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
  updateClientStatus: async (clientId, status) => {
    const formData = new FormData()
    formData.append('status', status)
    const response = await api.put(`/clients/${clientId}`, formData)
    return response.data
  },

  // Delete client document
  deleteDocument: async (clientId, documentIndex) => {
    const response = await api.delete(`/clients/${clientId}/documents/${documentIndex}`)
    return response.data
  },
}
