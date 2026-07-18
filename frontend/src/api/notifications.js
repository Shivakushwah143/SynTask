import api from './axios'

export const notificationsAPI = {
  // List notifications
  listNotifications: async (isRead = null, skip = 0, limit = 20) => {
    const params = new URLSearchParams()
    if (isRead !== null) params.append('is_read', isRead)
    params.append('skip', skip)
    params.append('limit', limit)
    
    const response = await api.get(`/notifications/?${params.toString()}`)
    return response.data
  },

  // Mark notification as read
  markAsRead: async (notificationId) => {
    const response = await api.patch(`/notifications/${notificationId}/read`)
    return response.data
  },

  // Mark all as read
  markAllAsRead: async () => {
    const response = await api.post('/notifications/mark-all-read')
    return response.data
  },

  // Delete notification
  deleteNotification: async (notificationId) => {
    const response = await api.delete(`/notifications/${notificationId}`)
    return response.data
  },

  listReminderToasts: async () => {
    const response = await api.get('/notifications/reminder-toasts')
    return response.data
  },

  acknowledgeReminderToasts: async (notificationIds = []) => {
    const response = await api.post('/notifications/reminder-toasts/ack', { notification_ids: notificationIds })
    return response.data
  },
}

