import api from './axios'

export const contentCalendarApi = {
  getCalendar: (params = {}) => api.get('/content-calendar', { params }),
  listItems: (params = {}) => api.get('/content-calendar/items', { params }),
  createItem: (payload) => api.post('/content-calendar/items', payload),
  updateItem: (itemId, payload) => api.patch(`/content-calendar/items/${itemId}`, payload),
  deleteItem: (itemId) => api.delete(`/content-calendar/items/${itemId}`),
}
