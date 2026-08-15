import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import DocumentsTab from './DocumentsTab'
import { hrDocumentsApi, hrDocumentFiles } from '../../../../api/hrDocuments'
import { authAPI } from '../../../../api/auth'

vi.mock('../../../../api/hrDocuments', () => ({
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
  normalizeDocumentTypesResponse: (response) => {
    const payload = response?.data ?? response
    if (Array.isArray(payload)) return payload
    if (Array.isArray(payload?.data)) return payload.data
    if (Array.isArray(payload?.data?.data)) return payload.data.data
    if (Array.isArray(payload?.items)) return payload.items
    return []
  },
  buildDocumentFormData: (payload) => {
    const data = new FormData()
    data.append('file', payload.file)
    return data
  },
}))

vi.mock('../../../../api/auth', () => ({
  authAPI: { getMe: vi.fn() },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const documentTypes = [
  { id: 'type-1', name: 'Aadhaar Card', code: 'aadhaar', active: true, required: true, expiry_supported: true, default_visibility: 'employee_visible' },
  { id: 'type-2', name: 'PAN Card', code: 'pan', active: true, required: true, expiry_supported: false, default_visibility: 'employee_visible' },
  { id: 'type-3', name: 'Salary Document', code: 'salary_document', active: false, required: false, expiry_supported: false, default_visibility: 'hr_only' },
]

const doc = {
  id: 'doc-1',
  owner_type: 'employee',
  employee_id: 'emp-1',
  document_type_id: 'type-1',
  document_type: 'Aadhaar Card',
  document_type_required: true,
  status: 'active',
  expiry_date: null,
  expiry_state: 'no_expiry',
  visibility: 'employee_visible',
  current_version: 2,
  filename: 'aadhaar.pdf',
  mime_type: 'application/pdf',
  file_size: 1024 * 248,
  uploaded_by_name: 'HR User',
  uploaded_at: '2026-08-01T10:00:00Z',
  can_view: true,
  can_manage: true,
  can_preview: true,
  can_download: true,
  can_replace: true,
  can_edit: true,
  can_archive: true,
}

const createTestQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })

const renderTab = (props = {}) =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <DocumentsTab
        employeeId="emp-1"
        ownerName="Jane Doe"
        canManage={true}
        {...props}
      />
    </QueryClientProvider>,
  )

const renderGlobalTab = (props = {}) =>
  render(
    <MemoryRouter>
      <QueryClientProvider client={createTestQueryClient()}>
        <DocumentsTab canManage={true} {...props} />
      </QueryClientProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  authAPI.getMe.mockResolvedValue({
    role: 'admin',
    department_key: null,
    capabilities: [],
  })
  hrDocumentsApi.listTypes.mockResolvedValue({ data: documentTypes })
  hrDocumentsApi.missingRequired.mockResolvedValue({ data: { missing: [], count: 0 } })
  hrDocumentsApi.listEmployeeDocuments.mockResolvedValue({
    data: { items: [doc], total: 1, page: 1, page_size: 15, has_next: false },
  })
})

