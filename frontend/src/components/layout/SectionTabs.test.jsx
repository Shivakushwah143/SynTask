import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SectionTabs from './SectionTabs'
import { SECTIONS } from '../../config/navigation'

// Mutable mock so tests can exercise role-based gating.
const { mockUser } = vi.hoisted(() => ({
  mockUser: {
    role: 'admin',
    modules: ['task', 'invoicing_ledger'],
  },
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}))

vi.mock('../../api/departments', () => ({
  DEPARTMENTS_CHANGED_EVENT: 'departments-changed',
  departmentsAPI: {
    listDepartments: vi.fn().mockResolvedValue([]),
  },
}))

// Mutable mock for the Phase 6 inbox unread counts.
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

vi.mock('../../hooks/useInboxUnreadCounts', () => ({
  useInboxUnreadCounts: () => mockInboxCounts,
}))

// D5 test fixture: treat Home as a single-tab section (all others use the real gated list).
vi.mock('../../config/navigation', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getSectionItems: (key, user, deps) =>
      key === 'home'
        ? [actual.navigation.find((item) => item.name === 'Home')]
        : actual.getSectionItems(key, user, deps),
  }
})

const renderTabs = (pathname, search = '') =>
  render(
    <MemoryRouter initialEntries={[{ pathname, search }]}>
      <SectionTabs />
    </MemoryRouter>,
  )

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

