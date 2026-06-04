import api from './axios'

export const webhooksApi = {
  getWebhooks: (params = {}) => {
    return api.get('/webhooks/', { params })
  },
  
  getWebhook: (id) => {
    return api.get(`/webhooks/${id}`)
  },
  
  createWebhook: (data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        if (key === 'events' || key === 'headers') {
          formData.append(key, JSON.stringify(data[key]))
        } else {
          formData.append(key, data[key])
        }
      }
    })
    return api.post('/webhooks/', formData)
  },
  
  toggleWebhook: (id) => {
    return api.patch(`/webhooks/${id}/activate`)
  },
  
  deleteWebhook: (id) => {
    return api.delete(`/webhooks/${id}`)
  },
  
  getDeliveries: (id, params = {}) => {
    return api.get(`/webhooks/${id}/deliveries`, { params })
  },
}

