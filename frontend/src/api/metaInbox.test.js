import { describe, expect, it, vi } from 'vitest'
import axios from './axios'
import { metaInboxApi } from './metaInbox'

vi.mock('./axios', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}))

describe('metaInboxApi', () => {
  it('lists conversations with tenant and filter params', () => {
    axios.get.mockResolvedValueOnce({ items: [] })

    metaInboxApi.getConversations({
      companyId: 'company-1',
      channel: 'whatsapp',
      unread: true,
      linked: true,
      limit: 25,
    })

    expect(axios.get).toHaveBeenCalledWith('/integrations/meta/inbox/conversations', {
      params: {
        company_id: 'company-1',
        channel: 'whatsapp',
        unread: true,
        linked: true,
        limit: 25,
      },
    })
  })

  it('lists messages for a conversation without send side effects', () => {
    axios.get.mockResolvedValueOnce({ items: [] })

    metaInboxApi.getMessages('conversation-1', { companyId: 'company-1' })

    expect(axios.get).toHaveBeenCalledWith(
      '/integrations/meta/inbox/conversations/conversation-1/messages',
      { params: { company_id: 'company-1' } },
    )
    expect(axios.post).toBeUndefined()
  })

  it('updates conversation management fields without provider send', () => {
    axios.patch.mockResolvedValueOnce({ items: [] })

    metaInboxApi.updateConversation('conversation-1', {
      assigned_to: 'user-2',
      priority: 'high',
      tags: ['vip'],
      note: 'Needs callback',
    })

    expect(axios.patch).toHaveBeenCalledWith(
      '/integrations/meta/inbox/conversations/conversation-1',
      {
        assigned_to: 'user-2',
        priority: 'high',
        tags: ['vip'],
        note: 'Needs callback',
      },
      { params: {} },
    )
    expect(axios.post).toBeUndefined()
  })

  it('lists channel status for outage indicators', () => {
    axios.get.mockResolvedValueOnce({ items: [] })

    metaInboxApi.getChannelStatus({ companyId: 'company-1' })

    expect(axios.get).toHaveBeenCalledWith('/integrations/meta/inbox/channel-status', {
      params: { company_id: 'company-1' },
    })
  })
})
