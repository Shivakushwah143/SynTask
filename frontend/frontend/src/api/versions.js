import api from './axios'

export const versionsApi = {
  getVersions: (projectId, params = {}) => {
    return api.get(`/versions/projects/${projectId}/versions`, { params })
  },
  
  createVersion: (projectId, data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key])
      }
    })
    return api.post(`/versions/projects/${projectId}/versions`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  
  releaseVersion: (versionId) => {
    return api.patch(`/versions/${versionId}/release`)
  },
}


