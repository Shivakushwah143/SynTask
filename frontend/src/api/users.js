import api from './axios'

export const usersAPI = {
  // List users
  listUsers: async (companyId = null, role = null, status = null, skip = 0, limit = 20) => {
    const params = new URLSearchParams()
    if (companyId) params.append('company_id', companyId)
    if (role) params.append('role', role)
    if (status) params.append('status', status)
    params.append('skip', skip)
    params.append('limit', limit)
    
    const response = await api.get(`/users/?${params.toString()}`)
    return response.data
  },

  // Get user by ID
  getUser: async (userId) => {
    const response = await api.get(`/users/detail/${userId}`)
    return response.data
  },

  // Create Lead
  createLead: async (userData) => {
    const formData = new URLSearchParams()
    Object.keys(userData).forEach(key => {
      if (userData[key]) {
        formData.append(key, userData[key])
      }
    })
    
    const response = await api.post('/users/create-lead', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // Create Employee
  createEmployee: async (userData) => {
    const formData = new URLSearchParams()
    Object.keys(userData).forEach(key => {
      if (userData[key]) {
        formData.append(key, userData[key])
      }
    })
    
    const response = await api.post('/users/create-employee', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // Create User with hierarchical role support
  createUser: async (userData) => {
    const formData = new URLSearchParams()
    Object.keys(userData).forEach(key => {
      if (userData[key]) {
        formData.append(key, userData[key])
      }
    })

    const response = await api.post('/users/create-user', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    return response.data
  },

  // Update user status
  updateUserStatus: async (userId, newStatus) => {
    const response = await api.patch(`/users/detail/${userId}/status`, {
      new_status: newStatus
    })
    return response.data
  },

  // Delete user (soft delete)
  deleteUser: async (userId) => {
    const response = await api.delete(`/users/detail/${userId}`)
    return response.data
  },

  // Update user (basic profile fields)
  updateUser: async (userId, userData) => {
    const formData = new URLSearchParams()
    Object.keys(userData).forEach(key => {
      if (userData[key] !== undefined && userData[key] !== null) {
        formData.append(key, userData[key])
      }
    })
    
    const response = await api.put(`/users/detail/${userId}`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // Get my team (for Leads)
  getMyTeam: async () => {
    const response = await api.get('/users/my-team')
    return response.data
  },

  // Get assignable users (for task/ticket assignment)
  getAssignableUsers: async (forTickets = false, projectId = null) => {
    const params = new URLSearchParams()
    if (forTickets) params.append('for_tickets', 'true')
    if (projectId) params.append('project_id', projectId)
    const response = await api.get(`/users/assignable?${params.toString()}`)
    return response.data
  },
}
