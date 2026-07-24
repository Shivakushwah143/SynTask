import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../../api/metaAIDrafts', () => ({
  metaAIDraftsApi: {
    createDraft: vi.fn(),
    approveDraft: vi.fn(),
    rejectDraft: vi.fn(),
  },
}))

import { metaAIDraftsApi } from '../../../api/metaAIDrafts'
import { AIDraftPanel } from './AIDraftPanel'

const renderPanel = (props = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AIDraftPanel
        conversation={{ id: 'conversation-1', channel: 'instagram' }}
        companyId="tenant-1"
        {...props}
      />
    </QueryClientProvider>,
  )
}

describe('AIDraftPanel', () => {
  beforeEach(() => {
    metaAIDraftsApi.createDraft.mockReset()
    metaAIDraftsApi.approveDraft.mockReset()
    metaAIDraftsApi.rejectDraft.mockReset()
  })

  it('generates governed draft and shows no-send guardrail', async () => {
    metaAIDraftsApi.createDraft.mockResolvedValue({ data: { item: { id: 'draft-1', draft_text: 'Safe reply', status: 'drafted' } } })
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: /generate ai draft/i }))

    await waitFor(() => expect(screen.getByDisplayValue('Safe reply')).toBeInTheDocument())
    expect(screen.getAllByText(/approval required/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^send$/i })).not.toBeInTheDocument()
  })

  it('approves and rejects draft state without provider send', async () => {
    metaAIDraftsApi.createDraft.mockResolvedValue({ data: { item: { id: 'draft-1', draft_text: 'Safe reply', status: 'drafted' } } })
    metaAIDraftsApi.approveDraft.mockResolvedValue({ data: { item: { id: 'draft-1', draft_text: 'Safe reply', status: 'approved' } } })
    metaAIDraftsApi.rejectDraft.mockResolvedValue({ data: { item: { id: 'draft-1', draft_text: 'Safe reply', status: 'rejected' } } })
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: /generate ai draft/i }))
    await screen.findByDisplayValue('Safe reply')
    fireEvent.click(screen.getByRole('button', { name: /approve draft/i }))
    await waitFor(() => expect(metaAIDraftsApi.approveDraft).toHaveBeenCalledWith('draft-1', { companyId: 'tenant-1' }))
    fireEvent.click(screen.getByRole('button', { name: /reject/i }))

    await waitFor(() => expect(metaAIDraftsApi.rejectDraft).toHaveBeenCalledWith('draft-1', { reason: 'Rejected from inbox panel' }, { companyId: 'tenant-1' }))
  })
})
