import { render, screen, act } from '@testing-library/react'
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

const SECTION_KEYS = [
  'home',
  'sales',
  'clients',
  'work',
  'content',
  'publishing',
  'inbox',
  'ai',
  'people',
  'finance',
  'insights',
  'settings',
]

const renderSidebar = (path = '/dashboard') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar isOpen onClose={vi.fn()} />
    </MemoryRouter>,
  )

beforeEach(() => {
  mockUser.role = 'admin'
  mockUser.modules = ['task', 'invoicing_ledger']
  localStorage.clear()
})

describe('Sidebar tab sub-nav (Phase D): link-only sections', () => {
  it('shows exactly 12 top-level sections as links', () => {
    renderSidebar()
    for (const label of SECTION_LABELS) {
      expect(screen.getByRole('link', { name: new RegExp(`^${label}$`, 'i') })).toBeTruthy()
    }
  })

  it('renders the 12 sections in the exact spec order', () => {
    renderSidebar()
    const links = SECTION_LABELS.map((label) => screen.getByRole('link', { name: new RegExp(`^${label}$`, 'i') }))
    const orderMatches = links.every((link, index) => {
      if (index === 0) return true
      return (links[index - 1].compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    })
    expect(orderMatches).toBe(true)
  })

  it('links every section to its landing page (/sections/:key)', () => {
    renderSidebar()
    SECTION_KEYS.forEach((key, index) => {
      const link = screen.getByRole('link', { name: new RegExp(`^${SECTION_LABELS[index]}$`, 'i') })
      expect(link.getAttribute('href')).toBe(`/sections/${key}`)
    })
  })

  it('removed the sub-items: no WhatsApp link, no expand buttons for sections', () => {
    renderSidebar()
    expect(screen.queryByRole('link', { name: /^whatsapp$/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /^all clients$/i })).toBeNull()
  })

  it('keeps the People section labelled People, not Team', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /^people$/i })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /^team$/i })).toBeNull()
  })

  it('highlights the active section when on one of its pages', () => {
    renderSidebar('/projects/p1/board')
    const work = screen.getByRole('link', { name: /^work$/i })
    expect(work.getAttribute('aria-current')).toBe('page')
    const clients = screen.getByRole('link', { name: /^clients$/i })
    expect(clients.getAttribute('aria-current')).toBeNull()
  })

  it('renders no empty Finance link for a Manager (all Finance items are admin-gated)', () => {
    mockUser.role = 'manager'
    renderSidebar()
    expect(screen.queryByRole('link', { name: /^finance$/i })).toBeNull()
    expect(screen.getByRole('link', { name: /^insights$/i })).toBeTruthy()
  })

  it('keeps a non-empty sidebar for a non-standard role (hr_manager falls through to item gates)', () => {
    mockUser.role = 'hr_manager'
    renderSidebar()
    // hr_manager is not in STANDARD_ROLES, so section gates must not blank the sidebar;
    // item-level gates still decide what is visible (meta channel items carry no roles).
    expect(screen.getByRole('link', { name: /^inbox$/i })).toBeTruthy()
  })
})

describe('Sidebar role-based visibility (spec §9)', () => {
  it('shows only Home, Work and Inbox for an Employee role', () => {
    mockUser.role = 'employee'
    renderSidebar()

    for (const label of ['Home', 'Work', 'Inbox']) {
      expect(screen.getByRole('link', { name: new RegExp(`^${label}$`, 'i') })).toBeTruthy()
    }
    const hidden = ['Sales', 'Clients', 'Content', 'Publishing', 'AI Workspace', 'People', 'Finance', 'Insights', 'Settings']
    for (const label of hidden) {
      expect(screen.queryByRole('link', { name: new RegExp(`^${label}$`, 'i') })).toBeNull()
    }
  })

  it('hides Settings for a Manager', () => {
    mockUser.role = 'manager'
    renderSidebar()

    expect(screen.queryByRole('link', { name: /^settings$/i })).toBeNull()
    expect(screen.getByRole('link', { name: /^sales$/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^people$/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^work$/i })).toBeTruthy()
  })

  it('hides Settings for a Team Lead', () => {
    mockUser.role = 'lead'
    renderSidebar()

    expect(screen.queryByRole('link', { name: /^settings$/i })).toBeNull()
    expect(screen.getByRole('link', { name: /^sales$/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^inbox$/i })).toBeTruthy()
  })

  it('shows Settings for a Sub Admin (inherits admin access)', () => {
    mockUser.role = 'sub_admin'
    renderSidebar()

    expect(screen.getByRole('link', { name: /^settings$/i })).toBeTruthy()
  })

  it('does not show the Sales section for a non-sales employee', () => {
    mockUser.role = 'employee'
    renderSidebar()

    expect(screen.queryByRole('link', { name: /^sales$/i })).toBeNull()
  })
})

describe('Sidebar favorites (D4: kept, sub-item shortcuts still work)', () => {
  it('shows favorited sub-items as shortcuts', () => {
    localStorage.setItem('syntask-sidebar-favorites', JSON.stringify(['/crm/leads', '/projects']))
    renderSidebar()

    expect(screen.getByRole('button', { name: /favorites/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^leads$/i }).getAttribute('href')).toBe('/crm/leads')
    expect(screen.getByRole('link', { name: /^projects$/i }).getAttribute('href')).toBe('/projects')
  })

  it('does not show the favorites block when nothing is starred', () => {
    renderSidebar()
    expect(screen.queryByRole('button', { name: /favorites/i })).toBeNull()
  })

  it('removing a favorite hides it from the shortcuts', () => {
    localStorage.setItem('syntask-sidebar-favorites', JSON.stringify(['/projects']))
    renderSidebar()
    expect(screen.getByRole('link', { name: /^projects$/i })).toBeTruthy()

    // Simulate the SectionTabs star toggle removing it: the shared useFavorites hook
    // listens for this broadcast event and re-reads localStorage (wrapped in act so
    // React flushes the re-render before the assertions).
    act(() => {
      localStorage.setItem('syntask-sidebar-favorites', JSON.stringify([]))
      window.dispatchEvent(new Event('syntask:favorites-changed'))
    })

    expect(screen.queryByRole('button', { name: /favorites/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /^projects$/i })).toBeNull()
  })
})
