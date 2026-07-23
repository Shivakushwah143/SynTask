import api from './axios'

export const googleWorkspaceApi = {
  getDashboard: () => api.get('/google-workspace/dashboard'),
  getConnection: () => api.get('/google-workspace/connection'),
  getSettings: () => api.get('/google-workspace/settings'),
  reconnect: (payload) => api.post('/google-workspace/settings/reconnect', payload),
  disconnect: () => api.post('/google-workspace/settings/disconnect'),
  refreshTokens: () => api.post('/google-workspace/settings/refresh-tokens'),
  diagnostics: () => api.post('/google-workspace/settings/diagnostics'),
  listGmail: (params) => api.get('/google-workspace/gmail', { params }),
  sendMail: (payload) => api.post('/google-workspace/gmail/send', payload),
  saveDraft: (payload) => api.post('/google-workspace/gmail/drafts', payload),
  toggleStar: (mailId, starred) => api.post(`/google-workspace/gmail/${mailId}/star`, { starred }),
  getCalendar: (params) => api.get('/google-workspace/calendar', { params }),
  createCalendarEvent: (payload) => api.post('/google-workspace/calendar/events', payload),
  updateCalendarEvent: (eventId, payload) => api.patch(`/google-workspace/calendar/events/${eventId}`, payload),
  deleteCalendarEvent: (eventId) => api.delete(`/google-workspace/calendar/events/${eventId}`),
  createTaskFromEvent: (eventId) => api.post(`/google-workspace/calendar/events/${eventId}/task`),
  createEventFromTask: (taskId) => api.post(`/google-workspace/tasks/${taskId}/calendar-event`),
  createMeet: (payload) => api.post('/google-workspace/meet', payload),
}