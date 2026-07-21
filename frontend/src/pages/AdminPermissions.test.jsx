import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminPermissions from './AdminPermissions'

const mockGet = vi.hoisted(() => vi.fn())

vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({ user: { first_name: 'Admin', role: 'admin' } }),
}))

vi.mock('../api/axios', () => ({
  default: { get: mockGet, put: vi.fn(), post: vi.fn() },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams('?department=dept-2'), vi.fn()],
  }
})

describe('AdminPermissions department selection', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({
      data: {
        module_catalog: [],
        departments: [
          { id: 'dept-1', name: 'Operations', enabled_modules: [] },
          { id: 'dept-2', name: 'Engineering', enabled_modules: [] },
        ],
        employees: [],
        admins: [],
      },
    })
  })

  it('prefers the department from the URL query parameter', async () => {
    render(<AdminPermissions />)

    const select = await screen.findByLabelText(/Select department/i)
    expect(select.value).toBe('dept-2')
  })
})
