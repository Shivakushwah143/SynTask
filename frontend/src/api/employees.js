import api from './axios'

/**
 * Phase 1 HRMS — canonical Employee Profile API client.
 * All calls go to the backend /employees endpoints (real data, no mocks).
 */
export const employeesApi = {
  list: (params) => api.get('/employees', { params }),
  get: (id) => api.get(`/employees/${id}`),
  me: () => api.get('/employees/me'),
  // Phase 8 self-service: whitelisted personal-field update (own profile only).
  updateMe: (payload) => api.patch('/employees/me', payload),
  create: (payload) => api.post('/employees', payload),
  update: (id, payload) => api.patch(`/employees/${id}`, payload),
}

export default employeesApi
