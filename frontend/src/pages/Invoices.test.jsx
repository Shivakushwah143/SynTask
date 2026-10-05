import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

const apiMocks = vi.hoisted(() => ({
  downloadInvoicePdf: vi.fn(),
  listInvoices: vi.fn(),
  getInvoice: vi.fn(),
  sendInvoiceEmail: vi.fn(),
  deleteInvoice: vi.fn(),
  listClients: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: toastMock }))

vi.mock('../api/invoices', () => ({
  invoicesAPI: apiMocks,
}))

vi.mock('../api/clients', () => ({
  clientsAPI: { listClients: apiMocks.listClients },
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({ user: { role: 'admin', company_id: 'company-1' } }),
}))

vi.mock('../hooks/useConfirmation', () => ({
  useConfirmation: () => ({ confirm: vi.fn(), showUndoNotification: vi.fn() }),
}))

vi.mock('../components/EmailComposer', () => ({ EmailComposer: () => null }))
vi.mock('../components/ui', () => ({ CreatableSelectField: () => null }))
vi.mock('../components/relatedRecords/QuickCreateModals', () => ({ QuickCreateClientModal: () => null }))

import Invoices from './Invoices'

const invoiceRow = {
  id: 'inv-1',
  invoice_number: 'INV-2026-0001',
  client_name: 'Acme Corp',
  client_company_name: 'Acme Corporation',
  invoice_type: 'tax',
  invoice_date: '2026-07-15T00:00:00Z',
  total_amount: 2360,
  status: 'sent',
}

beforeEach(() => {
  vi.clearAllMocks()
  window.URL.createObjectURL = vi.fn(() => 'blob:mock')
  window.URL.revokeObjectURL = vi.fn()
  apiMocks.listInvoices.mockResolvedValue({ invoices: [invoiceRow], total: 1 })
  apiMocks.listClients.mockResolvedValue({ clients: [] })
  apiMocks.downloadInvoicePdf.mockResolvedValue({
    data: new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' }),
    headers: { 'content-disposition': 'attachment; filename="INV-2026-0001.pdf"' },
  })
})

const renderPage = async () => {
  render(<Invoices />)
  await screen.findByText('INV-2026-0001')
}

const getDownloadButton = () => screen.getByTestId('download-pdf-inv-1')

describe('Invoices PDF download', () => {
  test('successfully downloads the Blob with the backend filename and shows one success toast', async () => {
    await renderPage()

    fireEvent.click(getDownloadButton())

    await waitFor(() => expect(apiMocks.downloadInvoicePdf).toHaveBeenCalledWith('inv-1'))
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledTimes(1))
    expect(toastMock.success).toHaveBeenCalledWith('Invoice PDF downloaded! 📥')
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  test('shows exactly one error toast with the decoded backend message', async () => {
    const errorBlob = new Blob([JSON.stringify({ detail: 'Invoice PDF could not be generated' })], { type: 'application/json' })
    apiMocks.downloadInvoicePdf.mockRejectedValue({
      config: { responseType: 'blob' },
      response: { status: 500, data: errorBlob },
    })
    await renderPage()

    fireEvent.click(getDownloadButton())

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1))
    expect(toastMock.error).toHaveBeenCalledWith('Invoice PDF could not be generated')
    expect(toastMock.success).not.toHaveBeenCalled()
  })

  test('disables the button during download and restores it after success', async () => {
    let resolveDownload
    apiMocks.downloadInvoicePdf.mockReturnValue(
      new Promise((resolve) => {
        resolveDownload = resolve
      })
    )
    await renderPage()

    fireEvent.click(getDownloadButton())

    await waitFor(() => expect(getDownloadButton()).toBeDisabled())

    resolveDownload({
      data: new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' }),
      headers: { 'content-disposition': 'attachment; filename="INV-2026-0001.pdf"' },
    })

    await waitFor(() => expect(getDownloadButton()).not.toBeDisabled())
    expect(toastMock.success).toHaveBeenCalledTimes(1)
  })

  test('prevents duplicate downloads while a request is in flight', async () => {
    apiMocks.downloadInvoicePdf.mockReturnValue(new Promise(() => {}))
    await renderPage()

    fireEvent.click(getDownloadButton())
    await waitFor(() => expect(getDownloadButton()).toBeDisabled())

    // The in-flight ref guard blocks a second request even if a click lands.
    fireEvent.click(getDownloadButton())
    await waitFor(() => expect(apiMocks.downloadInvoicePdf).toHaveBeenCalledTimes(1))
  })

  test('restores the button after a failed download', async () => {
    const errorBlob = new Blob([JSON.stringify({ detail: 'Invoice PDF could not be generated' })], { type: 'application/json' })
    apiMocks.downloadInvoicePdf.mockRejectedValue({
      config: { responseType: 'blob' },
      response: { status: 500, data: errorBlob },
    })
    await renderPage()

    fireEvent.click(getDownloadButton())

    await waitFor(() => expect(getDownloadButton()).not.toBeDisabled())
    expect(toastMock.error).toHaveBeenCalledTimes(1)
  })
})
