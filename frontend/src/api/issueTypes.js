import api from './axios'

export const issueTypesApi = {
  getIssueTypes: (params = {}) => {
    return api.get('/issue-types/', { params })
  },
  
  createIssueType: (data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key])
      }
    })
    return api.post('/issue-types/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
}


