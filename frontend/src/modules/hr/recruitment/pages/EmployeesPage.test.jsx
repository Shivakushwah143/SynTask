import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import EmployeesPage from './EmployeesPage'
import { employeesApi } from '../../../../api/employees'
import { departmentsAPI } from '../../../../api/departments'
import { usersAPI } from '../../../../api/users'
import { authAPI } from '../../../../api/auth'

vi.mock('../../../../api/auth', () => ({
  authAPI: { getMe: vi.fn() },
}))

vi.mock('../../../../api/employees', () => ({
  employeesApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('../../../../api/departments', () => ({
  departmentsAPI: { listDepartments: vi.fn() },
}))

vi.mock('../../../../api/users', () => ({
  usersAPI: { getAssignableUsers: vi.fn() },
}))

vi.mock('../../../../store/authStore', () => ({
  useAuthStore: () => ({ user: { role: 'admin', modules: [], company_id: 'company-1' } }),
}))

vi.mock('../components/EmployeeFormModal', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: ({ open, onClose, mode }) =>
      open ? (
        <div data-testid="employee-form-modal">
          <button onClick={onClose}>Close</button>
          <span>{mode === 'create' ? 'Add Employee' : 'Edit Employee'}</span>
        </div>
      ) : null,
    EMPLOYMENT_TYPES: actual.EMPLOYMENT_TYPES,
    EMPLOYMENT_STATUSES: actual.EMPLOYMENT_STATUSES,
    WORK_MODES: actual.WORK_MODES,
  }
})

const departments = [{ id: 'dept-1', name: 'Engineering' }]

const employee = {
  id: 'emp-1',
  employee_number: 'EMP-2026-0001',
  user_id: 'u-1',
  full_name: 'Jane Doe',
  email: 'jane@example.com',
  department_id: 'dept-1',
  department_name: 'Engineering',
  designation: 'Senior Engineer',
  manager_name: 'John Smith',
  employment_type: 'full_time',
  joining_date: '2026-08-01T00:00:00Z',
  employment_status: 'active',
  work_mode: 'remote',
  work_location: 'Remote',
}

const createTestQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/hr/employees']}>
      <QueryClientProvider client={createTestQueryClient()}>
        <EmployeesPage />
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
  departmentsAPI.listDepartments.mockResolvedValue(departments)
  usersAPI.getAssignableUsers.mockResolvedValue({ users: [] })
})

describe('EmployeesPage', () => {
  it('renders employees from the real API', async () => {
    employeesApi.list.mockResolvedValue({ data: { items: [employee], total: 1, page: 1, page_size: 20, has_next: false } })

    renderPage()

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())
    expect(screen.getByText('EMP-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('Engineering')).toBeInTheDocument()
    expect(screen.getByText('Senior Engineer')).toBeInTheDocument()
    expect(screen.getByText('John Smith')).toBeInTheDocument()
    expect(employeesApi.list).toHaveBeenCalled()
  })

  it('shows a loading state before data arrives', async () => {
    let resolveList
    employeesApi.list.mockReturnValue(new Promise((resolve) => { resolveList = resolve }))

    renderPage()

    expect(document.querySelector('.animate-pulse')).not.toBeNull()
    resolveList({ data: { items: [], total: 0, page: 1, page_size: 20, has_next: false } })
    await waitFor(() => expect(screen.getByText('No employees yet')).toBeInTheDocument())
  })

  it('shows the empty state with guidance', async () => {
    employeesApi.list.mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 20, has_next: false } })

    renderPage()

    await waitFor(() => expect(screen.getByText('No employees yet')).toBeInTheDocument())
    expect(screen.getByText(/Create an employee profile or convert a joined candidate/)).toBeInTheDocument()
  })

  it('shows an error state and retries', async () => {
    employeesApi.list.mockRejectedValueOnce(new Error('boom'))
    employeesApi.list.mockResolvedValue({ data: { items: [employee], total: 1, page: 1, page_size: 20, has_next: false } })

    renderPage()

    await waitFor(() => expect(screen.getByText('Failed to load employees')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Try Again/i }))
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())
  })

  it('searches via the backend (debounced)', async () => {
    employeesApi.list.mockResolvedValue({ data: { items: [employee], total: 1, page: 1, page_size: 20, has_next: false } })

    renderPage()

    const searchInput = screen.getByPlaceholderText(/Search by name/)
    fireEvent.change(searchInput, { target: { value: 'Jane' } })

    await waitFor(
      () => expect(employeesApi.list).toHaveBeenCalledWith(expect.objectContaining({ search: 'Jane' })),
      { timeout: 2000 },
    )
  })

  it('filters by department and employment status', async () => {
    employeesApi.list.mockResolvedValue({ data: { items: [employee], total: 1, page: 1, page_size: 20, has_next: false } })

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /Filters/i }))
    await waitFor(() => expect(screen.getByRole('option', { name: 'Engineering' })).toBeInTheDocument())
    const departmentSelect = screen.getByLabelText('Filter by department')
    fireEvent.change(departmentSelect, { target: { value: 'dept-1' } })
    const statusSelect = screen.getByLabelText('Filter by employment status')
    fireEvent.change(statusSelect, { target: { value: 'active' } })

    await waitFor(() =>
      expect(employeesApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ department_id: 'dept-1', employment_status: 'active' }),
      ),
    )
  })

  it('paginates to the next page', async () => {
    employeesApi.list.mockResolvedValue({ data: { items: [employee], total: 25, page: 1, page_size: 20, has_next: true } })

    renderPage()

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))

    await waitFor(() => expect(employeesApi.list).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })))
  })

  it('navigates to the employee detail page on row click', async () => {
    employeesApi.list.mockResolvedValue({ data: { items: [employee], total: 1, page: 1, page_size: 20, has_next: false } })

    render(
      <MemoryRouter initialEntries={['/hr/employees']}>
        <QueryClientProvider client={createTestQueryClient()}>
          <Routes>
            <Route path="/hr/employees" element={<EmployeesPage />} />
            <Route path="/hr/employees/:employeeId" element={<div data-testid="detail-page">Detail</div>} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Jane Doe'))

    await waitFor(() => expect(screen.getByTestId('detail-page')).toBeInTheDocument())
  })

  it('opens the add employee modal for admins', async () => {
    employeesApi.list.mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 20, has_next: false } })

    renderPage()

    await waitFor(() => expect(screen.getAllByRole('button', { name: /Add Employee/i }).length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByRole('button', { name: /Add Employee/i })[0])

    expect(screen.getByTestId('employee-form-modal')).toBeInTheDocument()
  })
})
