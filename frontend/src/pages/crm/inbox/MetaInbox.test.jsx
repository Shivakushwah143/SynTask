import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { metaInboxApi } from '../../../api/metaInbox'
import { useAuthStore } from '../../../store/authStore'
import MetaInbox from './MetaInbox'

vi.mock('../../../api/metaInbox', () => ({
  metaInboxApi: {
    getConversations: vi.fn(),
    getMessages: vi.fn(),
    getChannelStatus: vi.fn(),
    updateConversation: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue({ status: "sent" }),
  },
}))

const conversations = {
  items: [
    {
      id: 'conversation-1',
      channel: 'whatsapp',
      provider_thread_id: 'phone:15551234567',
      linked_lead_id: 'lead-1',
      assigned_to: 'agent-1',
      priority: 'high',
      tags: ['vip'],
      status: 'open',
      unread_count: 2,
      last_message_at: '2026-07-22T10:00:00Z',
    },
    {
      id: 'conversation-2',
      channel: 'instagram',
      provider_thread_id: 'ig:user-1',
      linked_contact_id: null,
      assigned_to: null,
      priority: 'normal',
      tags: [],
      status: 'open',
      unread_count: 0,
      last_message_at: '2026-07-22T09:00:00Z',
    },
  ],
}

const messages = {
  items: [
    {
      id: 'message-1',
      direction: 'inbound',
      channel: 'whatsapp',
      text: 'Need pricing',
      provider_message_id: 'wamid.1',
      occurred_at: '2026-07-22T10:00:00Z',
    },
  ],
}

const channelStatus = {
  items: [
    {
      id: 'connection-1',
      channel: 'whatsapp',
      display_name: 'Main WhatsApp',
      status: 'degraded',
      can_receive: true,
      can_send: false,
      health_reason: 'Webhook delay',
    },
  ],
}

const renderInbox = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MetaInbox />
  </QueryClientProvider>,
)

describe('MetaInbox', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { role: 'admin', company_id: 'company-1' } })
    const clonedConvs = JSON.parse(JSON.stringify(conversations))
    metaInboxApi.getConversations.mockResolvedValue(clonedConvs)
    metaInboxApi.getMessages.mockResolvedValue(JSON.parse(JSON.stringify(messages)))
    metaInboxApi.getChannelStatus.mockResolvedValue(JSON.parse(JSON.stringify(channelStatus)))
    metaInboxApi.updateConversation.mockResolvedValue({ items: [{ ...clonedConvs.items[0], priority: 'high' }] })
  })

  it('renders unified Meta conversations with traceability and no send action', async () => {
    renderInbox()

    expect(await screen.findByText('Meta Inbox')).toBeInTheDocument()
    expect(screen.getAllByText('WhatsApp').length).toBeGreaterThan(1)
    expect(screen.getAllByText('Instagram').length).toBeGreaterThan(1)
    expect(screen.getByText('phone:15551234567')).toBeInTheDocument()
    expect(screen.getByText('Lead lead-1')).toBeInTheDocument()
    expect(await screen.findByText('Need pricing')).toBeInTheDocument()
    expect(screen.getByText('wamid.1')).toBeInTheDocument()
    expect(screen.getByText(/WhatsApp replies require explicit human approval/i)).toBeInTheDocument()
    expect(await screen.findByText('Main WhatsApp')).toBeInTheDocument()
    expect(screen.getByText('Webhook delay')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send reply/i })).toBeDisabled()
  })

  it('shows Instagram composer restrictions when Instagram conversation is selected', async () => {
    renderInbox()
    await screen.findByText('ig:user-1')

    fireEvent.click(screen.getByText('ig:user-1'))

    expect(await screen.findByText(/Instagram replies require explicit human approval/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send reply/i })).toBeDisabled()
  })

  it('passes channel filters to the inbox API', async () => {
    renderInbox()
    await screen.findByText('phone:15551234567')

    fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'whatsapp' } })

    expect(await screen.findByText('phone:15551234567')).toBeInTheDocument()
    expect(metaInboxApi.getConversations).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'whatsapp' }),
    )
  })

  it('updates assignment priority tags and notes without sending', async () => {
    renderInbox()
    await screen.findByText('phone:15551234567')

    const ownerInput = screen.getByLabelText('Owner')
    await waitFor(() => expect(ownerInput.value).toBe('agent-1'))

    fireEvent.change(ownerInput, { target: { value: 'agent-2' } })
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'high' } })
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'vip, billing' } })
    fireEvent.change(screen.getByLabelText('Internal note'), { target: { value: 'Needs callback' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save inbox fields' }))

    await waitFor(() => expect(metaInboxApi.updateConversation).toHaveBeenCalledWith('conversation-1', {
        assigned_to: 'agent-2',
        priority: 'high',
        tags: ['vip', 'billing'],
        note: 'Needs callback',
      }, expect.any(Object)),
    )
  })

  it('sends a reply message successfully', async () => {
    renderInbox()
    await screen.findByText('phone:15551234567')

    fireEvent.change(screen.getByPlaceholderText('Type a response to send...'), {
      target: { value: 'Hello WhatsApp' }
    })
    
    const sendButton = screen.getByRole('button', { name: /send reply/i })
    expect(sendButton).not.toBeDisabled()
    fireEvent.click(sendButton)

    await waitFor(() => expect(metaInboxApi.sendMessage).toHaveBeenCalledWith(
      'conversation-1',
      'Hello WhatsApp',
      undefined
    ))
  })
})
