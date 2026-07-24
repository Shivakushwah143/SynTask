import axios from './axios'

const params = (companyId) => companyId ? { company_id: companyId } : undefined

export const metaApi = {
  getSettings: (companyId) => axios.get('/integrations/meta/settings', { params: params(companyId) }),
  updateSettings: (payload, companyId) => axios.put('/integrations/meta/settings', payload, { params: params(companyId) }),
  getHealth: (companyId) => axios.get('/integrations/meta/health', { params: params(companyId) }),
  getInsights: (companyId) => axios.get('/integrations/meta/insights', { params: params(companyId) }),
  getSyncRuns: (companyId) => axios.get('/integrations/meta/sync-runs', { params: params(companyId) }),
  testConnection: (companyId) => axios.post('/integrations/meta/test-connection', null, { params: params(companyId) }),
  syncNow: (companyId) => axios.post('/integrations/meta/sync', null, { params: params(companyId) }),
  getChannels: (companyId) => axios.get('/integrations/meta/channels', { params: params(companyId) }),
  createInstagramOnboardingSession: (companyId) => axios.post('/integrations/meta/instagram/onboarding-sessions', null, { params: params(companyId) }),
  completeInstagramOnboardingSession: (sessionId, code, companyId) => axios.post(`/integrations/meta/instagram/onboarding-sessions/${sessionId}/complete`, null, { params: { ...params(companyId), code } }),
  createMessengerOnboardingSession: (companyId) => axios.post('/integrations/meta/messenger/onboarding-sessions', null, { params: params(companyId) }),
  completeMessengerOnboardingSession: (sessionId, code, companyId) => axios.post(`/integrations/meta/messenger/onboarding-sessions/${sessionId}/complete`, null, { params: { ...params(companyId), code } }),
  validateChannel: (connectionId, companyId) => axios.post(`/integrations/meta/channels/${connectionId}/validate`, null, { params: params(companyId) }),
  disconnectChannel: (connectionId, companyId) => axios.post(`/integrations/meta/channels/${connectionId}/disconnect`, null, { params: params(companyId) }),
  getAnalytics: (companyId) => axios.get('/integrations/meta/analytics', { params: params(companyId) }),
  getReadiness: () => axios.get('/integrations/meta/readiness'),
  updateReadiness: (checklistId, payload) => axios.patch(`/integrations/meta/readiness/${checklistId}`, payload),
  exportReadiness: () => axios.get('/integrations/meta/readiness/export'),
}
