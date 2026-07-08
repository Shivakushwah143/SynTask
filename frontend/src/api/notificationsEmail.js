import api from './axios'

const unwrap = (response) => response.data

export const notificationsEmailApi = {
  preview: (payload) => api.post('/notifications/email/preview', payload).then(unwrap),
  send: (payload) => api.post('/notifications/email/send', payload).then(unwrap),
  templates: () => api.get('/notifications/templates').then(unwrap),
  history: (params) => api.get('/notifications/history', { params }).then(unwrap),
  test: () => api.post('/notifications/test').then(unwrap),
}
