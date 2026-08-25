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
    getLeadDocuments: vi.fn(),
    getLeadNegotiation: vi.fn(),
    updateLeadNegotiation: vi.fn(),
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
    getAssignableUsersWithJuniors: vi.fn().mockResolvedValue({ users: [] }),
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
    crmApiMock.getLeadDocuments.mockResolvedValue({
      documents: [
        {
          id: 'doc-1',
          document_type: 'quotation',
          document_number: 'QTN-001',
          title: 'Accepted quotation',
          status: 'accepted',
          grand_total: 2500,
          created_at: '2026-07-12T10:00:00Z',
        },
      ],
    })
    crmApiMock.getLeadNegotiation.mockResolvedValue({
      negotiation: {
        lead_id: 'lead-1',
        accepted_quotation_reference: 'QTN-001',
        negotiation_status: 'waiting_client',
        negotiation_notes: 'Client asked for one change',
        customer_counter_offer: null,
        final_agreed_amount: null,
        discount: null,
        final_scope: '',
        payment_terms: '',
        delivery_timeline: '',
        client_conditions: '',
        next_follow_up: null,
      },
    })
    crmApiMock.updateLeadNegotiation.mockResolvedValue({ negotiation: { negotiation_status: 'accepted' } })

    crmApiMock.updateLeadProposal.mockResolvedValue({ message: 'Proposal updated successfully' })
    salesApiMock.updateLeadForm.mockResolvedValue({ message: 'Lead updated successfully' })
  })

  it('moves from lead to proposal to history with real data', async () => {
    const proposalView = renderPage()

    expect(await screen.findByRole('heading', { name: 'Alpha Co', level: 1 })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Proposal' }))

    expect(await screen.findByText('Quotation builder')).toBeInTheDocument()
    expect(screen.getByText('QTN-001')).toBeInTheDocument()

    proposalView.unmount()

    renderPage(['/crm/leads/lead-1?tab=history'])

    expect(await screen.findByRole('heading', { name: 'Qualified → Proposal', level: 3 })).toBeInTheDocument()
    expect(screen.getByText('Ada Admin')).toBeInTheDocument()
  })

  it('requires confirmation before saving lead overview edits', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Alpha Co', level: 1 })).toBeInTheDocument()

    // The header edit and the overview edit are both named "Edit"; the overview
    // one renders last in the workspace layout.
    const editButtons = screen.getAllByRole('button', { name: 'Edit' })
    fireEvent.click(editButtons[editButtons.length - 1])
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

  it('shows negotiation as a locked future tab before the negotiation stage', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Alpha Co', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /NegotiationLocked/i })).toBeInTheDocument()
  })

  it('saves manual negotiation status through the lead update API', async () => {
    salesApiMock.getLead.mockResolvedValue({
      id: 'lead-1',
      prospect_name: 'Alpha Co',
      company_name: 'Alpha Co',
      current_stage: 'Negotiation',
      status: 'active',
      assigned_to: 'user-1',
      interest_level: 'warm',
      proposal_status: 'accepted',
      negotiation_status: 'waiting_client',
      negotiation_notes: 'Client asked for one change',
      budget: 2500,
      custom_fields: {},
      created_at: '2026-07-01T10:00:00Z',
    })

    renderPage(['/crm/leads/lead-1?tab=negotiation'])

    expect(await screen.findByText('Negotiation workspace')).toBeInTheDocument()
    expect(screen.getByDisplayValue('QTN-001')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Negotiation Status'), { target: { value: 'accepted' } })
    fireEvent.change(screen.getByLabelText('Final Agreed Amount'), { target: { value: '2400' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Negotiation/i }))

    await waitFor(() => {
      expect(crmApiMock.updateLeadNegotiation).toHaveBeenCalledWith(
        'lead-1',
        expect.objectContaining({
          negotiation_status: 'accepted',
          negotiation_notes: 'Client asked for one change',
          final_agreed_amount: 2400,
        }),
      )
    })
  })

  it('prefills agreement contract builder from accepted quotation and negotiated terms', async () => {
    salesApiMock.getLead.mockResolvedValue({
      id: 'lead-1',
      prospect_name: 'Alpha Co',
      company_name: 'Alpha Co',
      current_stage: 'Agreement',
      status: 'active',
      assigned_to: 'user-1',
      proposal_status: 'accepted',
      negotiation_status: 'accepted',
      budget: 2500,
      custom_fields: {},
      created_at: '2026-07-01T10:00:00Z',
    })
    crmApiMock.getLeadNegotiation.mockResolvedValue({
      negotiation: {
        lead_id: 'lead-1',
        accepted_quotation_reference: 'QTN-001',
        negotiation_status: 'accepted',
        negotiation_notes: 'Use negotiated handoff terms',
        customer_counter_offer: 2300,
        final_agreed_amount: 2400,
        discount: 100,
        final_scope: 'SEO plus weekly reporting',
        payment_terms: '60% advance, 40% on delivery',
        delivery_timeline: '45 days',
        client_conditions: 'Client legal review before kickoff',
        next_follow_up: null,
      },
    })

    renderPage(['/crm/leads/lead-1?tab=agreement'])

    expect(await screen.findByText('Contract builder')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2400')).toBeInTheDocument()
    expect(screen.getAllByDisplayValue('SEO plus weekly reporting').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByDisplayValue('60% advance, 40% on delivery')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/Final agreed amount: 2400/)).toBeInTheDocument()
    expect(screen.getByDisplayValue(/Delivery timeline: 45 days/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Client legal review before kickoff')).toBeInTheDocument()
  })
})
