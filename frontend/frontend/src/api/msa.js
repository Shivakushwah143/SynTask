import api from './axios'

export const msaAPI = {
  // Create MSA
  createMSA: async (formData) => {
    const response = await api.post('/msa', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  },

  // Send MSA
  sendMSA: async (msaId, formData) => {
    const response = await api.post(`/msa/${msaId}/send`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  },

  // Save as Template
  saveAsTemplate: async (msaId, templateName) => {
    const formData = new FormData()
    if (templateName) formData.append('template_name', templateName)
    const response = await api.post(`/msa/${msaId}/save-as-template`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  },

  // Download MSA
  downloadMSA: async (msaId) => {
    const response = await api.get(`/msa/${msaId}/download`, {
      responseType: 'blob'
    })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `MSA-${msaId}.pdf`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    return response.data
  },

  // List MSAs
  listMSAs: async (params = {}) => {
    const response = await api.get('/msa', { params })
    return response.data
  },

  // Get MSA details
  getMSA: async (msaId) => {
    const response = await api.get(`/msa/${msaId}`)
    return response.data
  },

  // Update MSA
  updateMSA: async (msaId, formData) => {
    const response = await api.put(`/msa/${msaId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  },

  // Delete MSA
  deleteMSA: async (msaId) => {
    const response = await api.delete(`/msa/${msaId}`)
    return response.data
  },

  // Upload stamp
  uploadStamp: async (msaId, file) => {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await api.post(`/msa/${msaId}/stamp`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  },

  // Add staffing company signature
  addStaffingSignature: async (msaId, signatureImage) => {
    const formData = new FormData()
    formData.append('signature_image', signatureImage)
    
    const response = await api.post(`/msa/${msaId}/staffing-signature`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  },

  // Send for signature
  sendForSignature: async (msaId) => {
    const response = await api.post(`/msa/${msaId}/send-for-signature`)
    return response.data
  },

  // Get MSA by token (public)
  getMSAByToken: async (token) => {
    const response = await api.get(`/msa/sign/${token}`)
    return response.data
  },

  // Client sign MSA (public)
  clientSignMSA: async (token, signatureImage, clientName) => {
    const formData = new FormData()
    formData.append('signature_image', signatureImage)
    if (clientName) formData.append('client_name', clientName)
    
    const response = await api.post(`/msa/sign/${token}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  },
}

