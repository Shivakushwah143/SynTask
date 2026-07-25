import { beforeEach, describe, expect, test, vi } from 'vitest'
import { aiAPI, buildUnifiedAssistantPayload, normalizeUnifiedAssistantResponse } from './ai'
import api from './axios'

vi.mock('./axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('aiAPI unified assistant gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    import.meta.env.VITE_UNIFIED_AI_ASSISTANT_ENABLED = 'true'
  })

  test('builds unified payload without frontend authority fields', () => {
    const payload = buildUnifiedAssistantPayload({
      message: 'What needs attention?',
      conversation_id: 'conversation-1',
      company_id: 'forged',
      role: 'admin',
      workspace: { page: 'dashboard' },
      idempotency_key: 'retry-key-1',
    })

    expect(payload).toEqual({
      message: 'What needs attention?',
      conversation_id: 'conversation-1',
      session_id: undefined,
      idempotency_key: 'retry-key-1',
      workspace: { page: 'dashboard' },
      preferences: {},
    })
    expect(payload.company_id).toBeUndefined()
    expect(payload.role).toBeUndefined()
  })

  test('routes chat to unified gateway when enabled and normalizes legacy fields', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        conversation_id: 'conversation-1',
        session_id: 'session-1',
        answer: { summary: 'Unified answer' },
        proposed_actions: [{ label: 'Open project' }],
      },
    })

    const result = await aiAPI.chat({ message: 'hello', idempotency_key: 'retry-key-1' })

    expect(api.post).toHaveBeenCalledWith('/ai-assistant/chat', {
      message: 'hello',
      conversation_id: undefined,
      session_id: undefined,
      idempotency_key: 'retry-key-1',
      workspace: {},
      preferences: {},
    })
    expect(result.message).toBe('Unified answer')
    expect(result.suggested_actions).toEqual([{ label: 'Open project' }])
  })

  test('keeps normalized unified response shape stable', () => {
    expect(normalizeUnifiedAssistantResponse({ answer: { summary: 'ok' }, proposed_actions: [] }).message).toBe('ok')
  })

  test('maps personal memory control endpoints', async () => {
    api.get.mockResolvedValueOnce({ data: { enabled: true, memories: [] } })
    await aiAPI.listPersonalMemory()
    expect(api.get).toHaveBeenLastCalledWith('/ai-assistant/memory')

    api.put.mockResolvedValue({ data: { ok: true } })
    await aiAPI.savePersonalPreference({ title: 'Tone', content: 'Concise', preference_key: 'response_detail' })
    expect(api.put).toHaveBeenLastCalledWith('/ai-assistant/memory/preferences', { title: 'Tone', content: 'Concise', preference_key: 'response_detail' })

    await aiAPI.updatePersonalMemorySettings(false)
    expect(api.put).toHaveBeenLastCalledWith('/ai-assistant/memory/settings', { enabled: false })

    api.delete.mockResolvedValue({ data: { ok: true } })
    await aiAPI.deletePersonalMemory('memory-1')
    expect(api.delete).toHaveBeenLastCalledWith('/ai-assistant/memory/memory-1')

    await aiAPI.clearPersonalMemory()
    expect(api.delete).toHaveBeenLastCalledWith('/ai-assistant/memory')
  })
})
