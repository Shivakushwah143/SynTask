import api from './axios'

const toFormData = (payload = {}) => {
  const formData = new URLSearchParams()
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      formData.append(key, value)
    }
  })
  return formData
}

export const tasksAPI = {
  // List tasks
  listTasks: async (filters = {}) => {
    const params = new URLSearchParams()
    if (filters.status) params.append('status_filter', filters.status)
    if (filters.priority) params.append('priority', filters.priority)
    if (filters.assigned_to) params.append('assigned_to', filters.assigned_to)
    if (filters.reviewer_id) params.append('reviewer_id', filters.reviewer_id)
    if (filters.created_by) params.append('created_by', filters.created_by)
    if (filters.department_id) params.append('department_id', filters.department_id)
    if (filters.project_id) params.append('project_id', filters.project_id)
    if (filters.review_required !== undefined) params.append('review_required', filters.review_required)
    if (filters.blocked !== undefined) params.append('blocked', filters.blocked)
    if (filters.overdue !== undefined) params.append('overdue', filters.overdue)
    if (filters.due_today !== undefined) params.append('due_today', filters.due_today)
    if (filters.critical !== undefined) params.append('critical', filters.critical)
    if (filters.awaiting_review !== undefined) params.append('awaiting_review', filters.awaiting_review)
    if (filters.exclude_follow_up !== undefined) params.append('exclude_follow_up', filters.exclude_follow_up)
    if (filters.source_type) params.append('source_type', filters.source_type)
    if (filters.assignment_source) params.append('assignment_source', filters.assignment_source)
    if (filters.search) params.append('search', filters.search)
    if (filters.due_from) params.append('due_from', filters.due_from)
    if (filters.due_to) params.append('due_to', filters.due_to)
    if (filters.skip) params.append('skip', filters.skip)
    if (filters.limit) params.append('limit', filters.limit)

    const query = params.toString()
    const response = await api.get(query ? `/tasks/?${query}` : '/tasks/')
    return response.data
  },

  // Lifecycle + attention counts for the Tasks workspace (backend scoped).
  // Pass { project_id } to scope counts to a single Project Workspace.
  getStatusSummary: async (params = {}) => {
    const query = new URLSearchParams()
    if (params.project_id) query.append('project_id', params.project_id)
    const suffix = query.toString() ? `?${query.toString()}` : ''
    const response = await api.get(`/tasks/status-summary${suffix}`)
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

  // Combined Task Health payload for the dashboard: health summary + team
  // completion + extension counts fetched with ONE request / one backend scan
  // instead of the previous three summary endpoints.
  getDashboardTaskHealth: async () => {
    const response = await api.get('/tasks/health/dashboard')
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
    const formData = toFormData(taskData)
    const response = await api.post('/tasks/', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // Create self-assigned task
  createSelfTask: async (taskData) => {
    const formData = toFormData(taskData)
    const response = await api.post('/tasks/self', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // Update task
  updateTask: async (taskId, taskData) => {
    const formData = toFormData(taskData)
    const response = await api.put(`/tasks/${taskId}`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // Update task status
  updateTaskStatus: async (taskId, newStatus) => {
    const formData = toFormData({ new_status: newStatus })
    
    const response = await api.patch(`/tasks/${taskId}/status`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  requestExtension: async (taskId, data) => {
    const formData = toFormData({
      requested_due_date: data.requested_due_date,
      reason: data.reason,
    })
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
    const formData = toFormData({ comment })
    const response = await api.post(`/tasks/extension-requests/${requestId}/approve`, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    return response.data
  },

  rejectExtensionRequest: async (requestId, comment = '') => {
    const formData = toFormData({ comment })
    const response = await api.post(`/tasks/extension-requests/${requestId}/reject`, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    return response.data
  },

  // Add comment to task
  addComment: async (taskId, content) => {
    const formData = toFormData({ content })
    
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
    const formData = toFormData({ file_url: fileUrl })
    
    const response = await api.post(`/tasks/${taskId}/attachments`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // Production: update completed quantity for a quantitative task
  updateProductionProgress: async (taskId, data) => {
    const response = await api.post(`/tasks/${taskId}/production-progress`, data)
    return response.data
  },

  // Production: get aggregated production dashboard (Admin/Manager only)
  getProductionDashboard: async () => {
    const response = await api.get('/tasks/production/dashboard')
    return response.data
  },

  // Phase 2: semantic workflow actions

  startTask: async (taskId) => {
    const response = await api.post(`/tasks/${taskId}/start`)
    return response.data
  },

  submitForReview: async (taskId, reviewerId = null, proof = null) => {
    const formData = toFormData({ reviewer_id: reviewerId, proof_name: proof?.name, proof_value: proof?.value })
    const response = await api.post(`/tasks/${taskId}/submit-review`, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return response.data
  },

  getProofs: async (taskId) => {
    const response = await api.get(`/tasks/${taskId}/proofs`)
    return response.data
  },

  createProof: async (taskId, { name, value, category = 'text', context = 'progress_update' }) => {
    const formData = toFormData({ name, value, context, category })
    const response = await api.post(`/tasks/${taskId}/proofs`, formData, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    return response.data
  },

  requestRevision: async (taskId, reason) => {
    const formData = toFormData({ reason })
    const response = await api.post(`/tasks/${taskId}/request-revision`, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return response.data
  },

  approveTask: async (taskId, comment = '') => {
    const formData = toFormData({ comment })
    const response = await api.post(`/tasks/${taskId}/approve`, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return response.data
  },

  completeTask: async (taskId) => {
    const response = await api.post(`/tasks/${taskId}/complete`)
    return response.data
  },

  reopenTask: async (taskId, reason = '') => {
    const formData = toFormData({ reason })
    const response = await api.post(`/tasks/${taskId}/reopen`, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return response.data
  },

  cancelTask: async (taskId) => {
    const response = await api.post(`/tasks/${taskId}/cancel`)
    return response.data
  },

  // Checklist operations
  addChecklistItem: async (taskId, text, required = false) => {
    const formData = toFormData({ text, required })
    const response = await api.post(`/tasks/${taskId}/checklist`, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return response.data
  },

  updateChecklistItem: async (taskId, itemId, { completed, text } = {}) => {
    const payload = {}
    if (completed !== undefined) payload.completed = completed
    if (text !== undefined) payload.text = text
    const formData = toFormData(payload)
    const response = await api.patch(`/tasks/${taskId}/checklist/${itemId}`, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return response.data
  },

  deleteChecklistItem: async (taskId, itemId) => {
    const response = await api.delete(`/tasks/${taskId}/checklist/${itemId}`)
    return response.data
  },

  // Dependency operations
  addDependency: async (taskId, dependencyId) => {
    const formData = toFormData({ dependency_id: dependencyId })
    const response = await api.post(`/tasks/${taskId}/dependencies`, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return response.data
  },

  removeDependency: async (taskId, dependencyId) => {
    const response = await api.delete(`/tasks/${taskId}/dependencies/${dependencyId}`)
    return response.data
  },
}
