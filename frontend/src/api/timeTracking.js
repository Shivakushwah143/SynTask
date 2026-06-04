import api from './axios'

export const timeTrackingApi = {
  logTime: (taskId, data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key])
      }
    })
    return api.post(`/time-tracking/tasks/${taskId}/log-time`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  
  getTimeLogs: (taskId, params = {}) => {
    return api.get(`/time-tracking/tasks/${taskId}/time-logs`, { params })
  },
  
  getTimeSummary: (taskId) => {
    return api.get(`/time-tracking/tasks/${taskId}/time-summary`)
  },
  
  deleteTimeLog: (logId) => {
    return api.delete(`/time-tracking/time-logs/${logId}`)
  },
  
  getUserTimeLogs: (userId, params = {}) => {
    return api.get(`/time-tracking/users/${userId}/time-logs`, { params })
  },
}

