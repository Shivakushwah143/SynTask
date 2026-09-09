import api from './axios'

export const contentProductionApi = {
  // ── Main workspace (lifecycle tabs + overview) ──────────────────────────
  getWorkspace: (params = {}) => api.get('/content', { params }),
  getItem: (itemId) => api.get(`/content/${itemId}`),
  getAllowedTransitions: (itemId) => api.get(`/content/${itemId}/allowed-transitions`),

  // ── Calendar view (backward-compatible) ─────────────────────────────────
  getCalendar: (params = {}) => api.get('/content/calendar', { params }),

  // ── CRUD ────────────────────────────────────────────────────────────────
  createItem: (payload) => api.post('/content', payload),
  updateItem: (itemId, payload) => api.patch(`/content/${itemId}`, payload),
  deleteItem: (itemId) => api.delete(`/content/${itemId}`),

  // ── Lifecycle transitions ───────────────────────────────────────────────
  transitionStatus: (itemId, payload) => api.post(`/content/${itemId}/transition`, payload),

  // ── Reviews ─────────────────────────────────────────────────────────────
  internalReview: (itemId, payload) => api.post(`/content/${itemId}/internal-review`, payload),
  clientReview: (itemId, payload) => api.post(`/content/${itemId}/client-review`, payload),

  // ── Versions ────────────────────────────────────────────────────────────
  createVersion: (itemId, payload) => api.post(`/content/${itemId}/versions`, payload),

  // ── Library ─────────────────────────────────────────────────────────────
  getLibrary: (params = {}) => api.get('/content/library', { params }),

  // ── Templates ───────────────────────────────────────────────────────────
  getTemplates: (params = {}) => api.get('/content/templates', { params }),
  createTemplate: (payload) => api.post('/content/templates', payload),
  updateTemplate: (templateId, payload) => api.patch(`/content/templates/${templateId}`, payload),
  deleteTemplate: (templateId) => api.delete(`/content/templates/${templateId}`),
}
