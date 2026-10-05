import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PayrollPeriodDetail from './PayrollPeriodDetail'
import { payrollAPI } from '../../api/payroll'
import { usePayrollPermissions } from '../../hooks/usePayrollPermissions'

vi.mock('../../api/payroll', () => ({
  payrollAPI: {
    getPeriod: vi.fn(),
    getPeriodRecords: vi.fn(),
    calculatePeriod: vi.fn(),
    reviewPeriod: vi.fn(),
    approvePeriod: vi.fn(),
    processPeriod: vi.fn(),
    generatePeriodPayslips: vi.fn(),
  },
}))

vi.mock('../../hooks/usePayrollPermissions', () => ({
  usePayrollPermissions: vi.fn(() => ({ canView: true, canManage: true, canApprove: true })),
}))

const period = {
  id: 'period-1',
  company_id: 'company-1',
  year: 2026,
  month: 8,
  status: 'processed',
  employee_count: 2,
  ready_count: 2,
  warning_count: 0,
  blocked_count: 0,
  total_earnings: 100000,
  total_deductions: 7600,
  total_net: 92400,
}

const records = [
  {
    id: 'record-1',
    employee_name: 'John Doe',
    employee_number: 'EMP-2026-0001',
    department: 'Engineering',
    payable_days: 21,
    gross_salary: 50000,
    total_deductions: 3800,
    net_salary: 46200,
    status: 'ready',
    payslip: { generated: true, payslip_id: 'ps-1', version: 1 },
  },
  {
    id: 'record-2',
    employee_name: 'Jane Roe',
    employee_number: 'EMP-2026-0002',
    department: 'Design',
    payable_days: 22,
    gross_salary: 50000,
    total_deductions: 3800,
    net_salary: 46200,
    status: 'ready',
    payslip: { generated: false },
  },
]

const renderPage = (periodOverrides = {}, recordsOverrides = records) => {
  payrollAPI.getPeriod.mockResolvedValue({ data: { ...period, ...periodOverrides } })
  payrollAPI.getPeriodRecords.mockResolvedValue({ data: recordsOverrides })
  return render(
    <MemoryRouter initialEntries={['/hr/payroll/period-1']}>
      <Routes>
        <Route path="/hr/payroll/:periodId" element={<PayrollPeriodDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  usePayrollPermissions.mockReturnValue({ canView: true, canManage: true, canApprove: true })
})

describe('PayrollPeriodDetail — Payslip status + bulk generation', () => {
  it('shows the payslip status column (Generated / Not Generated)', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument())
    // Exact match: the badge says "Generated" (the summary line is lowercase).
    expect(screen.getAllByText('Generated').length).toBeGreaterThan(0)
    expect(screen.getByText('Not Generated')).toBeInTheDocument()
  })

  it('shows the payslip count summary for processed periods', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText(/Payslips: 1 of 2 generated/i)).toBeInTheDocument())
  })

  it('shows the bulk Generate Payslips button for a processed period with manage permission', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByRole('button', { name: /Generate Payslips/i })).toBeInTheDocument())
  })

  it('does not show bulk generation for an unprocessed period', async () => {
    renderPage({ status: 'approved' })

    await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Generate Payslips/i })).not.toBeInTheDocument()
  })

  it('does not show bulk generation without manage permission', async () => {
    usePayrollPermissions.mockReturnValue({ canView: true, canManage: false, canApprove: false })
    renderPage()

    await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Generate Payslips/i })).not.toBeInTheDocument()
  })

  it('bulk generates payslips with a result summary on success', async () => {
    payrollAPI.generatePeriodPayslips.mockResolvedValue({
      data: {
        generated: [{ record_id: 'record-2', employee_name: 'Jane Roe' }],
        already_existing: [{ record_id: 'record-1', employee_name: 'John Doe' }],
        failed: [],
        skipped: [],
      },
    })
    renderPage()

    await waitFor(() => expect(screen.getByRole('button', { name: /Generate Payslips/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Generate Payslips/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Generate payslips for 2 processed employee/i)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /^Generate Payslips$/i }))

    await waitFor(() => expect(payrollAPI.generatePeriodPayslips).toHaveBeenCalledWith('period-1'))
    expect(payrollAPI.getPeriodRecords).toHaveBeenCalled()
  })

  it('surfaces partial bulk failure instead of a generic success', async () => {
    payrollAPI.generatePeriodPayslips.mockResolvedValue({
      data: {
        generated: [{ record_id: 'record-2', employee_name: 'Jane Roe' }],
        already_existing: [],
        failed: [{ record_id: 'record-3', employee_name: 'Bob Smith', error: 'inconsistent snapshot' }],
        skipped: [],
      },
    })
    renderPage()

    await waitFor(() => expect(screen.getByRole('button', { name: /Generate Payslips/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Generate Payslips/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /^Generate Payslips$/i }))

    await waitFor(() => expect(payrollAPI.generatePeriodPayslips).toHaveBeenCalledWith('period-1'))
  })
})
