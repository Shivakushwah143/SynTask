import api from './axios'

export const timesheetApi = {
  createEntry: (data) => api.post('/timesheet/entries', data),
  getMine: (params) => api.get('/timesheet/my-timesheet', { params }),
  getTeam: (params) => api.get('/timesheet/team-timesheet', { params }),
  list: (params) => api.get('/timesheet/list', { params }),
  deleteEntry: (id) => api.delete(`/timesheet/entries/${id}`),
}