describe('DocumentsTab', () => {
  it('renders documents from the real API', async () => {
    renderTab()

    await waitFor(() => expect(screen.getByText('aadhaar.pdf')).toBeInTheDocument())
    expect(screen.getByText('Aadhaar Card')).toBeInTheDocument()
    expect(screen.getByText('No Expiry')).toBeInTheDocument()
    expect(screen.getByText('V2')).toBeInTheDocument()
    expect(hrDocumentsApi.listEmployeeDocuments).toHaveBeenCalledWith('emp-1', expect.anything())
  })

  it('shows the empty state with upload guidance', async () => {
    hrDocumentsApi.listEmployeeDocuments.mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 15, has_next: false },
    })

    renderTab()

    await waitFor(() => expect(screen.getByText('No documents yet')).toBeInTheDocument())
    expect(screen.getByText(/No HR documents have been added for Jane Doe/)).toBeInTheDocument()
  })

  it('shows an error state with retry', async () => {
    hrDocumentsApi.listEmployeeDocuments.mockRejectedValueOnce(new Error('boom'))
    hrDocumentsApi.listEmployeeDocuments.mockResolvedValue({
      data: { items: [doc], total: 1, page: 1, page_size: 15, has_next: false },
    })

    renderTab()

    await waitFor(() => expect(screen.getByText('Failed to load documents')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Try Again/i }))
    await waitFor(() => expect(screen.getByText('aadhaar.pdf')).toBeInTheDocument())
  })

  it('opens the upload modal and calls the backend', async () => {
    hrDocumentsApi.uploadEmployeeDocument.mockResolvedValue({ data: doc })

    renderTab()

    await waitFor(() => expect(screen.getByText('aadhaar.pdf')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Upload Document/i }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Upload HR Document' })).toBeInTheDocument())

    // Select type + file then submit.
    fireEvent.change(screen.getByLabelText('Document type'), { target: { value: 'type-1' } })
    const file = new File(['content'], 'aadhaar.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Choose file'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: /Upload$/i }))

    await waitFor(() => expect(hrDocumentsApi.uploadEmployeeDocument).toHaveBeenCalled())
  })

  it('filters by document type via the backend', async () => {
    renderTab()

    await waitFor(() => expect(screen.getByText('aadhaar.pdf')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }))
    await waitFor(() => expect(screen.getByRole('option', { name: 'PAN Card' })).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Filter by document type'), { target: { value: 'type-2' } })
    await waitFor(() =>
      expect(hrDocumentsApi.listEmployeeDocuments).toHaveBeenCalledWith(
        'emp-1',
        expect.objectContaining({ document_type_id: 'type-2' }),
      ),
    )
  })

  it('handles an empty document type list without crashing the dropdown', async () => {
    hrDocumentsApi.listTypes.mockResolvedValue({ data: [] })

    renderTab()

    await waitFor(() => expect(screen.getByText('aadhaar.pdf')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }))

    await waitFor(() => expect(screen.getByText(/No active document types are configured/)).toBeInTheDocument())
    expect(screen.getByRole('option', { name: /No document types available/i })).toBeInTheDocument()
  })

  it('shows a document type loading error instead of mapping a bad response', async () => {
    hrDocumentsApi.listTypes.mockRejectedValue(new Error('forbidden'))

    renderTab()

    await waitFor(() => expect(screen.getByText('aadhaar.pdf')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }))

    await waitFor(() => expect(screen.getByText(/Unable to load document types/)).toBeInTheDocument())
    expect(screen.getByRole('option', { name: /Document types unavailable/i })).toBeInTheDocument()
  })

  it('previews a PDF through the authorized endpoint', async () => {
    hrDocumentFiles.preview.mockResolvedValue({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) })

    renderTab()

    await waitFor(() => expect(screen.getByTitle('Preview')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Preview'))

    await waitFor(() => expect(hrDocumentFiles.preview).toHaveBeenCalledWith('doc-1'))
    await waitFor(() => expect(screen.getByTitle('Document preview')).toBeInTheDocument())
  })

  it('shows a permission message when preview is denied', async () => {
    hrDocumentFiles.preview.mockRejectedValue({ response: { data: { detail: 'You do not have permission to view this document' } } })

    renderTab()

    await waitFor(() => expect(screen.getByTitle('Preview')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Preview'))

    await waitFor(() => expect(screen.getByText('Preview unavailable')).toBeInTheDocument())
    expect(screen.getByText(/You do not have permission/)).toBeInTheDocument()
  })

  it('replaces a document creating a new version', async () => {
    hrDocumentsApi.replaceDocument.mockResolvedValue({ data: { ...doc, current_version: 3 } })

    renderTab()

    await waitFor(() => expect(screen.getByTitle('Replace (new version)')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Replace (new version)'))

    await waitFor(() => expect(screen.getByText(/will become V3/)).toBeInTheDocument())
    const file = new File(['content2'], 'aadhaar-v2.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText(/New File/), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: /Upload New Version/i }))

    await waitFor(() => expect(hrDocumentsApi.replaceDocument).toHaveBeenCalled())
  })

  it('shows version history and downloads a historical version', async () => {
    hrDocumentsApi.listVersions.mockResolvedValue({
      data: [
        { id: 'v2', version_number: 2, original_filename: 'aadhaar-v2.pdf', uploaded_by_name: 'HR User', uploaded_at: '2026-08-10T10:00:00Z', file_size: 2048, change_note: 'Updated copy', can_download: true },
        { id: 'v1', version_number: 1, original_filename: 'aadhaar.pdf', uploaded_by_name: 'HR User', uploaded_at: '2026-08-01T10:00:00Z', file_size: 1024, change_note: null, can_download: true },
      ],
    })
    hrDocumentFiles.downloadVersion.mockResolvedValue({ data: new Blob(['x'], { type: 'application/pdf' }) })

    renderTab()

    await waitFor(() => expect(screen.getByTitle('History')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('History'))

    await waitFor(() => expect(screen.getByText('aadhaar-v2.pdf')).toBeInTheDocument())
    expect(screen.getByText(/Updated copy/)).toBeInTheDocument()

    // Version rows have a text button; the table icon button has no text.
    const versionDownload = screen.getAllByRole('button', { name: /Download/i }).find((button) => button.textContent.trim() === 'Download')
    fireEvent.click(versionDownload)
    await waitFor(() => expect(hrDocumentFiles.downloadVersion).toHaveBeenCalledWith('doc-1', 'v2'))
  })

  it('archives a document after confirmation', async () => {
    hrDocumentsApi.archiveDocument.mockResolvedValue({ data: { ...doc, status: 'archived' } })

    renderTab()

    await waitFor(() => expect(screen.getByTitle('Archive')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Archive'))

    await waitFor(() => expect(screen.getByText('Archive Document?')).toBeInTheDocument())
    expect(screen.getByText(/Archive “aadhaar\.pdf” for Jane Doe/)).toBeInTheDocument()
    const confirmArchive = screen.getAllByRole('button', { name: /Archive/i }).find((button) => button.textContent.trim() === 'Archive')
    fireEvent.click(confirmArchive)

    await waitFor(() => expect(hrDocumentsApi.archiveDocument).toHaveBeenCalledWith('doc-1'))
  })

  it('lists company-wide documents via /hr/documents in global mode', async () => {
    hrDocumentsApi.listDocuments.mockResolvedValue({
      data: { items: [{ ...doc, employee_name: 'Jane Doe' }], total: 1, page: 1, page_size: 15, has_next: false },
    })

    renderGlobalTab()

    await waitFor(() => expect(screen.getByText('aadhaar.pdf')).toBeInTheDocument())
    expect(hrDocumentsApi.listDocuments).toHaveBeenCalledWith(expect.objectContaining({ page_size: 15 }))
    // Owner names come from the backend list (no per-row requests).
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  })

  it('links the owner to the employee profile from the global list', async () => {
    hrDocumentsApi.listDocuments.mockResolvedValue({
      data: { items: [{ ...doc, employee_id: 'emp-1', employee_name: 'Jane Doe' }], total: 1, page: 1, page_size: 15, has_next: false },
    })

    renderGlobalTab()

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())
    expect(screen.getByText('Jane Doe').getAttribute('href')).toBe('/hr/employees/emp-1')
  })

  it('filters the global list by owner type via the backend', async () => {
    hrDocumentsApi.listDocuments.mockResolvedValue({
      data: { items: [{ ...doc, candidate_id: 'cand-1', candidate_name: 'John C' }], total: 1, page: 1, page_size: 15, has_next: false },
    })

    renderGlobalTab()

    await waitFor(() => expect(screen.getByText('aadhaar.pdf')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }))
    await waitFor(() => expect(screen.getByLabelText('Filter by owner type')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Filter by owner type'), { target: { value: 'candidate' } })

    await waitFor(() =>
      expect(hrDocumentsApi.listDocuments).toHaveBeenCalledWith(expect.objectContaining({ owner_type: 'candidate' })),
    )
  })

  it('hides the upload button in global mode', async () => {
    hrDocumentsApi.listDocuments.mockResolvedValue({
      data: { items: [{ ...doc, employee_name: 'Jane Doe' }], total: 1, page: 1, page_size: 15, has_next: false },
    })

    renderGlobalTab()

    await waitFor(() => expect(screen.getByText('aadhaar.pdf')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Upload Document/i })).toBeNull()
  })

  it('hides manage actions when the backend forbids them', async () => {
    hrDocumentsApi.listEmployeeDocuments.mockResolvedValue({
      data: {
        items: [{ ...doc, can_replace: false, can_edit: false, can_archive: false }],
        total: 1,
        page: 1,
        page_size: 15,
        has_next: false,
      },
    })

    renderTab()

    await waitFor(() => expect(screen.getByText('aadhaar.pdf')).toBeInTheDocument())
    expect(screen.queryByTitle('Replace (new version)')).toBeNull()
    expect(screen.queryByTitle('Edit metadata')).toBeNull()
    expect(screen.queryByTitle('Archive')).toBeNull()
  })
})
