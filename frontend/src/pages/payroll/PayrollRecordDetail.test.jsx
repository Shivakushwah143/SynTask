import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PayrollRecordDetail from './PayrollRecordDetail'
import { payrollAPI, payrollFiles } from '../../api/payroll'

vi.mock('../../api/payroll', () => ({
  payrollAPI: {
    getRecord: vi.fn(),
    generatePayslip: vi.fn(),
    regeneratePayslip: vi.fn(),
    getRecordPayslips: vi.fn(),
  },
  payrollFiles: {
    preview: vi.fn(),
    download: vi.fn(),
  },
}))

const makeRecord = (overrides = {}) => ({
  id: 'record-1',
  payroll_period_id: 'period-1',
  employee_id: 'emp-1',
  employee_name: 'John Doe',
  employee_number: 'EMP-2026-0001',
  department: 'Engineering',
  designation: 'Software Engineer',
  attendance_snapshot: { working_days: 22, present_days: 20, paid_leave_days: 1, unpaid_leave_days: 0, absent_days: 0, half_days: 0, holiday_days: 0, week_off_days: 0 },
  payable_days: 21,
  earnings: [{ component_name: 'Basic Salary', calculated_amount: 30000, proration_factor: 1 }],
  deductions: [{ component_name: 'PF', calculated_amount: 1800 }],
  gross_salary: 50000,
  total_deductions: 3800,
  net_salary: 46200,
  payslip: { generated: false },
  can_generate: true,
  can_preview: false,
  can_download: false,
  can_regenerate: false,
  warnings: [],
  blockers: [],
  ...overrides,
})

const generatedPayslip = {
  payslip: { generated: true, payslip_id: 'ps-1', version: 1, generated_at: '2026-08-13T10:00:00Z', file_name: 'PAYSLIP-EMP-2026-0001-2026-08.pdf', file_size: 1234 },
  can_generate: false,
  can_preview: true,
  can_download: true,
  can_regenerate: true,
}

const renderPage = (record) => {
  payrollAPI.getRecord.mockResolvedValue({ data: record })
  return render(
    <MemoryRouter initialEntries={['/hr/payroll/period-1/records/record-1']}>
      <Routes>
        <Route path="/hr/payroll/:periodId/records/:recordId" element={<PayrollRecordDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom does not implement object URLs.
  Object.defineProperty(window.URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), writable: true, configurable: true })
  Object.defineProperty(window.URL, 'revokeObjectURL', { value: vi.fn(), writable: true, configurable: true })
})

describe('PayrollRecordDetail — Payslip', () => {
  it('shows Generate for a processed record that can generate', async () => {
    renderPage(makeRecord())

    await waitFor(() => expect(screen.getByText('Not Generated')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Generate Payslip/i })).toBeInTheDocument()
  })

  it('does not show Generate when the record cannot generate', async () => {
    renderPage(makeRecord({ can_generate: false, payslip: { generated: false } }))

    await waitFor(() => expect(screen.getByText('Not Generated')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Generate Payslip/i })).not.toBeInTheDocument()
  })

  it('generates a payslip and reloads the record', async () => {
    payrollAPI.generatePayslip.mockResolvedValue({ data: { id: 'ps-1', version: 1 } })
    renderPage(makeRecord())

    await waitFor(() => expect(screen.getByRole('button', { name: /Generate Payslip/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Generate Payslip/i }))

    await waitFor(() => expect(payrollAPI.generatePayslip).toHaveBeenCalledWith('record-1'))
    expect(payrollAPI.getRecord).toHaveBeenCalled()
  })

  it('shows an error toast when generation fails', async () => {
    payrollAPI.generatePayslip.mockRejectedValue({ response: { data: { detail: 'Payslip can only be generated after payroll is processed.' } } })
    renderPage(makeRecord())

    await waitFor(() => expect(screen.getByRole('button', { name: /Generate Payslip/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Generate Payslip/i }))

    await waitFor(() => expect(payrollAPI.generatePayslip).toHaveBeenCalled())
    expect(payrollAPI.getRecord).toHaveBeenCalledTimes(1)
  })

  it('shows Generated status with Preview/Download/Regenerate/History actions', async () => {
    renderPage(makeRecord(generatedPayslip))

    await waitFor(() => expect(screen.getByText('Generated')).toBeInTheDocument())
    expect(screen.getByText('V1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Preview/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Regenerate/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /History/i })).toBeInTheDocument()
  })

  it('hides Preview/Download for users without view permission', async () => {
    renderPage(makeRecord({ ...generatedPayslip, can_preview: false, can_download: false, can_regenerate: false }))

    await waitFor(() => expect(screen.getByText('Generated')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Preview/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Download/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Regenerate/i })).not.toBeInTheDocument()
  })

  it('previews the payslip as an authorized blob in a modal', async () => {
    payrollFiles.preview.mockResolvedValue({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) })
    const { container } = renderPage(makeRecord(generatedPayslip))

    await waitFor(() => expect(screen.getByRole('button', { name: /Preview/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Preview/i }))

    await waitFor(() => expect(payrollFiles.preview).toHaveBeenCalledWith('ps-1'))
    await waitFor(() => expect(container.querySelector('iframe')).not.toBeNull())
  })

  it('shows a preview error state', async () => {
    payrollFiles.preview.mockRejectedValue({ response: { data: { detail: 'You do not have permission to preview this payslip' } } })
    renderPage(makeRecord(generatedPayslip))

    await waitFor(() => expect(screen.getByRole('button', { name: /Preview/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Preview/i }))

    await waitFor(() => expect(screen.getByText(/Preview unavailable/i)).toBeInTheDocument())
    expect(screen.getByText(/do not have permission/i)).toBeInTheDocument()
  })

  it('downloads the payslip through the authorized blob endpoint', async () => {
    payrollFiles.download.mockResolvedValue({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }), headers: {} })
    renderPage(makeRecord(generatedPayslip))

    await waitFor(() => expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Download/i }))

    await waitFor(() => expect(payrollFiles.download).toHaveBeenCalledWith('ps-1'))
    expect(window.URL.createObjectURL).toHaveBeenCalled()
  })

  it('regenerates after confirmation and reloads', async () => {
    payrollAPI.regeneratePayslip.mockResolvedValue({ data: { id: 'ps-2', version: 2 } })
    renderPage(makeRecord(generatedPayslip))

    await waitFor(() => expect(screen.getByRole('button', { name: /Regenerate/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Regenerate/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Regenerate Payslip\?/i)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /^Regenerate$/i }))

    await waitFor(() => expect(payrollAPI.regeneratePayslip).toHaveBeenCalledWith('ps-1'))
    expect(payrollAPI.getRecord).toHaveBeenCalled()
  })

  it('shows version history from the record payslips endpoint', async () => {
    payrollAPI.getRecordPayslips.mockResolvedValue({
      data: [
        { id: 'ps-2', version: 2, file_name: 'PAYSLIP-EMP-2026-0001-2026-08.pdf', generated_at: '2026-08-14T10:00:00Z', can_preview: true, can_download: true },
        { id: 'ps-1', version: 1, file_name: 'PAYSLIP-EMP-2026-0001-2026-08.pdf', generated_at: '2026-08-13T10:00:00Z', can_preview: true, can_download: true },
      ],
    })
    renderPage(makeRecord(generatedPayslip))

    await waitFor(() => expect(screen.getByRole('button', { name: /History/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /History/i }))

    await waitFor(() => expect(payrollAPI.getRecordPayslips).toHaveBeenCalledWith('record-1'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('V2')).toBeInTheDocument()
    expect(within(dialog).getByText('V1')).toBeInTheDocument()
  })
})
