import axios from './axios'

const cleanParams = (filters = {}) => {
  const params = {}
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    params[key === 'companyId' ? 'company_id' : key] = value
  })
  return params
}

export const metaInboxApi = {
  getConversations: (filters = {}) => axios.get('/integrations/meta/inbox/conversations', {
    params: cleanParams(filters),
  }),
  getChannelStatus: (filters = {}) => axios.get('/integrations/meta/inbox/channel-status', {
    params: cleanParams(filters),
  }),
  getMessages: (conversationId, filters = {}) => axios.get(
    `/integrations/meta/inbox/conversations/${conversationId}/messages`,
    { params: cleanParams(filters) },
  ),
  updateConversation: (conversationId, payload, filters = {}) => axios.patch(
    `/integrations/meta/inbox/conversations/${conversationId}`,
    payload,
    { params: cleanParams(filters) },
  ),
  sendMessage: (conversationId, text, companyId) => axios.post(
    `/integrations/meta/inbox/conversations/${conversationId}/send`,
    { text },
    { params: cleanParams({ companyId }) }
  ),
}
