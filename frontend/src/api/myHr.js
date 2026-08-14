import api from './axios'

/**
 * Phase 8 — Employee Self-Service (My HR) API client.
 *
 * Every call is self-scoped: the backend resolves the employee from the
 * authenticated user, never from request-supplied ids.
 */
export const myHrApi = {
  /** Own Employee Profile (Phase 1 detail DTO). */
  getMyProfile: () => api.get('/employees/me'),
  /** Whitelisted personal-field self-update (backend rejects HR-controlled fields). */
  updateMyProfile: (payload) => api.patch('/employees/me', payload),
  /** Lightweight My HR overview aggregate. */
  getMySummary: () => api.get('/hr/me/summary'),
  /** Own current/upcoming salary structure. */
  getMySalary: () => api.get('/salary/me'),
}

export default myHrApi
