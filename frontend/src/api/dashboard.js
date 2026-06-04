import api from './axios'

export const dashboardAPI = {
  // Get dashboard statistics
  getStats: async () => {
    const response = await api.get('/dashboard/stats')
    return response.data
  },

  // Get super admin analytics
  getSuperAdminAnalytics: async () => {
    const response = await api.get('/dashboard/super-admin/analytics')
    return response.data
  },
}

