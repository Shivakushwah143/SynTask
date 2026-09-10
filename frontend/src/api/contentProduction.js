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

  // ── Published tab (driven by Publishing truth, not Content status) ─────
  getPublished: (params = {}) => api.get('/content/published', { params }),

  // ── Publishing info (read-oriented visibility inside Content) ──────────
  getPublishingRecord: (itemId) => api.get(`/content/${itemId}/publishing`),

  // ── Comments (separate from review decisions) ──────────────────────────
  getComments: (itemId, params = {}) => api.get(`/content/${itemId}/comments`, { params }),
  addComment: (itemId, payload) => api.post(`/content/${itemId}/comments`, payload),
  deleteComment: (commentId) => api.delete(`/content/comments/${commentId}`),

  // ── Relationship validation (dependent selects) ────────────────────────
  validateRelationships: (params = {}) => api.post('/content/validate-relationships', null, { params }),

  // ── Content Overview (operational command center — all backend-derived) ─
  getOverview: (params = {}) => api.get('/content/overview', { params }),
  getRecommendations: (params = {}) => api.get('/content/overview/recommendations', { params }),

  // ── Contextual AI (suggestions only — never mutates the item) ───────────
  getAIActions: (itemId) => api.get(`/content/${itemId}/ai-actions`),
  runAIAction: (itemId, action) => api.post(`/content/${itemId}/ai`, { action }),

  // ── Templates ───────────────────────────────────────────────────────────
  getTemplates: (params = {}) => api.get('/content/templates', { params }),
  createTemplate: (payload) => api.post('/content/templates', payload),
  updateTemplate: (templateId, payload) => api.patch(`/content/templates/${templateId}`, payload),
  deleteTemplate: (templateId) => api.delete(`/content/templates/${templateId}`),
}
