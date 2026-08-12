import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SOPLibrary from './SOPLibrary'

const { mockUser } = vi.hoisted(() => ({
  mockUser: {
    role: 'admin',
    modules: ['task', 'tasks_projects', 'sales_crm', 'ai_agents', 'invoicing_ledger'],
  },
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}))

const renderPage = (path = '/sop-library') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sop-library" element={<SOPLibrary />} />
        <Route path="/sop-library/:moduleKey" element={<SOPLibrary />} />
        <Route path="/sop-library/:moduleKey/:articleKey" element={<SOPLibrary />} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  mockUser.role = 'admin'
  mockUser.modules = ['task', 'tasks_projects', 'sales_crm', 'ai_agents', 'invoicing_ledger']
})

describe('SOP Library', () => {
  it('opens the SOP Library home page', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /^sop library$/i })).toBeTruthy()
    expect(screen.getByText(/learn how to use syntask features and workflows/i)).toBeTruthy()
  })

  it('searches for create project SOPs', () => {
    renderPage()
    fireEvent.change(screen.getByPlaceholderText(/search sops/i), { target: { value: 'create project' } })
    expect(screen.getByRole('link', { name: /work create a project/i })).toBeTruthy()
  })

  it('searches for follow up SOPs when Sales is visible', () => {
    renderPage()
    fireEvent.change(screen.getByPlaceholderText(/search sops/i), { target: { value: 'follow up' } })
    expect(screen.getByRole('link', { name: /sales schedule a lead follow-up/i })).toBeTruthy()
  })

  it('opens an article route directly', () => {
    renderPage('/sop-library/work/create-project')
    expect(screen.getByRole('heading', { name: /^create a project$/i })).toBeTruthy()
    expect(screen.getByText(/sidebar -> work -> projects/i)).toBeTruthy()
  })

  it('shows a safe not found state for an unknown article', () => {
    renderPage('/sop-library/work/nope')
    expect(screen.getByRole('heading', { name: /sop not found/i })).toBeTruthy()
    expect(screen.getByText(/does not exist or is not available/i)).toBeTruthy()
  })

  it('filters module-specific articles without granting the hidden module', () => {
    mockUser.role = 'employee'
    mockUser.modules = []
    renderPage()

    expect(screen.getByRole('heading', { name: /^sop library$/i })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /finance/i })).toBeNull()

    fireEvent.change(screen.getByPlaceholderText(/search sops/i), { target: { value: 'invoice' } })
    expect(screen.queryByText(/manage invoices/i)).toBeNull()
    expect(screen.getByText(/no sops found/i)).toBeTruthy()
  })
})
