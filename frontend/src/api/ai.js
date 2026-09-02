import api from './axios'
import { timeService } from '@/services/timeService'

const unifiedAssistantEnabled = () => import.meta.env.VITE_UNIFIED_AI_ASSISTANT_ENABLED === 'true'

const createIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `ai-assistant-${timeService.nowMs()}-${Math.random().toString(36).slice(2)}`
}

export const normalizeUnifiedAssistantResponse = (response = {}) => ({
  ...response,
  message: response.answer?.summary || '',
  suggested_actions: response.proposed_actions || [],
  generated_at: timeService.toUtcISOString(timeService.now()),
})

export const buildUnifiedAssistantPayload = (payload = {}) => ({
  message: payload.message,
  conversation_id: payload.conversation_id || undefined,
  session_id: payload.session_id || undefined,
  idempotency_key: payload.idempotency_key || createIdempotencyKey(),
  workspace: payload.workspace || {},
  preferences: payload.preferences || {},
})

export const aiAPI = {
  generateSalesAgent: async (payload = {}) => {
    const response = await api.post('/ai/sales-agent', payload)
    return response.data
  },

  generateTaskPrioritization: async (payload = {}) => {
    const response = await api.post('/ai/task-prioritization', payload)
    return response.data
  },

  generateTaskBreakdown: async (payload = {}) => {
    const response = await api.post('/ai/task-breakdown', payload)
    return response.data
  },

  generateBreakdown: async (payload = {}) => {
    const response = await api.post('/ai/breakdown', payload)
    return response.data
  },

  generateDailyReport: async (payload = {}) => {
    const response = await api.post('/ai/daily-report', payload)
    return response.data
  },

  chat: async (payload = {}) => {
    const useUnified = unifiedAssistantEnabled()
    console.log('[AIChat] VITE_UNIFIED_AI_ASSISTANT_ENABLED =', import.meta.env.VITE_UNIFIED_AI_ASSISTANT_ENABLED, '→ useUnified =', useUnified, '→ endpoint:', useUnified ? '/ai-assistant/chat' : '/ai/chat')
    if (useUnified) {
      const response = await api.post('/ai-assistant/chat', buildUnifiedAssistantPayload(payload))
      return normalizeUnifiedAssistantResponse(response.data)
    }
    const response = await api.post('/ai/chat', payload)
    return response.data
  },

  marketingChat: async (payload = {}) => {
    const response = await api.post('/ai/marketing-chat', payload)
    return response.data
  },

  listLogs: async (limit = 20) => {
    const response = await api.get(`/ai/logs?limit=${limit}`)
    return response.data
  },

  listPersonalMemory: async () => {
    const response = await api.get('/ai-assistant/memory')
    return response.data
  },

  savePersonalPreference: async (payload) => {
    const response = await api.put('/ai-assistant/memory/preferences', payload)
    return response.data
  },

  updatePersonalMemorySettings: async (enabled) => {
    const response = await api.put('/ai-assistant/memory/settings', { enabled })
    return response.data
  },

  deletePersonalMemory: async (memoryId) => {
    const response = await api.delete(`/ai-assistant/memory/${memoryId}`)
    return response.data
  },

  clearPersonalMemory: async () => {
    const response = await api.delete('/ai-assistant/memory')
    return response.data
  },

  // HR Agent
  hrChat: async (payload = {}) => {
    const response = await api.post('/hr-agent/chat', {
      message: payload.message,
      conversation_id: payload.conversation_id || undefined,
      session_id: payload.session_id || undefined,
      selected_record_type: payload.selected_record_type || undefined,
      selected_record_id: payload.selected_record_id || undefined,
    })
    return response.data
  },

  hrQuickActions: async () => {
    const response = await api.get('/hr-agent/quick-actions')
    return response.data
  },

  // Executive Operations Agent
  executiveChat: async (payload = {}) => {
    const response = await api.post('/executive-agent/chat', {
      message: payload.message,
      conversation_id: payload.conversation_id || undefined,
      session_id: payload.session_id || undefined,
      selected_record_type: payload.selected_record_type || undefined,
      selected_record_id: payload.selected_record_id || undefined,
    })
    return response.data
  },

  executiveQuickActions: async () => {
    const response = await api.get('/executive-agent/quick-actions')
    return response.data
  },
}
