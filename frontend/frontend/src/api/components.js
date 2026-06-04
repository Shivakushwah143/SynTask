import api from './axios'

export const componentsApi = {
  getComponents: (projectId) => {
    return api.get(`/components/projects/${projectId}/components`)
  },
  
  createComponent: (projectId, data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key])
      }
    })
    return api.post(`/components/projects/${projectId}/components`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
}


