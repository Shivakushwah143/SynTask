import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import Sidebar from './Sidebar'

vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({
    user: {
      role: 'admin',
      modules: ['task', 'invoicing_ledger'],
      first_name: 'Admin',
      last_name: 'User',
    },
  }),
}))

vi.mock('../api/departments', () => ({
  DEPARTMENTS_CHANGED_EVENT: 'departments-changed',
  departmentsAPI: {
    listDepartments: vi.fn().mockResolvedValue([]),
  },
}))

describe('Sidebar client navigation', () => {
  it('shows Clients in a separate Client Management section', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar isOpen onClose={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: /client management/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^clients$/i }).getAttribute('href')).toBe('/clients')
  })
})
