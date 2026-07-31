import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from './Sidebar'

// Mutable mock so tests can exercise role-based visibility (Phase 4, spec §9).
const { mockUser } = vi.hoisted(() => ({
  mockUser: {
    role: 'admin',
    modules: ['task', 'invoicing_ledger'],
    first_name: 'Admin',
    last_name: 'User',
  },
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}))

vi.mock('../api/departments', () => ({
  DEPARTMENTS_CHANGED_EVENT: 'departments-changed',
  departmentsAPI: {
    listDepartments: vi.fn().mockResolvedValue([]),
  },
}))

// Mutable mock so tests can exercise the Phase 6 unread badges without network calls.
const { mockInboxCounts } = vi.hoisted(() => ({
  mockInboxCounts: {
    whatsapp: 0,
    instagram: 0,
    messenger: 0,
    metaTotal: 0,
    notifications: 0,
    total: 0,
  },
}))

vi.mock('../hooks/useInboxUnreadCounts', () => ({
  useInboxUnreadCounts: () => mockInboxCounts,
}))

const SECTION_LABELS = [
  'Home',
  'Sales',
  'Clients',
  'Work',
  'Content',
  'Publishing',
  'Inbox',
  'AI Workspace',
  'People',
  'Finance',
  'Insights',
  'Settings',
]

const renderSidebar = (path = '/dashboard') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar isOpen onClose={vi.fn()} />
    </MemoryRouter>,
  )

// Section headers are buttons whose accessible name starts with the section label (the label +
// item-count badge). Anchor the regex so we don't accidentally match per-item favourite-star
// buttons ("Add All Clients to favourites") or other sections containing the word (e.g. "AI Workspace"
// contains "Work").
const expandSection = (label) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`, 'i') }))
}

beforeEach(() => {
  mockUser.role = 'admin'
  mockUser.modules = ['task', 'invoicing_ledger']
  Object.assign(mockInboxCounts, {
    whatsapp: 0,
    instagram: 0,
    messenger: 0,
    metaTotal: 0,
    notifications: 0,
    total: 0,
  })
  localStorage.clear()
})

describe('Sidebar v3 navigation', () => {
  it('shows exactly 12 top-level sections', () => {
    renderSidebar()
    for (const label of SECTION_LABELS) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`, 'i') })).toBeTruthy()
    }
  })

  it('renders the 12 sections in the exact spec order', () => {
    renderSidebar()
    const buttons = SECTION_LABELS.map((label) => screen.getByRole('button', { name: new RegExp(`^${label}`, 'i') }))
    const orderMatches = buttons.every((button, index) => {
      if (index === 0) return true
      return (buttons[index - 1].compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    })
    expect(orderMatches).toBe(true)
  })

  it('shows All Clients under the Clients section pointing to /clients', () => {
    renderSidebar()
    expandSection('Clients')
    expect(screen.getByRole('link', { name: /all clients/i }).getAttribute('href')).toBe('/clients')
  })

  it('keeps the People section labelled People, not Team', () => {
    renderSidebar()
    expect(screen.getByRole('button', { name: /^people/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^team/i })).toBeNull()
  })

  it('removes duplicate Departments, Subscriptions and Users entries', () => {
    renderSidebar()
    expandSection('People')
    expandSection('Finance')

    expect(screen.getAllByRole('link', { name: /departments/i })).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: /subscriptions/i })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: /^users$/i })).toBeNull()
    expect(screen.getByRole('link', { name: /employees/i })).toBeTruthy()
  })

  it('maps Work items to their existing routes', () => {
    renderSidebar()
    expandSection('Work')
    expect(screen.getByRole('link', { name: /^projects$/i }).getAttribute('href')).toBe('/projects')
    expect(screen.getByRole('link', { name: /^requests$/i }).getAttribute('href')).toBe('/tickets')
    expect(screen.getByRole('link', { name: /scheduled work/i }).getAttribute('href')).toBe('/scheduled-jobs')
    expect(screen.getByRole('link', { name: /time tracking/i }).getAttribute('href')).toBe('/timesheet')
  })

  it('maps Finance items to their existing routes', () => {
    renderSidebar()
    expandSection('Finance')
    expect(screen.getByRole('link', { name: /^invoices$/i }).getAttribute('href')).toBe('/invoices')
    expect(screen.getByRole('link', { name: /^transactions$/i }).getAttribute('href')).toBe('/ledger')
    expect(screen.getByRole('link', { name: /^subscriptions$/i }).getAttribute('href')).toBe('/subscriptions')
  })

  it('removes all legacy group labels (CRM Tools, Administration, Meta Omnichannel, etc.)', () => {
    renderSidebar()
    const legacy = /crm tools|administration|meta omnichannel|core operations|project delivery|people & activity|finance tools|ai & marketing|client management|your departments/i
    expect(screen.queryByRole('button', { name: legacy })).toBeNull()
  })
})

