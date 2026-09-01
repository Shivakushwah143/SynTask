import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import HRDocumentsPage from './HRDocumentsPage'
import { authAPI } from '../../api/auth'
import { hrDocumentsApi } from '../../api/hrDocuments'

vi.mock('../../api/auth', () => ({
  authAPI: { getMe: vi.fn() },
}))

vi.mock('../../api/hrDocuments', () => ({
  hrDocumentsApi: {
    listTypes: vi.fn(),
    listDocuments: vi.fn(),
    listEmployeeDocuments: vi.fn(),
    listCandidateDocuments: vi.fn(),
    missingRequired: vi.fn(),
    uploadEmployeeDocument: vi.fn(),
    uploadCandidateDocument: vi.fn(),
    updateDocument: vi.fn(),
    replaceDocument: vi.fn(),
    archiveDocument: vi.fn(),
    listVersions: vi.fn(),
  },
  hrDocumentFiles: {
    preview: vi.fn(),
    download: vi.fn(),
    downloadVersion: vi.fn(),
  },
  buildDocumentFormData: (payload) => {
    const data = new FormData()
    data.append('file', payload.file)
    return data
  },
  normalizeDocumentTypesResponse: (data) => {
    if (Array.isArray(data)) return data
    if (data && Array.isArray(data.data)) return data.data
    if (data && Array.isArray(data.items)) return data.items
    return []
  },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const createTestQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })

beforeEach(() => {
  vi.clearAllMocks()
  authAPI.getMe.mockResolvedValue({
    role: 'admin',
    department_key: null,
    capabilities: [],
  })
  hrDocumentsApi.listTypes.mockResolvedValue({ data: [] })
})

describe('HRDocumentsPage (People → Documents)', () => {
  it('renders the page header and loads the company-wide document list', async () => {
    hrDocumentsApi.listDocuments.mockResolvedValue({
      data: {
        items: [
          {
            id: 'doc-1',
            owner_type: 'employee',
            employee_id: 'emp-1',
            employee_name: 'Jane Doe',
            document_type: 'Aadhaar Card',
            document_type_id: 'type-1',
            status: 'active',
            expiry_state: 'no_expiry',
            visibility: 'employee_visible',
            current_version: 1,
            filename: 'aadhaar.pdf',
            mime_type: 'application/pdf',
            file_size: 1024,
            can_view: true,
            can_preview: true,
            can_download: true,
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
        has_next: false,
      },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={createTestQueryClient()}>
          <HRDocumentsPage />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('HR Documents')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('aadhaar.pdf')).toBeInTheDocument())
    expect(hrDocumentsApi.listDocuments).toHaveBeenCalled()
  })
})
