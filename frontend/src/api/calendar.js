import api from './axios'

export const calendarApi = {
  getEvents: (params) => api.get('/calendar/events', { params }),
}
