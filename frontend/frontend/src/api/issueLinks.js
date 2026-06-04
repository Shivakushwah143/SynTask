import api from './axios'

export const issueLinksApi = {
  getLinks: (taskId) => {
    return api.get(`/issue-links/tasks/${taskId}/links`)
  },
  
  createLink: (taskId, data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key])
      }
    })
    return api.post(`/issue-links/tasks/${taskId}/links`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  
  deleteLink: (linkId) => {
    return api.delete(`/issue-links/${linkId}`)
  },
}


