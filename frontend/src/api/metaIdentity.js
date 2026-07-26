import axios from './axios'

const cleanParams = (filters = {}) => {
  const params = {}
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    params[key === 'companyId' ? 'company_id' : key] = value
  })
  return params
}

export const metaIdentityApi = {
  getSuggestions: (identityId, filters = {}) => axios.get(
    `/integrations/meta/identity/suggestions/${identityId}`,
    { params: cleanParams(filters) },
  ),
  confirmLink: (payload, filters = {}) => axios.post(
    '/integrations/meta/identity/links',
    payload,
    { params: cleanParams(filters) },
  ),
}
