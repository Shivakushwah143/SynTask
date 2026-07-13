import api from './axios'

export const timelineAPI = {
  getEmployeeTimeline: (userId, params = {}) => api.get(`/timeline/employee/${userId}`, { params }),
}
