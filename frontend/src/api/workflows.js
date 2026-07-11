import api from './axios'

export const workflowsApi = {
  // Workflow Statuses
  getStatuses: (params = {}) => {
    return api.get('/workflows/statuses', { params })
  },
  
  createStatus: (data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key])
      }
    })
    return api.post('/workflows/statuses', formData)
  },
  updateStatus: (id, data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key])
      }
    })
    return api.patch(`/workflows/statuses/${id}`, formData)
  },
  deleteStatus: (id) => api.delete(`/workflows/statuses/${id}`),
  
  // Workflow Transitions
  getTransitions: (params = {}) => {
    return api.get('/workflows/transitions', { params })
  },
  
  createTransition: (data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key])
      }
    })
    return api.post('/workflows/transitions', formData)
  },
  updateTransition: (id, data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key])
      }
    })
    return api.patch(`/workflows/transitions/${id}`, formData)
  },
  deleteTransition: (id) => api.delete(`/workflows/transitions/${id}`),
  
  // Workflows
  getWorkflows: (params = {}) => {
    return api.get('/workflows/', { params })
  },
  
  getWorkflow: (id) => {
    return api.get(`/workflows/${id}`)
  },
  
  createWorkflow: (data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        if (key === 'status_ids' || key === 'transition_ids') {
          // Handle arrays
          data[key].forEach((item, index) => {
            formData.append(`${key}[${index}]`, item)
          })
        } else {
          formData.append(key, data[key])
        }
      }
    })
    return api.post('/workflows/', formData)
  },
  updateWorkflow: (id, data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key])
      }
    })
    return api.patch(`/workflows/${id}`, formData)
  },
  
  toggleWorkflow: (id) => {
    return api.patch(`/workflows/${id}/activate`)
  },
  deleteWorkflow: (id) => api.delete(`/workflows/${id}`),
}
