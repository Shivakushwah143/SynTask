import api from './axios'

export const companiesAPI = {
  // List all companies
  listCompanies: async (statusFilter = null, skip = 0, limit = 20) => {
    const params = new URLSearchParams()
    if (statusFilter) params.append('status_filter', statusFilter)
    params.append('skip', skip)
    params.append('limit', limit)
    
    const response = await api.get(`/companies/?${params.toString()}`)
    return response.data
  },

  // Get company by ID
  getCompany: async (companyId) => {
    const response = await api.get(`/companies/${companyId}`)
    return response.data
  },

  // Register new company
  registerCompany: async (companyData) => {
    // Backend expects URL-encoded form data, not JSON
    const formData = new URLSearchParams()
    
    Object.entries(companyData).forEach(([key, value]) => {
      if (value === undefined || value === null) return
      
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed !== '') {
          formData.append(key, trimmed)
        }
      } else {
        formData.append(key, String(value))
      }
    })
    
    console.log('📤 Sending company form data:', formData.toString())
    
    const response = await api.post('/companies/register', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    console.log('✅ Registration response:', response.data)
    return response.data
  },

  // Approve company and create admin
  approveCompany: async (companyId, adminData) => {
    // Backend expects URL-encoded form data
    const formData = new URLSearchParams()
    Object.keys(adminData).forEach(key => {
      if (adminData[key]) {
        formData.append(key, adminData[key])
      }
    })
    
    const response = await api.post(`/companies/${companyId}/approve`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // Update company status
  updateCompanyStatus: async (companyId, newStatus) => {
    const params = new URLSearchParams({ new_status: newStatus })
    const response = await api.patch(`/companies/${companyId}/status?${params.toString()}`)
    return response.data
  },
}

