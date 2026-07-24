import axios from './axios'

const cleanParams = (filters = {}) => {
  const params = {}
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    params[key === 'companyId' ? 'company_id' : key] = value
  })
  return params
}

export const metaAIDraftsApi = {
  createDraft: (conversationId, payload = {}, filters = {}) => axios.post(
    `/integrations/meta/ai-drafts/conversations/${conversationId}`,
    payload,
    { params: cleanParams(filters) },
  ),
  approveDraft: (draftId, filters = {}) => axios.post(
    `/integrations/meta/ai-drafts/${draftId}/approve`,
    {},
    { params: cleanParams(filters) },
  ),
  rejectDraft: (draftId, payload = {}, filters = {}) => axios.post(
    `/integrations/meta/ai-drafts/${draftId}/reject`,
    payload,
    { params: cleanParams(filters) },
  ),
}
