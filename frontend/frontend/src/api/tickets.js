import api from './axios'

export const ticketsAPI = {
  // List tickets
  listTickets: async (filters = {}) => {
    const params = new URLSearchParams()
    if (filters.status) params.append('status_filter', filters.status)
    if (filters.priority) params.append('priority', filters.priority)
    if (filters.type) params.append('type_filter', filters.type)
    if (filters.assigned_to) params.append('assigned_to', filters.assigned_to)
    if (filters.skip) params.append('skip', filters.skip)
    if (filters.limit) params.append('limit', filters.limit)
    
    const response = await api.get(`/tickets/?${params.toString()}`)
    return response.data
  },

  // Get ticket by ID
  getTicket: async (ticketId) => {
    const response = await api.get(`/tickets/${ticketId}`)
    return response.data
  },

  // Create ticket
  createTicket: async (ticketData) => {
    const formData = new URLSearchParams()
    Object.keys(ticketData).forEach(key => {
      if (ticketData[key] !== null && ticketData[key] !== undefined && ticketData[key] !== '') {
        formData.append(key, ticketData[key])
      }
    })
    
    const response = await api.post('/tickets/', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // Update ticket status
  updateTicketStatus: async (ticketId, newStatus, resolution = null) => {
    const formData = new URLSearchParams()
    formData.append('new_status', newStatus)
    if (resolution) formData.append('resolution', resolution)
    
    const response = await api.patch(`/tickets/${ticketId}/status`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // Assign ticket
  assignTicket: async (ticketId, assignedTo) => {
    const formData = new URLSearchParams()
    // Allow empty string to unassign
    if (assignedTo) {
      formData.append('assigned_to', assignedTo)
    } else {
      formData.append('assigned_to', '')
    }
    
    const response = await api.post(`/tickets/${ticketId}/assign`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // Add comment to ticket
  addComment: async (ticketId, content, isInternal = false) => {
    const formData = new URLSearchParams()
    formData.append('content', content)
    formData.append('is_internal', isInternal)
    
    const response = await api.post(`/tickets/${ticketId}/comments`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // Get ticket comments
  getComments: async (ticketId) => {
    const response = await api.get(`/tickets/${ticketId}/comments`)
    return response.data
  },

  // Update ticket
  updateTicket: async (ticketId, ticketData) => {
    const formData = new URLSearchParams()
    Object.keys(ticketData).forEach(key => {
      if (ticketData[key] !== null && ticketData[key] !== undefined && ticketData[key] !== '') {
        formData.append(key, ticketData[key])
      }
    })
    
    const response = await api.put(`/tickets/${ticketId}`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // Delete ticket
  deleteTicket: async (ticketId) => {
    const response = await api.delete(`/tickets/${ticketId}`)
    return response.data
  },
}

