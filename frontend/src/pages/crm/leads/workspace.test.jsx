import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CRMLeadWorkspacePage from './workspace'

const { salesApiMock, crmApiMock } = vi.hoisted(() => ({
  salesApiMock: {
    getLead: vi.fn(),
    updateLeadForm: vi.fn(),
    getStages: vi.fn(),
  },
  crmApiMock: {
    getLeadTimeline: vi.fn(),
    getPipelineHistory: vi.fn(),
    getLeadProposals: vi.fn(),
    createLeadProposal: vi.fn(),
    updateLeadProposal: vi.fn(),
    archiveLeadProposal: vi.fn(),
  },
}))

const queryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, cacheTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })

vi.mock('../../../api/sales', () => ({ salesApi: salesApiMock }))
vi.mock('../../../api/crm', () => ({ crmApi: crmApiMock }))
vi.mock('../../../api/users', () => ({
  usersAPI: {
    getAssignableUsers: vi.fn(),
  },
}))
vi.mock('./components', async () => {
  const actual = await vi.importActual('./components')
  return {
    ...actual,
    LeadSidebar: () => <div>Sidebar stub</div>,
  }
})
vi.mock('../../../store/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'user-1', role: 'admin', company_id: 'company-1' } }),
}))
vi.mock('../../../components/EmailComposer', () => ({
  EmailComposer: ({ isOpen }) => (isOpen ? <div>Email composer</div> : null),
}))

function renderPage(initialEntries = ['/crm/leads/lead-1']) {
  return render(
    <QueryClientProvider client={queryClient()}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/crm/leads/:leadId" element={<CRMLeadWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CRM lead workspace E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    salesApiMock.getLead.mockResolvedValue({
      id: 'lead-1',
      prospect_name: 'Alpha Co',
      company_name: 'Alpha Co',
      current_stage: 'Proposal',
      status: 'active',
      assigned_to: 'user-1',
      assigned_by: 'user-2',
      interest_level: 'warm',
      won_amount: 0,
      deal_value: 2500,
      created_at: '2026-07-01T10:00:00Z',
      updated_at: '2026-07-10T10:00:00Z',
    })
    salesApiMock.getStages.mockResolvedValue({
      stages: [
        { id: 'stage-new', name: 'New', key: 'new' },
        { id: 'stage-qualified', name: 'Qualified', key: 'qualified' },
        { id: 'stage-proposal', name: 'Proposal', key: 'proposal' },
      ],
    })

    crmApiMock.getLeadTimeline.mockResolvedValue({
      items: [],
      summary: { total: 0, sales: 0, system: 0, last_activity_at: null },
    })

    crmApiMock.getPipelineHistory.mockResolvedValue({
      lead_id: 'lead-1',
      history: [
        {
          id: 'hist-1',
          previous_stage: 'Qualified',
          new_stage: 'Proposal',
          user_name: 'Ada Admin',
          reason: 'Ready for proposal',
          days_in_previous_stage: 3,
          timestamp: '2026-07-12T10:00:00Z',
        },
      ],
    })

    crmApiMock.getLeadProposals.mockResolvedValue({
      deal: {
        id: 'deal-1',
        value: 2500,
        stage: 'proposal',
        probability: 60,
        expected_close_date: '2026-07-20T00:00:00Z',
        decision_maker: 'Sam Buyer',
        competitors: ['Comp A'],
      },
      proposals: [
        {
          id: 'proposal-1',
          title: 'Proposal v1',
          summary: 'Initial proposal',
          status: 'draft',
          version: 1,
          deal_value: 2500,
          expected_close_date: '2026-07-20T00:00:00Z',
          probability: 60,
          negotiation_notes: 'Early notes',
          competitors: ['Comp A'],
          decision_maker: 'Sam Buyer',
          archived: false,
          created_at: '2026-07-12T10:00:00Z',
        },
      ],
    })

    crmApiMock.updateLeadProposal.mockResolvedValue({ message: 'Proposal updated successfully' })
    salesApiMock.updateLeadForm.mockResolvedValue({ message: 'Lead updated successfully' })
  })

  it('moves from lead to proposal to history with real data and mutations', async () => {
    const proposalView = renderPage()

    expect(await screen.findByRole('heading', { name: 'Alpha Co', level: 1 })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('More lead sections'), { target: { value: 'proposal' } })

    expect(await screen.findByText('Proposal composer')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save proposal version' }))

    await waitFor(() => {
      expect(crmApiMock.updateLeadProposal).toHaveBeenCalledWith(
        'lead-1',
        'proposal-1',
        expect.objectContaining({
          title: 'Proposal v1',
          summary: 'Initial proposal',
          status: 'draft',
          deal_value: 2500,
          probability: 60,
          negotiation_notes: 'Early notes',
          decision_maker: 'Sam Buyer',
        }),
      )
    })

    proposalView.unmount()

    renderPage(['/crm/leads/lead-1?tab=history'])

    expect(await screen.findByRole('heading', { name: 'Qualified → Proposal', level: 3 })).toBeInTheDocument()
    expect(screen.getByText('Ada Admin')).toBeInTheDocument()
  })

  it('requires confirmation before saving lead overview edits', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Alpha Co', level: 1 })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Beta Co' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }))

    expect(screen.getByRole('heading', { name: 'Confirm lead changes' })).toBeInTheDocument()
    expect(salesApiMock.updateLeadForm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(salesApiMock.updateLeadForm).toHaveBeenCalledWith(
        'lead-1',
        expect.objectContaining({ company_name: 'Beta Co' }),
      )
    })
  })
})
