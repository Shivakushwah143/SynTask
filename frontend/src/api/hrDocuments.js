import api from './axios'

export function normalizeDocumentTypesResponse(response) {
  const payload = response?.data ?? response
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.data?.data)) return payload.data.data
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

/**
 * Phase 2 HRMS — HR Document Management API client.
 * All calls go to the real /hr backend endpoints (no mock data).
 */
export const hrDocumentsApi = {
  // ── Document types ────────────────────────────────────────────────────────
  listTypes: (params) => api.get('/hr/document-types', { params, suppressGlobalToast: true }),
  createType: (payload) => api.post('/hr/document-types', payload),
  updateType: (id, payload) => api.patch(`/hr/document-types/${id}`, payload),
  deactivateType: (id) => api.delete(`/hr/document-types/${id}`),

  // ── Employee documents (HR-managed) ──────────────────────────────────────
  listEmployeeDocuments: (employeeId, params) => api.get(`/hr/employees/${employeeId}/documents`, { params }),
  uploadEmployeeDocument: (employeeId, formData) => api.post(`/hr/employees/${employeeId}/documents`, formData),
  missingRequired: (employeeId) => api.get(`/hr/employees/${employeeId}/documents/missing-required`),

  // ── Employee self-service (My HR → My Documents) ─────────────────────────
  // The backend resolves the employee from the authenticated user; no
  // employee_id is ever sent from the client.
  listMyDocuments: (params) => api.get('/hr/me/documents', { params }),
  myDocumentStatus: () => api.get('/hr/me/documents/status'),
  uploadMyDocument: (formData) => api.post('/hr/me/documents', formData),

  // ── Candidate documents ───────────────────────────────────────────────────
  listCandidateDocuments: (candidateId, params) => api.get(`/hr/candidates/${candidateId}/documents`, { params }),
  uploadCandidateDocument: (candidateId, formData) => api.post(`/hr/candidates/${candidateId}/documents`, formData),

  // ── Documents ─────────────────────────────────────────────────────────────
  listDocuments: (params) => api.get('/hr/documents', { params }),
  getDocument: (id) => api.get(`/hr/documents/${id}`),
  updateDocument: (id, payload) => api.patch(`/hr/documents/${id}`, payload),
  replaceDocument: (id, formData) => api.post(`/hr/documents/${id}/replace`, formData),
  reviewDocument: (id, payload) => api.post(`/hr/documents/${id}/review`, payload),
  archiveDocument: (id) => api.post(`/hr/documents/${id}/archive`),
  listVersions: (id) => api.get(`/hr/documents/${id}/versions`),

  // ── Document Requests (HR-initiated) ──────────────────────────────────────
  listDocumentRequests: (params) => api.get('/hr/document-requests', { params }),
  createDocumentRequest: (payload) => api.post('/hr/document-requests', payload),
  getDocumentRequest: (id) => api.get(`/hr/document-requests/${id}`),
  cancelDocumentRequest: (id) => api.post(`/hr/document-requests/${id}/cancel`),

  // ── Employee self-service document requests ───────────────────────────────
  listMyDocumentRequests: (params) => api.get('/hr/me/document-requests', { params }),
  uploadForDocumentRequest: (requestId, formData) => api.post(`/hr/me/document-requests/${requestId}/upload`, formData),
}

/** Authorized file access — fetched as blobs so previews/downloads carry the
 *  auth headers and confidential files are never exposed through raw URLs.
 *  The backend streams the stored bytes through SynTask (no cross-origin
 *  redirect), so failures arrive as JSON error bodies inside the Blob.
 *  suppressGlobalToast lets each page surface one contextual message. */
export const hrDocumentFiles = {
  preview: (id) => api.get(`/hr/documents/${id}/preview`, { responseType: 'blob', suppressGlobalToast: true }),
  download: (id) => api.get(`/hr/documents/${id}/download`, { responseType: 'blob', suppressGlobalToast: true }),
  downloadVersion: (id, versionId) => api.get(`/hr/documents/${id}/versions/${versionId}/download`, { responseType: 'blob', suppressGlobalToast: true }),
}

/** Build a multipart FormData body for uploads/replacements. */
export function buildDocumentFormData({ file, document_type_id, expiry_date, description, visibility, change_note }) {
  const data = new FormData()
  data.append('file', file)
  if (document_type_id) data.append('document_type_id', document_type_id)
  if (expiry_date) data.append('expiry_date', expiry_date)
  if (description) data.append('description', description)
  if (visibility) data.append('visibility', visibility)
  if (change_note) data.append('change_note', change_note)
  return data
}

export default hrDocumentsApi
