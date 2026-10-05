import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SalaryTab from './SalaryTab'
import { salaryAPI } from '../../../../api/salary'

vi.mock('../../../../api/salary', () => ({
  salaryAPI: {
    getEmployeeSalary: vi.fn(),
    getEmployeeSalaryHistory: vi.fn(),
  },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const structure = {
  id: 'salary-1',
  employee_id: 'u-1',
  effective_from: '2026-01-01T00:00:00Z',
  effective_to: null,
  currency: 'INR',
  pay_frequency: 'monthly',
  status: 'active',
  items: [
    { component_id: 'c1', component_name: 'Basic', component_type: 'earning', calculation_type: 'fixed', calculated_amount: 30000 },
    { component_id: 'c2', component_name: 'PF', component_type: 'deduction', calculation_type: 'fixed', calculated_amount: 1800 },
  ],
  total_earnings: 30000,
  total_configured_deductions: 1800,
  configured_net: 28200,
}

beforeEach(() => {
  vi.clearAllMocks()
  salaryAPI.getEmployeeSalary.mockResolvedValue({ data: { current: structure, upcoming: null } })
  salaryAPI.getEmployeeSalaryHistory.mockResolvedValue({ data: [structure] })
})

describe('SalaryTab', () => {
  it('renders the current salary structure from the API', async () => {
    render(<SalaryTab employeeId="u-1" canManage={false} onAssign={vi.fn()} onRevise={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Current Salary Structure')).toBeInTheDocument())
    expect(salaryAPI.getEmployeeSalary).toHaveBeenCalledWith('u-1')
    expect(screen.getByText('Basic')).toBeInTheDocument()
    expect(screen.getByText('PF')).toBeInTheDocument()
    expect(screen.getByText(/Configured Net/)).toBeInTheDocument()
  })

  it('calls the onAssign callback when no salary exists', async () => {
    salaryAPI.getEmployeeSalary.mockResolvedValue({ data: { current: null, upcoming: null } })
    salaryAPI.getEmployeeSalaryHistory.mockResolvedValue({ data: [] })
    const onAssign = vi.fn()

    render(<SalaryTab employeeId="u-1" canManage onAssign={onAssign} onRevise={vi.fn()} />)

    await waitFor(() => expect(screen.getByText(/No salary structure assigned/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Assign Salary Structure/i }))

    expect(onAssign).toHaveBeenCalledTimes(1)
  })

  it('does not show assign controls without canManage', async () => {
    salaryAPI.getEmployeeSalary.mockResolvedValue({ data: { current: null, upcoming: null } })
    salaryAPI.getEmployeeSalaryHistory.mockResolvedValue({ data: [] })

    render(<SalaryTab employeeId="u-1" canManage={false} onAssign={vi.fn()} onRevise={vi.fn()} />)

    await waitFor(() => expect(screen.getByText(/No salary structure assigned/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Assign Salary Structure/i })).toBeNull()
  })

  it('calls the onRevise callback from the revise button', async () => {
    const onRevise = vi.fn()

    render(<SalaryTab employeeId="u-1" canManage onAssign={vi.fn()} onRevise={onRevise} />)

    await waitFor(() => expect(screen.getByText('Current Salary Structure')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Revise Salary/i }))

    expect(onRevise).toHaveBeenCalledTimes(1)
  })

  it('does not show revise controls without canManage', async () => {
    render(<SalaryTab employeeId="u-1" canManage={false} onAssign={vi.fn()} onRevise={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Current Salary Structure')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Revise Salary/i })).toBeNull()
  })

  it('shows the error state when salary is not visible', async () => {
    salaryAPI.getEmployeeSalary.mockRejectedValue({ response: { status: 403, data: { detail: 'Forbidden' } } })

    render(<SalaryTab employeeId="u-1" canManage={false} onAssign={vi.fn()} onRevise={vi.fn()} />)

    await waitFor(() => expect(screen.getByText(/You do not have permission to view salary/)).toBeInTheDocument())
  })
})
