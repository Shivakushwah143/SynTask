import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { metaIdentityApi } from '../../../api/metaIdentity'
import { IdentityLinkPanel } from './IdentityLinkPanel'

vi.mock('../../../api/metaIdentity', () => ({
  metaIdentityApi: {
    getSuggestions: vi.fn(),
    confirmLink: vi.fn(),
  },
}))

const renderPanel = (conversation = { id: 'conversation-1', customer_identity_id: 'identity-1' }) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <IdentityLinkPanel conversation={conversation} />
  </QueryClientProvider>,
)

describe('IdentityLinkPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    metaIdentityApi.getSuggestions.mockResolvedValue({
      items: [
        {
          identity_id: 'identity-2',
          channel: 'instagram',
          provider_user_id: 'ig-user-1',
          display_name: 'Ava Customer',
          evidence: [
            { type: 'normalized_phone', value: '5551234567' },
          ],
        },
      ],
    })
    metaIdentityApi.confirmLink.mockResolvedValue({ id: 'link-1', status: 'confirmed' })
  })

  it('shows deterministic suggestions and no automatic merge promise', async () => {
    renderPanel()

    expect(await screen.findByText('Ava Customer')).toBeInTheDocument()
    expect(screen.getByText(/No automatic merge/i)).toBeInTheDocument()
    expect(screen.getByText('normalized_phone: 5551234567')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm link' })).toBeInTheDocument()
  })

  it('requires human confirmation before creating a link', async () => {
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm link' }))

    expect(metaIdentityApi.confirmLink).not.toHaveBeenCalled()
    expect(screen.getByText(/Human confirmation required/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Yes, confirm link' }))

    await waitFor(() => expect(metaIdentityApi.confirmLink).toHaveBeenCalledWith({
      identity_id: 'identity-1',
      target_identity_id: 'identity-2',
    }, {}))
  })

  it('does not query when no identity record exists', () => {
    renderPanel({ id: 'conversation-1', customer_identity_id: null })

    expect(screen.getByText(/no channel identity record/i)).toBeInTheDocument()
    expect(metaIdentityApi.getSuggestions).not.toHaveBeenCalled()
  })
})
