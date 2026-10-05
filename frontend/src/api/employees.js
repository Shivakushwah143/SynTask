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

  // ── Change Request endpoints ──────────────────────────────────────────
  /** Submit a change request for own profile */
  createMyChangeRequest: (payload) => api.post('/employees/me/change-requests', payload),
  /** List own change requests */
  listMyChangeRequests: (params) => api.get('/employees/me/change-requests', { params }),
  /** List change requests pending review (admin/manager scope) */
  listReviewQueue: (params) => api.get('/employees/change-requests', { params }),
  /** Get full details of a single change request */
  getChangeRequest: (id) => api.get(`/employees/change-requests/${id}`),
  /** Approve a pending change request */
  approveChangeRequest: (id, payload = {}) => api.post(`/employees/change-requests/${id}/approve`, payload),
  /** Reject a pending change request */
  rejectChangeRequest: (id, payload = {}) => api.post(`/employees/change-requests/${id}/reject`, payload),
  /** Cancel a pending change request (requester only) */
  cancelChangeRequest: (id) => api.post(`/employees/change-requests/${id}/cancel`),
}

export default employeesApi
