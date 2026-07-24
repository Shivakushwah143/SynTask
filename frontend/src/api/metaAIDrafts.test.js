import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./axios', () => ({
  default: {
    post: vi.fn(),
  },
}))

import axios from './axios'
import { metaAIDraftsApi } from './metaAIDrafts'

describe('metaAIDraftsApi', () => {
  beforeEach(() => {
    axios.post.mockReset()
  })

  it('creates a draft with company filter', () => {
    metaAIDraftsApi.createDraft('conversation-1', { instruction: 'Warm' }, { companyId: 'tenant-1' })

    expect(axios.post).toHaveBeenCalledWith(
      '/integrations/meta/ai-drafts/conversations/conversation-1',
      { instruction: 'Warm' },
      { params: { company_id: 'tenant-1' } },
    )
  })

  it('approves and rejects drafts without send endpoint', () => {
    metaAIDraftsApi.approveDraft('draft-1', { companyId: 'tenant-1' })
    metaAIDraftsApi.rejectDraft('draft-1', { reason: 'Bad tone' }, { companyId: 'tenant-1' })

    expect(axios.post).toHaveBeenNthCalledWith(
      1,
      '/integrations/meta/ai-drafts/draft-1/approve',
      {},
      { params: { company_id: 'tenant-1' } },
    )
    expect(axios.post).toHaveBeenNthCalledWith(
      2,
      '/integrations/meta/ai-drafts/draft-1/reject',
      { reason: 'Bad tone' },
      { params: { company_id: 'tenant-1' } },
    )
  })
})
