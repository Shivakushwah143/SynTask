import api from './axios'

export const timeTrackingApi = {
  getActive: () => api.get('/time-tracking/active'),
  start: (taskId) => {
    const formData = new FormData()
    formData.append('task_id', taskId)
    return api.post('/time-tracking/start', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  pause: () => api.post('/time-tracking/pause'),
  resume: () => api.post('/time-tracking/resume'),
  stop: (description) => {
    const formData = new FormData()
    if (description) formData.append('description', description)
    return api.post('/time-tracking/stop', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  manual: (data) => {
    const formData = new FormData()
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) formData.append(key, data[key])
    })
    return api.post('/time-tracking/manual', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  reportSummary: (params = {}) => api.get('/time-tracking/reports/summary', { params }),

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

