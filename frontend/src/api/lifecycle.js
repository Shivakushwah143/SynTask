import api from './axios'

/**
 * Phase 9 — Employee Lifecycle API client.
 *
 * Every lifecycle change is an explicit business action (never a generic
 * PATCH), so each function maps to one backend endpoint. The backend remains
 * authoritative for state transitions, permissions, and company scope.
 */
export const lifecycleApi = {
  // --- HR read ---
  getEmployeeLifecycle: (employeeId) => api.get(`/employees/${employeeId}/lifecycle`),
  getLifecycleCurrent: (employeeId) => api.get(`/employees/${employeeId}/lifecycle/current`),
  getOffboarding: (employeeId) => api.get(`/employees/${employeeId}/lifecycle/offboarding`),
  completeOffboardingItem: (employeeId, itemKey, payload) =>
    api.post(`/employees/${employeeId}/lifecycle/offboarding/items/${itemKey}/complete`, payload || {}),
  cancelUpcomingEvent: (employeeId, eventId) =>
    api.post(`/employees/${employeeId}/lifecycle/events/${eventId}/cancel`, {}),

  // --- HR actions ---
  confirm: (employeeId, payload) => api.post(`/employees/${employeeId}/confirm`, payload),
  extendProbation: (employeeId, payload) => api.post(`/employees/${employeeId}/extend-probation`, payload),
  promote: (employeeId, payload) => api.post(`/employees/${employeeId}/promote`, payload),
  changeDesignation: (employeeId, payload) => api.post(`/employees/${employeeId}/designation`, payload),
  transfer: (employeeId, payload) => api.post(`/employees/${employeeId}/transfer`, payload),
  changeManager: (employeeId, payload) => api.post(`/employees/${employeeId}/change-manager`, payload),
  changeEmploymentType: (employeeId, payload) => api.post(`/employees/${employeeId}/employment-type`, payload),
  changeWorkDetails: (employeeId, payload) => api.post(`/employees/${employeeId}/work-details`, payload),
  acceptResignation: (employeeId, separationId, payload) =>
    api.post(`/employees/${employeeId}/resignations/${separationId}/accept`, payload),
  rejectResignation: (employeeId, separationId, payload) =>
    api.post(`/employees/${employeeId}/resignations/${separationId}/reject`, payload),
  terminate: (employeeId, payload) => api.post(`/employees/${employeeId}/terminate`, payload),
  exit: (employeeId, payload) => api.post(`/employees/${employeeId}/exit`, payload),

  // --- Self-service (My HR) ---
  submitMyResignation: (payload) => api.post('/lifecycle/me/resignations', payload),
  withdrawMyResignation: (separationId) => api.post(`/lifecycle/me/resignations/${separationId}/withdraw`, {}),
  getMyLifecycle: () => api.get('/lifecycle/me'),
}

export default lifecycleApi
