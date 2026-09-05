import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import SalaryComponentsPage from '../attendance/SalaryComponentsPage'
import SalaryStructuresPage from './SalaryStructuresPage'
import { salaryAPI } from '../../api/salary'

vi.mock('../../api/salary', () => ({
  salaryAPI: {
    listComponents: vi.fn(),
    listStructures: vi.fn(),
    createComponent: vi.fn(),
    updateComponent: vi.fn(),
  },
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

function renderWithRouter(ui, { route = '/' } = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="*" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SalaryComponentsPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders empty state when no components exist', async () => {
    salaryAPI.listComponents.mockResolvedValue({ data: [] })
    renderWithRouter(<SalaryComponentsPage />)
    await waitFor(() => {
      expect(screen.getByText(/No salary components configured/)).toBeInTheDocument()
    })
    expect(salaryAPI.listComponents).toHaveBeenCalled()
  })

  it('renders error state on API failure (not a crash)', async () => {
    salaryAPI.listComponents.mockRejectedValue({
      response: { data: { detail: 'Internal server error' } }
    })
    renderWithRouter(<SalaryComponentsPage />)
    await waitFor(() => {
      expect(screen.getByText(/Could not load components/)).toBeInTheDocument()
    })
  })

  it('uses salary API, not payroll API, for components', async () => {
    salaryAPI.listComponents.mockResolvedValue({ data: [] })
    renderWithRouter(<SalaryComponentsPage />)
    await waitFor(() => {
      expect(salaryAPI.listComponents).toHaveBeenCalled()
    })
    // SalaryComponentsPage should call salaryAPI.listComponents, not payroll API
    expect(salaryAPI.listComponents).toHaveBeenCalledTimes(1)
  })
})

describe('SalaryStructuresPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders empty state when no structures exist', async () => {
    salaryAPI.listStructures.mockResolvedValue({ data: [] })
    renderWithRouter(<SalaryStructuresPage />)
    await waitFor(() => {
      expect(screen.getByText(/No salary structures yet/)).toBeInTheDocument()
    })
    expect(salaryAPI.listStructures).toHaveBeenCalled()
  })

  it('renders error state on API failure (not a crash)', async () => {
    salaryAPI.listStructures.mockRejectedValue({
      response: { data: { detail: 'Not Found' } }
    })
    renderWithRouter(<SalaryStructuresPage />)
    await waitFor(() => {
      expect(screen.getByText(/Could not load salary structures/)).toBeInTheDocument()
    })
  })

  it('renders salary structures when they exist', async () => {
    salaryAPI.listStructures.mockResolvedValue({
      data: [
        {
          id: 's1',
          employee_id: 'emp1',
          employee_name: 'John Doe',
          employee_number: 'EMP001',
          effective_from: '2026-01-01T00:00:00',
          effective_to: null,
          currency: 'INR',
          status: 'active',
          total_earnings: 50000,
          total_deductions: 5000,
          version: 1,
        }
      ]
    })
    renderWithRouter(<SalaryStructuresPage />)
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByText('EMP001')).toBeInTheDocument()
    })
  })

  it('uses salary API, not payroll API, for structures', async () => {
    salaryAPI.listStructures.mockResolvedValue({ data: [] })
    renderWithRouter(<SalaryStructuresPage />)
    await waitFor(() => {
      expect(salaryAPI.listStructures).toHaveBeenCalled()
    })
    // SalaryStructuresPage should call salaryAPI.listStructures, not payroll API
    expect(salaryAPI.listStructures).toHaveBeenCalledTimes(1)
  })
})
