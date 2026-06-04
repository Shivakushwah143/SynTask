import api from './axios'

export const automationApi = {
  getRules: (params = {}) => {
    return api.get('/automation/', { params })
  },
  
  getRule: (id) => {
    return api.get(`/automation/${id}`)
  },
  
  createRule: (data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        if (key === 'events' || key === 'conditions' || key === 'actions') {
          formData.append(key, JSON.stringify(data[key]))
        } else {
          formData.append(key, data[key])
        }
      }
    })
    return api.post('/automation/', formData)
  },
  
  updateRule: (id, data) => {
    return api.put(`/automation/${id}`, data)
  },
  
  toggleRule: (id) => {
    return api.patch(`/automation/${id}/activate`)
  },
  
  deleteRule: (id) => {
    return api.delete(`/automation/${id}`)
  },
  
  getExecutions: (id, params = {}) => {
    return api.get(`/automation/${id}/executions`, { params })
  },
}

