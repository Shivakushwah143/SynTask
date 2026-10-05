import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import DocumentTypesSettingsPage from './DocumentTypesSettingsPage'
import { hrDocumentsApi } from '../../../../api/hrDocuments'

vi.mock('../../../../api/hrDocuments', () => ({
  hrDocumentsApi: {
    listTypes: vi.fn(),
    createType: vi.fn(),
    updateType: vi.fn(),
    deactivateType: vi.fn(),
  },
  normalizeDocumentTypesResponse: (response) => {
    const payload = response?.data ?? response
    if (Array.isArray(payload)) return payload
    if (Array.isArray(payload?.data)) return payload.data
    if (Array.isArray(payload?.data?.data)) return payload.data.data
    if (Array.isArray(payload?.items)) return payload.items
    return []
  },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const types = [
  { id: 'type-1', name: 'Aadhaar Card', code: 'aadhaar', description: null, owner_scope: 'employee', required: true, expiry_supported: true, default_visibility: 'employee_visible', active: true },
  { id: 'type-2', name: 'Passport', code: 'passport', description: null, owner_scope: 'employee', required: false, expiry_supported: true, default_visibility: 'employee_visible', active: true },
  { id: 'type-3', name: 'Legacy Type', code: 'legacy', description: null, owner_scope: 'both', required: false, expiry_supported: false, default_visibility: 'hr_only', active: false },
]

const createTestQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })

const renderPage = () =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <DocumentTypesSettingsPage />
    </QueryClientProvider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  hrDocumentsApi.listTypes.mockResolvedValue({ data: types })
})

describe('DocumentTypesSettingsPage', () => {
  it('renders the seeded document types', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText('Aadhaar Card')).toBeInTheDocument())
    expect(screen.getByText('Passport')).toBeInTheDocument()
    expect(hrDocumentsApi.listTypes).toHaveBeenCalled()
  })

  it('shows active/inactive status', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText('Aadhaar Card')).toBeInTheDocument())
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
    expect(screen.getByText('Inactive')).toBeInTheDocument()
  })

  it('creates a new document type', async () => {
    hrDocumentsApi.createType.mockResolvedValue({ data: { id: 'type-new' } })

    renderPage()

    await waitFor(() => expect(screen.getByText('Aadhaar Card')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /New Document Type/i }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Document Type' })).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('e.g. PAN Card'), { target: { value: 'Visa' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. pan'), { target: { value: 'visa' } })
    fireEvent.click(screen.getByRole('button', { name: /Create Type/i }))

    await waitFor(() =>
      expect(hrDocumentsApi.createType).toHaveBeenCalledWith(expect.objectContaining({ name: 'Visa', code: 'visa' })),
    )
  })

  it('edits an existing document type', async () => {
    hrDocumentsApi.updateType.mockResolvedValue({ data: { id: 'type-1' } })

    renderPage()

    await waitFor(() => expect(screen.getByText('Aadhaar Card')).toBeInTheDocument())
    fireEvent.click(screen.getAllByTitle('Edit')[0])

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit Document Type' })).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('e.g. PAN Card'), { target: { value: 'Aadhaar (New)' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }))

    await waitFor(() =>
      expect(hrDocumentsApi.updateType).toHaveBeenCalledWith(
        'type-1',
        expect.objectContaining({ name: 'Aadhaar (New)' }),
      ),
    )
  })

  it('deactivates a type after confirmation (soft delete)', async () => {
    hrDocumentsApi.deactivateType.mockResolvedValue({ data: { id: 'type-1', active: false } })

    renderPage()

    await waitFor(() => expect(screen.getByText('Aadhaar Card')).toBeInTheDocument())
    fireEvent.click(screen.getAllByTitle('Deactivate')[0])

    await waitFor(() => expect(screen.getByText('Deactivate Document Type?')).toBeInTheDocument())
    expect(screen.getByText(/Deactivate “Aadhaar Card”/)).toBeInTheDocument()
    const confirmDeactivate = screen.getAllByRole('button', { name: /Deactivate/i }).find((button) => button.textContent.trim() === 'Deactivate')
    fireEvent.click(confirmDeactivate)

    await waitFor(() => expect(hrDocumentsApi.deactivateType).toHaveBeenCalledWith('type-1'))
  })

  it('reactivates an inactive type', async () => {
    hrDocumentsApi.updateType.mockResolvedValue({ data: { id: 'type-3', active: true } })

    renderPage()

    await waitFor(() => expect(screen.getByText('Legacy Type')).toBeInTheDocument())
    fireEvent.click(screen.getAllByTitle('Activate')[0])

    await waitFor(() =>
      expect(hrDocumentsApi.updateType).toHaveBeenCalledWith('type-3', { active: true }),
    )
  })
})
