import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import MyDocuments from './MyDocuments'

vi.mock('../../../hooks/useMyHr', () => ({
  useMyProfile: vi.fn(),
  useMyDocuments: vi.fn(),
  useMyDocumentStatus: vi.fn(),
  useMyDocumentActions: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

import toast from 'react-hot-toast'
import {
  useMyDocumentActions,
  useMyDocumentStatus,
  useMyDocuments,
  useMyProfile,
} from '../../../hooks/useMyHr'

const profile = { id: 'p-1', full_name: 'Jane Doe' }

const pendingDoc = {
  id: 'doc-pending',
  document_type: 'PAN Card',
  document_type_id: 'type-pan',
  filename: 'pan-pending.pdf',
  current_version: 1,
  file_size: 2048,
  expiry_state: 'no_expiry',
  uploaded_at: '2026-08-20T10:00:00Z',
  submission_source: 'employee',
  review_status: 'pending',
  review_note: null,
  can_preview: true,
  can_download: true,
  can_resubmit: false,
}

const rejectedDoc = {
  id: 'doc-rejected',
  document_type: 'Experience Letter',
  document_type_id: 'type-exp',
  filename: 'experience-rejected.pdf',
  current_version: 2,
  file_size: 1024,
  expiry_state: 'no_expiry',
  uploaded_at: '2026-08-21T10:00:00Z',
  submission_source: 'employee',
  review_status: 'rejected',
  review_note: 'Letterhead is missing — please re-upload',
  can_preview: true,
  can_download: true,
  can_resubmit: true,
}

const requiredRows = [
  { document_type_id: 'type-pan', name: 'PAN Card', code: 'pan', required: true, employee_upload_allowed: true, default_visibility: 'employee_visible', status: 'pending', can_upload: false, document_id: 'doc-pending', current_version: 1, filename: 'pan-pending.pdf', review_note: null },
  { document_type_id: 'type-exp', name: 'Experience Letter', code: 'experience_letter', required: true, employee_upload_allowed: true, default_visibility: 'employee_visible', status: 'rejected', can_upload: true, document_id: 'doc-rejected', current_version: 2, filename: 'experience-rejected.pdf', review_note: 'Letterhead is missing — please re-upload' },
  { document_type_id: 'type-bank', name: 'Bank Document', code: 'bank_document', required: true, employee_upload_allowed: false, default_visibility: 'hr_only', status: 'missing', can_upload: false, document_id: null, current_version: 0, filename: null, review_note: null },
]

const uploadableRows = [
  { document_type_id: 'type-pan', name: 'PAN Card', code: 'pan', required: true, employee_upload_allowed: true, default_visibility: 'employee_visible', status: 'pending', can_upload: false },
  { document_type_id: 'type-exp', name: 'Experience Letter', code: 'experience_letter', required: true, employee_upload_allowed: true, default_visibility: 'employee_visible', status: 'rejected', can_upload: true, document_id: 'doc-rejected' },
  { document_type_id: 'type-passport', name: 'Passport', code: 'passport', required: false, employee_upload_allowed: true, default_visibility: 'employee_visible', status: 'missing', can_upload: true, document_id: null },
]

const renderPage = () => render(<MyDocuments />)

beforeEach(() => {
  vi.clearAllMocks()
  useMyProfile.mockReturnValue({ data: profile, isLoading: false, isError: false })
  useMyDocuments.mockReturnValue({
    data: { items: [pendingDoc, rejectedDoc], total: 2 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })
  useMyDocumentStatus.mockReturnValue({
    data: { required: requiredRows, uploadable: uploadableRows },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })
  useMyDocumentActions.mockReturnValue({
    isLoading: false,
    mutateAsync: vi.fn().mockResolvedValue({ id: 'doc-new' }),
  })
})

describe('MyDocuments (employee self-service)', () => {
  it('renders required documents with distinct review statuses and rejection reason', async () => {
    renderPage()

    expect(screen.getByText('Required Documents')).toBeInTheDocument()
    // Required rows: PAN pending, Experience Letter rejected (+ reason), Bank missing.
    expect(screen.getAllByText('Pending Review').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Rejected').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Missing').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Letterhead is missing/).length).toBeGreaterThanOrEqual(1)
    // Document table carries the same states + notes.
    expect(screen.getAllByText('pan-pending.pdf').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Submitted by me').length).toBeGreaterThanOrEqual(1)
  })

  it('lets the employee resubmit a rejected document', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: 'doc-new' })
    useMyDocumentActions.mockReturnValue({ isLoading: false, mutateAsync })

    renderPage()

    const resubmitButtons = screen.getAllByRole('button', { name: /Resubmit/i })
    expect(resubmitButtons.length).toBeGreaterThanOrEqual(2) // required card + doc row
    fireEvent.click(resubmitButtons[0])

    const dialog = await screen.findByRole('dialog')
    // The rejected type is pre-selected.
    expect(within(dialog).getByLabelText('Document type')).toHaveValue('type-exp')

    const file = new File(['content'], 'experience-v3.pdf', { type: 'application/pdf' })
    fireEvent.change(within(dialog).getByLabelText('Choose file'), { target: { files: [file] } })
    fireEvent.click(within(dialog).getByRole('button', { name: /Resubmit$/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    const formData = mutateAsync.mock.calls[0][0]
    expect(formData.get('document_type_id')).toBe('type-exp')
    expect(formData.get('file')).toBe(file)
    expect(toast.success).toHaveBeenCalled()
  })

  it('submits a brand-new upload from the header Upload button', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: 'doc-new' })
    useMyDocumentActions.mockReturnValue({ isLoading: false, mutateAsync })

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /Upload Document/i }))
    await waitFor(() => expect(screen.getByRole('option', { name: 'Select a document type…' })).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Document type'), { target: { value: 'type-passport' } })
    const file = new File(['content'], 'passport.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Choose file'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: /Submit for Review/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    const formData = mutateAsync.mock.calls[0][0]
    expect(formData.get('document_type_id')).toBe('type-passport')
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('pending HR review'))
  })

  it('does not offer the upload button when no type is uploadable', async () => {
    useMyDocumentStatus.mockReturnValue({
      data: { required: requiredRows, uploadable: uploadableRows.map((row) => ({ ...row, can_upload: false })) },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderPage()

    expect(screen.getByRole('button', { name: /Upload Document/i })).toBeDisabled()
  })
})
