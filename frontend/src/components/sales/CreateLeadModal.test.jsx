import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import CreateLeadModal from './CreateLeadModal'
import { salesApi } from '../../api/sales'
import { useQuery } from 'react-query'

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('react-query', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn((mutationFn) => ({
    mutate: vi.fn((payload) => mutationFn(payload)),
    isLoading: false,
  })),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}))

vi.mock('../../api/sales', () => ({
  salesApi: {
    getCategories: vi.fn(),
    getStages: vi.fn(),
    getProducts: vi.fn(),
    createLead: vi.fn(),
    createCategory: vi.fn(),
    createProduct: vi.fn(),
  },
}))

vi.mock('../../api/users', () => ({
  usersAPI: { getAssignableUsers: vi.fn() },
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'u1', first_name: 'Admin', role: 'admin', modules: ['sales_crm'] } }),
}))

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))

const seedQueries = () => {
  useQuery.mockImplementation((key) => {
    if (key === 'crm-lead-categories') return { data: { categories: [{ id: 'cat-1', name: 'Retail' }] } }
    if (key === 'crm-lead-stages') return { data: { stages: [{ key: 'acquire', name: 'Acquire' }] } }
    if (key === 'crm-lead-users') return { data: { users: [{ id: 'u1', first_name: 'Ada', last_name: 'Admin', role: 'admin', status: 'active' }] } }
    if (key === 'crm-lead-products') return { data: { products: [{ id: 'prod-1', name: 'CRM Suite' }] } }
    return { data: undefined }
  })
}

const renderModal = (props = {}) => render(
  <CreateLeadModal isOpen onClose={vi.fn()} {...props} />
)

describe('CreateLeadModal (shared lead creation form)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seedQueries()
  })

  it('renders every lead field including + New category and + New product', () => {
    renderModal()

    // Full field set — the same form everywhere, no reduced variant.
    expect(screen.getByPlaceholderText('First name')).toBeTruthy()
    expect(screen.getByPlaceholderText('Last name')).toBeTruthy()
    expect(screen.getByPlaceholderText('9876543210')).toBeTruthy()
    expect(screen.getByPlaceholderText('Email')).toBeTruthy()
    expect(screen.getByPlaceholderText('Company name')).toBeTruthy()
    expect(screen.getByText('Select category')).toBeTruthy()
    expect(screen.getByText('Select product')).toBeTruthy()
    expect(screen.getByText('Select stage')).toBeTruthy()
    expect(screen.getByText('Select owner')).toBeTruthy()
    expect(screen.getByText('Interest level')).toBeTruthy()
    expect(screen.getByText('Estimated close date')).toBeTruthy()
    expect(screen.getByPlaceholderText('Tags, pipe-separated')).toBeTruthy()
    expect(screen.getByPlaceholderText('Remark')).toBeTruthy()

    // Quick-creation flows must be present on every entry point.
    expect(screen.getByText('+ New category')).toBeTruthy()
    expect(screen.getByText('+ New product')).toBeTruthy()
  })

  it('rejects an invalid phone format before creating the lead', () => {
    renderModal()

    // Native HTML5 `required` blocks the fully empty submit, so exercise the
    // component guard with a value that passes `required` but fails validation.
    fireEvent.change(screen.getByPlaceholderText('9876543210'), { target: { value: '123' } })
    fireEvent.click(screen.getByText('Save lead'))

    expect(toast.error).toHaveBeenCalledWith('Use a + country code and exactly 10 phone digits')
    expect(salesApi.createLead).not.toHaveBeenCalled()
  })

  it('creates the lead with all entered details', () => {
    renderModal()

    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Ravi' } })
    fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'Sharma' } })
    fireEvent.change(screen.getByPlaceholderText('9876543210'), { target: { value: '9876543210' } })
    fireEvent.change(screen.getByPlaceholderText('Company name'), { target: { value: 'Acme Corp' } })
    fireEvent.change(screen.getByPlaceholderText('Tags, pipe-separated'), { target: { value: 'hot | enterprise' } })
    fireEvent.click(screen.getByText('Save lead'))

    expect(salesApi.createLead).toHaveBeenCalledTimes(1)
    const payload = salesApi.createLead.mock.calls[0][0]
    expect(payload).toMatchObject({
      first_name: 'Ravi',
      last_name: 'Sharma',
      phone: '9876543210',
      country_code: '+91',
      company_name: 'Acme Corp',
      tag: 'hot | enterprise',
      // Defaults are pre-filled from the shared queries.
      category_id: 'cat-1',
      product_ids: 'prod-1',
      current_stage: 'acquire',
      assigned_to: 'u1',
    })
  })

  it('opens the Create category modal from + New category and saves a category', () => {
    renderModal()

    fireEvent.click(screen.getByText('+ New category'))
    expect(screen.getByText('Create category')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('New category name'), { target: { value: 'Enterprise' } })
    fireEvent.click(screen.getByText('Save category'))
    expect(salesApi.createCategory).toHaveBeenCalledWith({ name: 'Enterprise' })
  })

  it('opens the Create product modal from + New product and saves a product', () => {
    renderModal()

    fireEvent.click(screen.getByText('+ New product'))
    expect(screen.getByText('Create product')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('New product name'), { target: { value: 'CRM Suite' } })
    // Product requires a category — missing category must be rejected.
    fireEvent.click(screen.getByText('Save product'))
    expect(toast.error).toHaveBeenCalledWith('Category is required')
    expect(salesApi.createProduct).not.toHaveBeenCalled()
  })
})
