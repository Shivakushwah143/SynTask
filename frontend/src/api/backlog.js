import api from './axios'

export const backlogApi = {
  getBacklog: (projectId, params = {}) => {
    return api.get(`/backlog/projects/${projectId}/backlog`, { params })
  },
  
  moveToSprint: (projectId, taskId, sprintId) => {
    const formData = new FormData()
    formData.append('sprint_id', sprintId)
    return api.post(`/backlog/projects/${projectId}/backlog/${taskId}/move-to-sprint`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  
  removeFromSprint: (projectId, taskId) => {
    return api.post(`/backlog/projects/${projectId}/backlog/${taskId}/remove-from-sprint`)
  },
}