describe('Sidebar v3 role-based visibility (spec §9)', () => {
  it('shows only Home, Work and Inbox for an Employee role', () => {
    mockUser.role = 'employee'
    renderSidebar()

    for (const label of ['Home', 'Work', 'Inbox']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`, 'i') })).toBeTruthy()
    }
    const hidden = ['Sales', 'Clients', 'Content', 'Publishing', 'AI Workspace', 'People', 'Finance', 'Insights', 'Settings']
    for (const label of hidden) {
      expect(screen.queryByRole('button', { name: new RegExp(`^${label}`, 'i') })).toBeNull()
    }
  })

  it('hides Settings for a Manager', () => {
    mockUser.role = 'manager'
    renderSidebar()

    expect(screen.queryByRole('button', { name: /^settings/i })).toBeNull()
    expect(screen.getByRole('button', { name: /^sales/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^people/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^work/i })).toBeTruthy()
  })

  it('hides Settings for a Team Lead', () => {
    mockUser.role = 'lead'
    renderSidebar()

    expect(screen.queryByRole('button', { name: /^settings/i })).toBeNull()
    expect(screen.getByRole('button', { name: /^sales/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^inbox/i })).toBeTruthy()
  })

  it('shows Settings for a Sub Admin (inherits admin access)', () => {
    mockUser.role = 'sub_admin'
    renderSidebar()

    expect(screen.getByRole('button', { name: /^settings/i })).toBeTruthy()
  })

  it('does not show the Sales section for a non-sales employee', () => {
    mockUser.role = 'employee'
    renderSidebar()

    expect(screen.queryByRole('button', { name: /^sales/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /^leads$/i })).toBeNull()
  })

  it('renders no empty Finance header for a Manager (all Finance items are admin-gated)', () => {
    mockUser.role = 'manager'
    renderSidebar()

    // Section gate passes for a manager, but every Finance item is admin-only, so the
    // section must be suppressed entirely rather than showing a bare header.
    expect(screen.queryByRole('button', { name: /^finance/i })).toBeNull()
    expect(screen.getByRole('button', { name: /^insights/i })).toBeTruthy()
  })

  it('keeps a non-empty sidebar for a non-standard role (hr_manager falls through to item gates)', () => {
    mockUser.role = 'hr_manager'
    renderSidebar()

    // hr_manager is not in STANDARD_ROLES, so section gates must not blank the sidebar;
    // item-level gates still decide what is visible (meta channel items carry no roles).
    expect(screen.getByRole('button', { name: /^inbox/i })).toBeTruthy()
  })
})

describe('Sidebar v3 inbox unread badges (Phase 6)', () => {
  it('shows per-channel unread counts on Inbox items', () => {
    Object.assign(mockInboxCounts, {
      whatsapp: 45,
      instagram: 32,
      messenger: 0,
      metaTotal: 77,
      notifications: 3,
      total: 80,
    })
    renderSidebar()
    expandSection('Inbox')

    const whatsapp = screen.getByRole('link', { name: /^whatsapp$/i })
    expect(whatsapp.textContent).toContain('45')
    const instagram = screen.getByRole('link', { name: /^instagram$/i })
    expect(instagram.textContent).toContain('32')
    const notifications = screen.getByRole('link', { name: /^notifications$/i })
    expect(notifications.textContent).toContain('3')
  })

  it('shows the grand total on the Inbox section header', () => {
    Object.assign(mockInboxCounts, {
      whatsapp: 45,
      instagram: 32,
      messenger: 5,
      metaTotal: 82,
      notifications: 3,
      total: 85,
    })
    renderSidebar()

    expect(screen.getByRole('button', { name: /^inbox/i }).textContent).toContain('85')
  })

  it('hides badges when all counts are zero', () => {
    renderSidebar()
    expandSection('Inbox')

    const whatsapp = screen.getByRole('link', { name: /^whatsapp$/i })
    expect(whatsapp.textContent).not.toContain('0')
    // No numeric badge on the header either (only the item-count pill renders for other sections).
    expect(screen.getByRole('button', { name: /^inbox/i }).textContent).not.toMatch(/\d+/)
  })

  it('caps very large counts at 99+', () => {
    Object.assign(mockInboxCounts, {
      whatsapp: 150,
      instagram: 0,
      messenger: 0,
      metaTotal: 150,
      notifications: 0,
      total: 150,
    })
    renderSidebar()
    expandSection('Inbox')

    expect(screen.getByRole('link', { name: /^whatsapp$/i }).textContent).toContain('99+')
    expect(screen.getByRole('button', { name: /^inbox/i }).textContent).toContain('99+')
  })
})
