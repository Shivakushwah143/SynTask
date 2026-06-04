import api from './axios'

export const watchersApi = {
  getWatchers: (taskId) => {
    return api.get(`/watchers/tasks/${taskId}/watchers`)
  },
  
  addWatcher: (taskId) => {
    return api.post(`/watchers/tasks/${taskId}/watchers`)
  },
  
  removeWatcher: (taskId) => {
    return api.delete(`/watchers/tasks/${taskId}/watchers`)
  },
}


