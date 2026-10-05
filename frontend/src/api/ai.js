import api from './axios'
import { timeService } from '@/services/timeService'
import { useAuthStore } from '../store/authStore'

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

/**
 * Stream an Executive Agent chat over SSE (POST /executive-agent/chat/stream).
 *
 * Uses fetch directly (the axios layer cannot stream). Authentication mirrors
 * the axios setup: Bearer token from the auth store plus cookies.
 *
 * Wire events (see backend/app/agents/streaming.py):
 *   { type: 'status', phase, message, done?, total? }
 *   { type: 'token',  text }
 *   { type: 'done',   data: <final payload incl. answer_blocks> }
 *   { type: 'error',  message, data? }
 *   { type: 'ping' }
 *
 * @returns a cancel function that aborts the in-flight request.
 */
export const streamExecutiveChat = (payload, { signal, onStatus, onToken, onDone, onError } = {}) => {
  const controller = new AbortController()
  const externalSignal = signal || controller.signal
  const token = useAuthStore?.getState?.()?.token

  ;(async () => {
    try {
      const response = await fetch('/api/v1/executive-agent/chat/stream', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: payload.message,
          conversation_id: payload.conversation_id || undefined,
          session_id: payload.session_id || undefined,
          selected_record_type: payload.selected_record_type || undefined,
          selected_record_id: payload.selected_record_id || undefined,
        }),
        signal: externalSignal,
      })

      if (!response.ok) {
        let detail = `Request failed (${response.status})`
        try {
          const body = await response.json()
          detail = body?.detail || body?.message || detail
        } catch {
          /* non-JSON error body */
        }
        onError?.(new Error(detail))
        return
      }
      if (!response.body) {
        onError?.(new Error('Streaming is not supported by this browser.'))
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const handleFrame = (frame) => {
        const dataLine = frame.split('\n').find((line) => line.startsWith('data:'))
        if (!dataLine) return
        const raw = dataLine.slice(5).trim()
        if (!raw) return
        let event
        try {
          event = JSON.parse(raw)
        } catch {
          return
        }
        if (!event || typeof event !== 'object') return
        switch (event.type) {
          case 'status':
            onStatus?.(event)
            break
          case 'token':
            onToken?.(event.text ?? '')
            break
          case 'done':
            onDone?.(event.data || {})
            break
          case 'error':
            onError?.(new Error(event.message || 'The request failed on the server.'))
            break
          default:
            // ping / unknown — ignore.
            break
        }
      }

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let boundary = buffer.indexOf('\n\n')
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          handleFrame(frame)
          boundary = buffer.indexOf('\n\n')
        }
      }
    } catch (error) {
      if (error?.name === 'AbortError') return
      onError?.(error instanceof Error ? error : new Error(String(error)))
    }
  })()

  return () => controller.abort()
}
