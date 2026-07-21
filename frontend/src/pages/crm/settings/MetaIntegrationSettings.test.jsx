import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../../store/authStore'
import { metaApi } from '../../../api/meta'
import { MetaIntegrationSettings } from './MetaIntegrationSettings'

vi.mock('../../../api/meta', () => ({
  metaApi: {
    getSettings: vi.fn().mockResolvedValue({
      enabled: false,
      app_id: 'app-1',
      page_access_token_masked: '••••1234',
      system_user_token_masked: null,
    }),
    getHealth: vi.fn().mockResolvedValue({ status: 'not_configured' }),
    updateSettings: vi.fn().mockResolvedValue({ enabled: true }),
    testConnection: vi.fn().mockResolvedValue({ status: 'connected' }),
    syncNow: vi.fn().mockResolvedValue({ status: 'queued' }),
  },
}))

const renderSettings = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MetaIntegrationSettings />
  </QueryClientProvider>,
)

describe('MetaIntegrationSettings', () => {
  beforeEach(() => useAuthStore.setState({ user: { role: 'admin', company_id: 'company-1' } }))

  it('blocks non-admin users', () => {
    useAuthStore.setState({ user: { role: 'employee', company_id: 'company-1' } })
    renderSettings()
    expect(screen.getByText(/admin access required/i)).toBeInTheDocument()
  })

  it('shows masked secret and safe read-only actions', async () => {
    renderSettings()
    expect(await screen.findByText('••••1234')).toBeInTheDocument()
    expect(screen.getByText('app-1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /test connection/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^send/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))
    expect(await screen.findByText(/connected/i)).toBeInTheDocument()
  })

  it('saves settings without requiring token fields', async () => {
    renderSettings()

    fireEvent.change(await screen.findByLabelText('Page ID'), { target: { value: 'page-1' } })
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))

    await screen.findByText(/settings saved/i)
    expect(metaApi.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ page_id: 'page-1' }),
      undefined,
    )
    expect(metaApi.updateSettings.mock.calls[0][0]).not.toHaveProperty('page_access_token')
  })
})