describe('SectionTabs (tab sub-nav plan, Phase B)', () => {
  it('renders the Work tabs on /projects with Projects active', () => {
    renderTabs('/projects')

    const tablist = screen.getByRole('tablist')
    expect(tablist).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^Projects$/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /^Tasks$/i })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: /^Requests$/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^Scheduled Work$/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^Time Tracking$/i })).toBeTruthy()
  })

  it('resolves query-string meta panels to Inbox tabs (WhatsApp active)', () => {
    renderTabs('/crm/settings', '?meta=whatsapp')

    expect(screen.getByRole('tab', { name: /^WhatsApp$/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /^Instagram$/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^Meta Messages$/i })).toBeTruthy()
  })

  it('renders the Work tabs with the Overview tab', () => {
    renderTabs('/sections/work')

    expect(screen.getByRole('tab', { name: /^Overview$/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^Projects$/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^Tasks$/i })).toBeTruthy()
  })

  it('renders the Overview tab as active on the dedicated Work overview page', () => {
    renderTabs('/work/overview')

    expect(screen.getByRole('tab', { name: /^Overview$/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /^Projects$/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^Tasks$/i })).toBeTruthy()
  })

  it('does not render an Overview tab on the Clients page (dedicated /clients page)', () => {
    renderTabs('/clients')

    expect(screen.queryByRole('tab', { name: /^Overview$/i })).toBeNull()
    expect(screen.getByRole('tab', { name: /^All Clients$/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /^Companies$/i })).toBeTruthy()
  })

  it('does not render an Overview tab on the Clients section landing', () => {
    renderTabs('/sections/clients')

    expect(screen.queryByRole('tab', { name: /^Overview$/i })).toBeNull()
    expect(screen.getByRole('tab', { name: /^All Clients$/i })).toBeTruthy()
  })

  it('links Home straight to the dashboard and keeps dedicated overview routes', () => {
    const home = SECTIONS.find((section) => section.key === 'home')
    const clients = SECTIONS.find((section) => section.key === 'clients')
    const sales = SECTIONS.find((section) => section.key === 'sales')
    const work = SECTIONS.find((section) => section.key === 'work')

    expect(home.overviewHref).toBe('/dashboard')
    expect(home.hideOverviewTab).toBe(true)
    expect(clients.overviewHref).toBe('/clients')
    expect(clients.hideOverviewTab).toBe(true)
    expect(sales.overviewHref).toBe('/sales-overview')
    expect(sales.hideOverviewTab).toBeUndefined()
    expect(work.overviewHref).toBe('/work/overview')
  })

  it('does not render the legacy Overview tab on the dedicated Sales dashboard', () => {
    renderTabs('/sales-overview')
    expect(screen.queryByRole('tab', { name: /^Overview$/i })).toBeNull()
    expect(screen.getByRole('tab', { name: /^Acquire$/i })).toBeTruthy()
  })

  it('keeps the parent tab active on a detail page (prefix match)', () => {
    renderTabs('/projects/p1/board')
    expect(screen.getByRole('tab', { name: /^Projects$/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows exactly the Sales journey tabs on legacy Sales routes', () => {
    renderTabs('/crm/leads/all')

    // Legacy routes resolve to the Sales section; no stage tab applies.
    expect(screen.queryByRole('tab', { name: /^Overview$/i })).toBeNull()
    expect(screen.getByRole('tab', { name: /^Acquire$/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^Qualify$/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^Discovery$/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^Proposal$/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^Negotiation$/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^Agreement$/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^Won$/i })).toBeTruthy()
    // The tab order contains only the journey stages (exact order).
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent.trim())).toEqual([
      'Acquire',
      'Qualify',
      'Discovery',
      'Proposal',
      'Negotiation',
      'Agreement',
      'Won',
    ])
    // Legacy browsing + import items stay in the sidebar config but are hidden from the bar.
    expect(screen.queryByRole('tab', { name: /^Leads$/i })).toBeNull()
    expect(screen.queryByRole('tab', { name: /^All Leads$/i })).toBeNull()
    expect(screen.queryByRole('tab', { name: /^Pipeline$/i })).toBeNull()
    expect(screen.queryByRole('tab', { name: /^Import Leads$/i })).toBeNull()
  })

  it('keeps a stage-specific pipeline page on the matching journey tab', () => {
    renderTabs('/crm/pipeline/qualify')

    expect(screen.getByRole('tab', { name: /^Qualify$/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /^Acquire$/i })).toHaveAttribute('aria-selected', 'false')
  })

  it('does not render the legacy Overview tab on the dedicated Sales Overview dashboard', () => {
    renderTabs('/sales-overview')

    expect(screen.queryByRole('tab', { name: /^Overview$/i })).toBeNull()
    expect(screen.getByRole('tab', { name: /^Acquire$/i })).toBeTruthy()
  })

  it('renders nothing for non-section pages (chat)', () => {
    renderTabs('/chat')
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('renders nothing for an unknown section key', () => {
    renderTabs('/sections/bogus')
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('hides the bar for single-tab sections (D5)', () => {
    // Home is stubbed to a single tab by the navigation mock.
    renderTabs('/dashboard')
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('gates tabs by role (employee sees Work tabs except admin-only Scheduled Work)', () => {
    mockUser.role = 'employee'
    renderTabs('/projects')

    expect(screen.getByRole('tab', { name: /^Projects$/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^Time Tracking$/i })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: /^Scheduled Work$/i })).toBeNull()
  })

  it('shows per-channel unread counts on Inbox tabs', () => {
    Object.assign(mockInboxCounts, {
      whatsapp: 45,
      instagram: 32,
      metaTotal: 77,
      notifications: 3,
      total: 80,
    })
    renderTabs('/crm/settings', '?meta=whatsapp')

    // Accessible name includes the unread badge (e.g. "WhatsApp 45"), so match the prefix.
    expect(screen.getByRole('tab', { name: /^WhatsApp/i }).textContent).toContain('45')
    expect(screen.getByRole('tab', { name: /^Instagram/i }).textContent).toContain('32')
    expect(screen.getByRole('tab', { name: /^Notifications/i }).textContent).toContain('3')
  })

  it('caps very large unread counts at 99+', () => {
    Object.assign(mockInboxCounts, { whatsapp: 150, metaTotal: 150, total: 150 })
    renderTabs('/crm/settings', '?meta=whatsapp')

    expect(screen.getByRole('tab', { name: /^WhatsApp/i }).textContent).toContain('99+')
  })

  it('shows Recruitment tabs on HR recruitment pages with exactly one active tab', () => {
    renderTabs('/hr/recruitment/jobs')

    expect(screen.getByRole('tab', { name: /^Job Openings$/i })).toHaveAttribute('aria-selected', 'true')
    // The match-prefix on Hiring Dashboard must NOT also light up (single-active rule).
    expect(screen.getByRole('tab', { name: /^Hiring Dashboard$/i })).toHaveAttribute('aria-selected', 'false')
    // Employees (from HR employees module) should be in Recruitment section tabs.
    expect(screen.getByRole('tab', { name: /^Employees$/i })).toBeTruthy()
  })

  it('keeps the Employees tab active on a nested employee detail page', () => {
    renderTabs('/hr/employees/emp-123')

    expect(screen.getByRole('tab', { name: /^Employees$/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows People tabs on the global HR Documents page', () => {
    renderTabs('/hr/documents')

    // Documents route resolves to People section; People section tabs are rendered.
    // Documents is an HR module sub-page, not a People section tab item,
    // so the tab bar shows People tabs without a specific Documents tab active.
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-label', 'People pages')
  })

  it('shows People tabs on HR Settings (Document Types)', () => {
    renderTabs('/hr/settings/document-types')

    // HR Settings resolves to People section; People section tabs are rendered.
    // Document Types is an HR module sub-page, not a People section tab item.
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-label', 'People pages')
  })

  it('does not render company department quick links as tabs on /departments', async () => {
    const { departmentsAPI } = await import('../../api/departments')
    departmentsAPI.listDepartments.mockResolvedValue([
      { id: 'd1', name: 'Internal Ops' },
      { id: 'd2', name: 'IT Support' },
    ])

    renderTabs('/departments')

    // The Departments page tab itself remains...
    expect(screen.getByRole('tab', { name: /^Departments$/i })).toBeTruthy()
    // ...but the internal department quick links never appear as tabs.
    expect(screen.queryByRole('tab', { name: /^Internal Ops$/i })).toBeNull()
    expect(screen.queryByRole('tab', { name: /^IT Support$/i })).toBeNull()
  })

  it('renders nothing on HR screens without a tab (interview screen)', () => {
    renderTabs('/hr/recruitment/interview-screen')
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('renders "Soon" badge items as normal clickable tabs (D3)', () => {
    renderTabs('/crm/settings', '?meta=connect')
    const socialAccounts = screen.getByRole('tab', { name: /^Social Accounts$/i })
    expect(socialAccounts).toHaveAttribute('aria-selected', 'true')
    expect(socialAccounts.getAttribute('href')).toContain('meta=connect')
  })

  it('toggles favorites via the per-tab star (D4)', () => {
    renderTabs('/projects')

    fireEvent.click(screen.getByRole('button', { name: 'Add Projects to favorites' }))
    expect(JSON.parse(localStorage.getItem('syntask-sidebar-favorites'))).toContain('/projects')

    fireEvent.click(screen.getByRole('button', { name: 'Remove Projects from favorites' }))
    expect(JSON.parse(localStorage.getItem('syntask-sidebar-favorites'))).not.toContain('/projects')
  })

  it('supports arrow-key navigation between tabs (a11y)', () => {
    renderTabs('/projects')
    const tabs = screen.getAllByRole('tab')
    // First tab is now Overview; focus on it and arrow-right to Projects.
    tabs[0].focus()
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    expect(document.activeElement.textContent).toContain('Projects')
    fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' })
    expect(document.activeElement.textContent).toContain('Tasks')
    fireEvent.keyDown(document.activeElement, { key: 'ArrowLeft' })
    expect(document.activeElement.textContent).toContain('Projects')
  })
})
