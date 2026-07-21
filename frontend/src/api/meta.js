import axios from './axios'

const params = (companyId) => companyId ? { company_id: companyId } : undefined

export const metaApi = {
  getSettings: (companyId) => axios.get('/integrations/meta/settings', { params: params(companyId) }),
  updateSettings: (payload, companyId) => axios.put('/integrations/meta/settings', payload, { params: params(companyId) }),
  getHealth: (companyId) => axios.get('/integrations/meta/health', { params: params(companyId) }),
  testConnection: (companyId) => axios.post('/integrations/meta/test-connection', null, { params: params(companyId) }),
  syncNow: (companyId) => axios.post('/integrations/meta/sync', null, { params: params(companyId) }),
}
