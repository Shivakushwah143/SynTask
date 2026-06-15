import api from './axios'

export const superadminApi = {
  getTenants: (params) => api.get('/superadmin/tenants/', { params }),
  getTenant: (id) => api.get(`/superadmin/tenants/${id}`),
  approveTenant: (id) => api.post(`/superadmin/tenants/${id}/approve`),
  suspendTenant: (id) => api.post(`/superadmin/tenants/${id}/suspend`),
  activateTenant: (id) => api.post(`/superadmin/tenants/${id}/activate`),
  updateTenantModules: (id, data) => api.put(`/superadmin/tenants/${id}/modules`, data),
  updateTenantSubscription: (id, data) => api.put(`/superadmin/tenants/${id}/subscription`, data),
  getPlans: () => api.get('/superadmin/plans/'),
  getPlan: (id) => api.get(`/superadmin/plans/${id}`),
  createPlan: (data) => api.post('/superadmin/plans/', data),
  updatePlan: (id, data) => api.put(`/superadmin/plans/${id}`, data),
  deletePlan: (id) => api.delete(`/superadmin/plans/${id}`),
  getUsageAnalytics: (params) => api.get('/superadmin/usage/analytics', { params }),
  getCompanyUsage: (id) => api.get(`/superadmin/usage/company/${id}`),
  getTransactions: (params) => api.get('/superadmin/billing/transactions', { params }),
  getRevenueAnalytics: (params) => api.get('/superadmin/billing/revenue/analytics', { params }),
}
