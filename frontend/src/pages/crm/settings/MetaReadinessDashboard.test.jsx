import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import { describe, expect, it, vi } from 'vitest'
import { metaApi } from '../../../api/meta'
import { MetaReadinessDashboard } from './MetaReadinessDashboard'

vi.mock('../../../api/meta', () => ({
  metaApi: {
    getReadiness: vi.fn(),
    updateReadiness: vi.fn(),
    exportReadiness: vi.fn(),
  },
}))

const renderDashboard = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MetaReadinessDashboard />
  </QueryClientProvider>,
)

describe('MetaReadinessDashboard', () => {
  it('renders loading state initially', () => {
    metaApi.getReadiness.mockReturnValue(new Promise(() => {}))
    renderDashboard()
    expect(screen.getByText('Loading compliance audit logs...')).toBeInTheDocument()
  })

  it('renders compliance checklist and allows submitting audit updates', async () => {
    metaApi.getReadiness.mockResolvedValue({
      data: [
        {
          checklist_id: 'PII_REDACTION',
          checklist_name: 'PII & Access Token Log Redaction',
          status: 'pending',
          notes: 'Verify logs are sanitized',
          evidence_url: null,
          verified_at: null,
          verified_by: null,
        }
      ]
    })

    metaApi.updateReadiness.mockResolvedValue({ data: { status: 'passed' } })

    renderDashboard()

    expect(await screen.findByText('PII & Access Token Log Redaction')).toBeInTheDocument()
    expect(screen.getByText('Verify logs are sanitized')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Audit' }))

    expect(screen.getByText('Audit Control: PII & Access Token Log Redaction')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'passed' } })
    fireEvent.change(screen.getByLabelText('Evidence URL'), { target: { value: 'https://example.com/evidence.mp4' } })
    fireEvent.change(screen.getByLabelText('Audit Notes / Comments'), { target: { value: 'All clean' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save Audit Record' }))

    await waitFor(() => {
      expect(metaApi.updateReadiness).toHaveBeenCalledWith('PII_REDACTION', {
        status: 'passed',
        evidence_url: 'https://example.com/evidence.mp4',
        notes: 'All clean',
      })
    })
  })

  it('handles exporting evidence package', async () => {
    metaApi.getReadiness.mockResolvedValue({ data: [] })
    metaApi.exportReadiness.mockResolvedValue({
      data: {
        exported_at: '2026-07-24T00:00:00Z',
        checklist_count: 5,
        passed_count: 5,
        fully_ready: true,
        items: []
      }
    })

    const createObjectURLMock = vi.fn().mockReturnValue('mock-url')
    const revokeObjectURLMock = vi.fn()
    window.URL.createObjectURL = createObjectURLMock
    window.URL.revokeObjectURL = revokeObjectURLMock
    const clickMock = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    renderDashboard()

    const exportBtn = await screen.findByRole('button', { name: 'Export Evidence Package' })
    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(metaApi.exportReadiness).toHaveBeenCalled()
      expect(createObjectURLMock).toHaveBeenCalled()
      expect(clickMock).toHaveBeenCalled()
    })
  })
})
