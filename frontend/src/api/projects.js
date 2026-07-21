import api from './axios'

export const projectsApi = {
  // Projects
  getProjects: (params = {}) => {
    return api.get('/projects/', { params })
  },
  
  getProject: (id, params = {}) => {
    return api.get(`/projects/${id}`, { params })
  },
  
  createProject: (data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key])
      }
    })
    return api.post('/projects/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  
  updateProject: (id, data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key])
      }
    })
    return api.put(`/projects/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  
  deleteProject: (id) => {
    return api.delete(`/projects/${id}`)
  },
  
  // Epics
  getEpics: (projectId) => {
    return api.get(`/projects/${projectId}/epics`)
  },
  
  createEpic: (projectId, data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key])
      }
    })
    return api.post(`/projects/${projectId}/epics`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  
  // Sprints
  getSprints: (projectId, params = {}) => {
    return api.get(`/projects/${projectId}/sprints`, { params })
  },
  
  createSprint: (projectId, data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key])
      }
    })
    return api.post(`/projects/${projectId}/sprints`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  
  updateSprintState: (projectId, sprintId, state) => {
    const formData = new FormData()
    formData.append('state', state)
    return api.patch(`/projects/${projectId}/sprints/${sprintId}/state`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  
  // Get projects for task creation (filtered by assignment)
  getProjectsForTaskCreation: () => {
    return api.get('/projects/for-task-creation')
  },
  
  // Get project board view
  getProjectBoard: (projectId) => {
    return api.get(`/projects/${projectId}/board`)
  },
  
  // Get project summary
  getProjectSummary: (projectId, days = 7) => {
    return api.get(`/projects/${projectId}/summary`, { params: { days } })
  },

  createProjectAgentRun: (data) => {
    return api.post('/agents/project/runs', data)
  },
  
  // Project Files
  getProjectFiles: (projectId) => {
    return api.get(`/projects/${projectId}/files`)
  },
  
  uploadProjectFile: (projectId, file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post(`/projects/${projectId}/files`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  
  deleteProjectFile: (projectId, fileId) => {
    return api.delete(`/projects/${projectId}/files/${fileId}`)
  },
  
  // Pages
  getPages: (projectId, params = {}) => {
    return api.get(`/projects/${projectId}/pages`, { params })
  },
  
  getPage: (projectId, pageId) => {
    return api.get(`/projects/${projectId}/pages/${pageId}`)
  },
  
  createPage: (projectId, data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key])
      }
    })
    return api.post(`/projects/${projectId}/pages`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  
  updatePage: (projectId, pageId, data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key])
      }
    })
    return api.put(`/projects/${projectId}/pages/${pageId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  
  deletePage: (projectId, pageId) => {
    return api.delete(`/projects/${projectId}/pages/${pageId}`)
  },
  
  // Board Columns
  getBoardColumns: (projectId) => {
    return api.get(`/projects/${projectId}/board-columns`)
  },
  
  createBoardColumn: (projectId, data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key])
      }
    })
    return api.post(`/projects/${projectId}/board-columns`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  
  updateBoardColumn: (projectId, columnId, data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key])
      }
    })
    return api.put(`/projects/${projectId}/board-columns/${columnId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  
  deleteBoardColumn: (projectId, columnId) => {
    return api.delete(`/projects/${projectId}/board-columns/${columnId}`)
  },
}
