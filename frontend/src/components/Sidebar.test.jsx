import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from './Sidebar'
import { SECTIONS } from '../config/navigation'

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
  'SOP Library',
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
  'sop',
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
  it('shows exactly 13 top-level sections as links', () => {
    renderSidebar()
    for (const label of SECTION_LABELS) {
      expect(screen.getByRole('link', { name: new RegExp(`^${label}$`, 'i') })).toBeTruthy()
    }
  })

  it('renders the 13 sections in the exact spec order', () => {
    renderSidebar()
    const links = SECTION_LABELS.map((label) => screen.getByRole('link', { name: new RegExp(`^${label}$`, 'i') }))
    const orderMatches = links.every((link, index) => {
      if (index === 0) return true
      return (links[index - 1].compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    })
    expect(orderMatches).toBe(true)
  })

  it('links every section to its landing page (dedicated default pages win)', () => {
    renderSidebar()
    SECTION_KEYS.forEach((key, index) => {
      const link = screen.getByRole('link', { name: new RegExp(`^${SECTION_LABELS[index]}$`, 'i') })
      const section = SECTIONS.find((candidate) => candidate.key === key)
      const expected = section.overviewHref || `/sections/${key}`
      expect(link.getAttribute('href')).toBe(expected)
    })
  })

  it('links the Sales section to the dedicated sales overview dashboard', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /^sales$/i }).getAttribute('href')).toBe('/sales-overview')
  })

  it('links the Clients section to the All Clients page', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /^clients$/i }).getAttribute('href')).toBe('/clients')
  })

  it('links the Home section straight to the dashboard', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /^home$/i }).getAttribute('href')).toBe('/dashboard')
  })

  it('links the SOP Library section straight to the SOP Library page', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /^sop library$/i }).getAttribute('href')).toBe('/sop-library')
  })

  it('highlights the Sales section on the dedicated sales overview page', () => {
    renderSidebar('/sales-overview')
    expect(screen.getByRole('link', { name: /^sales$/i }).getAttribute('aria-current')).toBe('page')
  })

  it('highlights the Clients section on the All Clients page', () => {
    renderSidebar('/clients')
    expect(screen.getByRole('link', { name: /^clients$/i }).getAttribute('aria-current')).toBe('page')
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
    // hr_manager is not in STANDARD_ROLES, so universal core sections must not be hidden.
    expect(screen.getByRole('link', { name: /^sop library$/i })).toBeTruthy()
  })
})

describe('Sidebar role-based visibility (spec §9)', () => {
  it('shows every section an Employee is authorized for (backend-driven)', () => {
    mockUser.role = 'employee'
    renderSidebar()

    // Backend require_module auto-grants sales_crm/tickets to employees, and the
    // /attendance, /leaves, /attendance-reports, /reports, /settings and
    // /google-workspace routers have no module gate — so the sidebar now exposes
    // exactly what the employee can actually use (Attendance, Leave, Requests, ...).
    for (const label of ['Home', 'Sales', 'Work', 'Content', 'Inbox', 'People', 'Insights', 'Settings', 'SOP Library']) {
      expect(screen.getByRole('link', { name: new RegExp(`^${label}$`, 'i') })).toBeTruthy()
    }
    // Team/admin-only surfaces stay hidden: CRM clients, publishing, AI workspace
    // (requires the ai_agents module) and finance (invoicing_ledger + admin role).
    const hidden = ['Clients', 'Publishing', 'AI Workspace', 'Finance']
    for (const label of hidden) {
      expect(screen.queryByRole('link', { name: new RegExp(`^${label}$`, 'i') })).toBeNull()
    }
  })

  it('shows the Sales section for an Employee (backend auto-grants sales_crm)', () => {
    mockUser.role = 'employee'
    renderSidebar()

    // require_module("sales_crm") auto-grants Manager/Lead/Employee on the backend.
    expect(screen.getByRole('link', { name: /^sales$/i })).toBeTruthy()
  })

  it('shows Settings for a Manager (profile page + Google Workspace are backend-open)', () => {
    mockUser.role = 'manager'
    renderSidebar()

    // /settings is the user's own profile page (auth-only) and /google-workspace has
    // no backend gate; Client Settings is guarded by CRMSettingsGuard (admin+manager).
    expect(screen.getByRole('link', { name: /^settings$/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^sales$/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^people$/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^work$/i })).toBeTruthy()
  })

  it('shows Settings for a Team Lead (profile page is backend-open)', () => {
    mockUser.role = 'lead'
    renderSidebar()

    expect(screen.getByRole('link', { name: /^settings$/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^sales$/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^inbox$/i })).toBeTruthy()
  })

  it('shows Settings for a Sub Admin (inherits admin access)', () => {
    mockUser.role = 'sub_admin'
    renderSidebar()

    expect(screen.getByRole('link', { name: /^settings$/i })).toBeTruthy()
  })

  it('shows SOP Library for users without normal module permissions', () => {
    mockUser.role = 'employee'
    mockUser.modules = []
    renderSidebar()

    expect(screen.getByRole('link', { name: /^sop library$/i }).getAttribute('href')).toBe('/sop-library')
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
