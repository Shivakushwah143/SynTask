import api from './axios'

export const dashboardAPI = {
  // Get dashboard statistics
  getStats: async () => {
    const response = await api.get('/dashboard/stats')
    return response.data
  },

  getMetrics: async () => {
    const response = await api.get('/dashboard/metrics')
    return response.data
  },

  getRecent: async () => {
    const response = await api.get('/dashboard/recent')
    return response.data
  },

  getActivity: async () => {
    const response = await api.get('/dashboard/activity')
    return response.data
  },

  // Get super admin analytics
  getSuperAdminAnalytics: async () => {
    const response = await api.get('/dashboard/super-admin/analytics')
    return response.data
  },
}

