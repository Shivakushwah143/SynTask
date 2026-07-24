import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import { describe, expect, it, vi } from 'vitest'
import { metaApi } from '../../../api/meta'
import { MetaAnalyticsPanel } from './MetaAnalyticsPanel'

vi.mock('../../../api/meta', () => ({
  metaApi: {
    getAnalytics: vi.fn(),
  },
}))

const renderPanel = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MetaAnalyticsPanel companyId="company-1" />
  </QueryClientProvider>,
)

describe('MetaAnalyticsPanel', () => {
  it('renders loading state initially', () => {
    metaApi.getAnalytics.mockReturnValue(new Promise(() => {}))
    renderPanel()
    expect(screen.getByText('Loading metrics...')).toBeInTheDocument()
  })

  it('renders aggregated metrics and breakdowns successfully', async () => {
    metaApi.getAnalytics.mockResolvedValue({
      total_conversations: 10,
      total_messages: 50,
      inbound_messages: 30,
      outbound_messages: 20,
      average_first_response_time_seconds: 120.0,
      channel_counts: { whatsapp: 5, instagram: 3, messenger: 2 },
      status_counts: { open: 4, pending: 3, closed: 3 },
      ai_metrics: {
        total_drafts: 8,
        approved_drafts: 6,
        rejected_drafts: 2,
        acceptance_rate: 75.0,
      },
      crm_metrics: {
        converted_conversations: 4,
        conversion_rate: 40.0,
      }
    })

    renderPanel()

    expect(await screen.findByText('10')).toBeInTheDocument()
    expect(screen.getByText('2m 0s')).toBeInTheDocument() // Avg First Response
    expect(screen.getByText('75.0%')).toBeInTheDocument() // AI Acceptance
    expect(screen.getByText('40.0%')).toBeInTheDocument() // CRM Conversion
    expect(screen.getByText('WhatsApp')).toBeInTheDocument()
    expect(screen.getByText('Instagram')).toBeInTheDocument()
    expect(screen.getByText('Messenger')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument() // Incoming count
    expect(screen.getByText('20')).toBeInTheDocument() // Outgoing count
    expect(screen.getByText('Open: 4')).toBeInTheDocument()
    expect(screen.getByText('Closed: 3')).toBeInTheDocument()
  })

  it('renders error state on fetch failure', async () => {
    metaApi.getAnalytics.mockRejectedValue(new Error('Fetch failed'))
    renderPanel()
    expect(await screen.findByText('Failed to load analytics metrics.')).toBeInTheDocument()
  })
})
