import api from './axios'

export const tasksAPI = {
  // List tasks
  listTasks: async (filters = {}) => {
    const params = new URLSearchParams()
    if (filters.status) params.append('status_filter', filters.status)
    if (filters.priority) params.append('priority', filters.priority)
    if (filters.assigned_to) params.append('assigned_to', filters.assigned_to)
    if (filters.created_by) params.append('created_by', filters.created_by)
    if (filters.department_id) params.append('department_id', filters.department_id)
    if (filters.skip) params.append('skip', filters.skip)
    if (filters.limit) params.append('limit', filters.limit)
    
    const response = await api.get(`/tasks/?${params.toString()}`)
    return response.data
  },

  // Get task by ID
  getTask: async (taskId) => {
    const response = await api.get(`/tasks/${taskId}`)
    return response.data
  },

  getMyTaskHealth: async () => {
    const response = await api.get('/tasks/health/me')
    return response.data
  },

  getTaskHealthSummary: async () => {
    const response = await api.get('/tasks/health/summary')
    return response.data
  },

  getTeamCompletionSummary: async () => {
    const response = await api.get('/tasks/health/team-completion')
    return response.data
  },

  getOverdueTaskSummary: async () => {
    const response = await api.get('/tasks/health/overdue')
    return response.data
  },

  getExtensionRequestSummary: async () => {
    const response = await api.get('/tasks/health/extensions')
    return response.data
  },

  // Create task
  createTask: async (taskData) => {
    const formData = new URLSearchParams()
    Object.keys(taskData).forEach(key => {
      if (taskData[key] !== null && taskData[key] !== undefined && taskData[key] !== '') {
        formData.append(key, taskData[key])
      }
    })
    
    const response = await api.post('/tasks/', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // Update task
  updateTask: async (taskId, taskData) => {
    const formData = new URLSearchParams()
    Object.keys(taskData).forEach(key => {
      if (taskData[key] !== null && taskData[key] !== undefined && taskData[key] !== '') {
        formData.append(key, taskData[key])
      }
    })
    
    const response = await api.put(`/tasks/${taskId}`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // Update task status
  updateTaskStatus: async (taskId, newStatus) => {
    const formData = new URLSearchParams()
    formData.append('new_status', newStatus)
    
    const response = await api.patch(`/tasks/${taskId}/status`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  requestExtension: async (taskId, data) => {
    const formData = new URLSearchParams()
    formData.append('requested_due_date', data.requested_due_date)
    formData.append('reason', data.reason)
    const response = await api.post(`/tasks/${taskId}/extension-requests`, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    return response.data
  },

  listExtensionRequests: async (taskId) => {
    const response = await api.get(`/tasks/${taskId}/extension-requests`)
    return response.data
  },

  approveExtensionRequest: async (requestId, comment = '') => {
    const formData = new URLSearchParams()
    if (comment) formData.append('comment', comment)
    const response = await api.post(`/tasks/extension-requests/${requestId}/approve`, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    return response.data
  },

  rejectExtensionRequest: async (requestId, comment = '') => {
    const formData = new URLSearchParams()
    if (comment) formData.append('comment', comment)
    const response = await api.post(`/tasks/extension-requests/${requestId}/reject`, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    return response.data
  },

  // Add comment to task
  addComment: async (taskId, content) => {
    const formData = new URLSearchParams()
    formData.append('content', content)
    
    const response = await api.post(`/tasks/${taskId}/comments`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // Get task comments
  getComments: async (taskId) => {
    const response = await api.get(`/tasks/${taskId}/comments`)
    return response.data
  },

  // Delete task
  deleteTask: async (taskId) => {
    const response = await api.delete(`/tasks/${taskId}`)
    return response.data
  },

  // Get subtasks
  getSubtasks: async (taskId) => {
    const response = await api.get(`/tasks/${taskId}/subtasks`)
    return response.data
  },

  // Add task attachment
  addTaskAttachment: async (taskId, fileUrl) => {
    const formData = new URLSearchParams()
    formData.append('file_url', fileUrl)
    
    const response = await api.post(`/tasks/${taskId}/attachments`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },
}
