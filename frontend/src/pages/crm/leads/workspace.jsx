import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Building2, CheckCircle2, RefreshCcw, Sparkles, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { crmApi } from '../../../api/crm'
import { clientsAPI } from '../../../api/clients'
import { projectsApi } from '../../../api/projects'
import { salesApi } from '../../../api/sales'
import { CRMEmptyState, CRMPage, CRMSection } from '../../../components/crm'
import { Badge, Button, Modal } from '../../../components/ui'
import { LeadAITab, LeadAccessDeniedState, LeadEmailsTab, LeadHistoryTab, LeadLoadingState, LeadMeetingsTab, LeadOverview, LeadProposalTab, LeadSidebar, LeadSummaryCards, LeadWorkspace } from './components'
import { LEAD_FILES_QUERY_KEY, LeadFilesTab } from './files'
import { LEAD_NOTES_QUERY_KEY, LeadNotesTab } from './notes'
import { LeadTimelineTab } from './timeline'

const ACTIVE_TAB_KEY = 'tab'
const WORKSPACE_QUERY_KEY = 'crm-lead-workspace'

export default function CRMLeadWorkspacePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { leadId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [timelineSearch, setTimelineSearch] = useState('')
  const [timelineFilter, setTimelineFilter] = useState('all')
  const [wonModalOpen, setWonModalOpen] = useState(false)
  const [handoffState, setHandoffState] = useState({ status: 'idle', error: '', client: null, project: null, log: null })
  const [proposalForm, setProposalForm] = useState({
    title: '',
    summary: '',
    status: 'draft',
    deal_value: '',
    expected_close_date: '',
    probability: '0',
    negotiation_notes: '',
    competitors: '',
    decision_maker: '',
  })

  const activeTab = searchParams.get(ACTIVE_TAB_KEY) || 'overview'

  useEffect(() => {
    setTimelineSearch('')
    setTimelineFilter('all')
  }, [leadId])

  const leadQuery = useQuery(
    [WORKSPACE_QUERY_KEY, leadId],
    () => salesApi.getProspect(leadId),
    {
      enabled: Boolean(leadId),
      retry: false,
      staleTime: 5 * 60 * 1000,
    }
  )

  const timelineQuery = useQuery(
    [WORKSPACE_QUERY_KEY, leadId, 'timeline'],
    () => crmApi.getLeadTimeline(leadId),
    {
      enabled: Boolean(leadId) && activeTab === 'timeline',
      retry: false,
      staleTime: 60 * 1000,
    }
  )

  const historyQuery = useQuery(
    [WORKSPACE_QUERY_KEY, leadId, 'history'],
    () => crmApi.getPipelineHistory(leadId),
    {
      enabled: Boolean(leadId) && activeTab === 'history',
      retry: false,
      staleTime: 60 * 1000,
    }
  )

  const proposalQuery = useQuery(
    [WORKSPACE_QUERY_KEY, leadId, 'proposal'],
    () => crmApi.getLeadProposals(leadId),
    {
      enabled: Boolean(leadId) && activeTab === 'proposal',
      retry: false,
      staleTime: 60 * 1000,
    }
  )

  const lead = leadQuery.data || null
  const errorStatus = leadQuery.error?.response?.status
  const deal = proposalQuery.data?.deal || null
  const proposals = useMemo(() => Array.isArray(proposalQuery.data?.proposals) ? proposalQuery.data.proposals : [], [proposalQuery.data])
  const leadLabel = lead?.company_name || lead?.prospect_name || 'Lead'
  const isWon = String(lead?.status || '').toLowerCase() === 'won' || String(lead?.current_stage || '').toLowerCase() === 'won'

  useEffect(() => {
    if (!deal) return
    setProposalForm((state) => ({
      ...state,
      title: proposals[0]?.title || state.title,
      summary: proposals[0]?.summary || state.summary,
      status: proposals[0]?.status || state.status,
      deal_value: String(deal.value ?? proposals[0]?.deal_value ?? state.deal_value ?? ''),
      expected_close_date: proposals[0]?.expected_close_date || deal.expected_close_date || state.expected_close_date || '',
      probability: String(proposals[0]?.probability ?? deal.probability ?? state.probability ?? 0),
      negotiation_notes: proposals[0]?.negotiation_notes || deal.negotiation_notes || state.negotiation_notes,
      competitors: Array.isArray(proposals[0]?.competitors) ? proposals[0].competitors.join(', ') : (Array.isArray(deal.competitors) ? deal.competitors.join(', ') : state.competitors),
      decision_maker: proposals[0]?.decision_maker || deal.decision_maker || state.decision_maker,
    }))
  }, [deal, proposals])

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId], { exact: true })
    queryClient.invalidateQueries([LEAD_FILES_QUERY_KEY, leadId], { exact: true })
    queryClient.invalidateQueries([LEAD_NOTES_QUERY_KEY, leadId], { exact: true })
    leadQuery.refetch()
  }, [leadId, leadQuery, queryClient])

  const handleTabChange = useCallback((tab) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (tab && tab !== 'overview') {
        next.set(ACTIVE_TAB_KEY, tab)
      } else {
        next.delete(ACTIVE_TAB_KEY)
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

  const updateProposalMutation = useMutation(
    (payload) => crmApi.updateLeadDeal(leadId, payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId, 'proposal'], { exact: true })
      },
    }
  )

  const saveProposalMutation = useMutation(
    (payload) => crmApi.createLeadProposal(leadId, payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId, 'proposal'], { exact: true })
      },
    }
  )

  const archiveProposalMutation = useMutation(
    (proposalId) => crmApi.archiveLeadProposal(leadId, proposalId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId, 'proposal'], { exact: true })
      },
    }
  )

  const handleProposalChange = useCallback((key, value) => {
    setProposalForm((state) => ({ ...state, [key]: value }))
  }, [])

  const handleProposalSubmit = useCallback(() => {
    const payload = {
      title: proposalForm.title,
      summary: proposalForm.summary,
      status: proposalForm.status,
      deal_value: proposalForm.deal_value ? Number(proposalForm.deal_value) : undefined,
      expected_close_date: proposalForm.expected_close_date ? new Date(proposalForm.expected_close_date).toISOString() : undefined,
      probability: proposalForm.probability ? Number(proposalForm.probability) : undefined,
      negotiation_notes: proposalForm.negotiation_notes,
      competitors: String(proposalForm.competitors || '').split(',').map((item) => item.trim()).filter(Boolean),
      decision_maker: proposalForm.decision_maker,
    }
    saveProposalMutation.mutate(payload)
    updateProposalMutation.mutate({
      value: payload.deal_value,
      probability: payload.probability,
      expected_close_date: payload.expected_close_date,
      decision_maker: payload.decision_maker,
      competitors: payload.competitors,
      negotiation_notes: payload.negotiation_notes,
    })
  }, [proposalForm, saveProposalMutation, updateProposalMutation])

  let body
  if (activeTab === 'notes') body = <LeadNotesTab leadId={leadId} lead={lead} />
  else if (activeTab === 'files') body = <LeadFilesTab leadId={leadId} lead={lead} />
  else if (activeTab === 'meetings') body = <LeadMeetingsTab />
  else if (activeTab === 'emails') body = <LeadEmailsTab />
  else if (activeTab === 'proposal') {
    body = (
      <LeadProposalTab
        deal={deal}
        proposals={proposals}
        form={proposalForm}
        onChange={handleProposalChange}
        onSubmit={handleProposalSubmit}
        onArchive={(proposal) => archiveProposalMutation.mutate(proposal.id)}
        isSaving={saveProposalMutation.isLoading || updateProposalMutation.isLoading || archiveProposalMutation.isLoading}
        isLoading={proposalQuery.isLoading}
        errorMessage={proposalQuery.isError ? proposalQuery.error?.response?.data?.detail || 'Proposal data could not be loaded.' : ''}
        onRetry={() => proposalQuery.refetch()}
      />
    )
  }
  else if (activeTab === 'ai') body = <LeadAITab />
  else if (activeTab === 'timeline') {
    body = (
      <LeadTimelineTab
        items={timelineQuery.data?.items || []}
        summary={timelineQuery.data?.summary || {}}
        searchValue={timelineSearch}
        onSearchChange={setTimelineSearch}
        activeFilter={timelineFilter}
        onFilterChange={setTimelineFilter}
        isLoading={timelineQuery.isLoading}
        errorMessage={timelineQuery.isError ? timelineQuery.error?.response?.data?.detail || 'Timeline data could not be loaded.' : ''}
        onRetry={() => timelineQuery.refetch()}
      />
    )
  } else if (activeTab === 'history') {
    body = (
      <LeadHistoryTab
        items={historyQuery.data?.history || []}
        isLoading={historyQuery.isLoading}
        errorMessage={historyQuery.isError ? historyQuery.error?.response?.data?.detail || 'History data could not be loaded.' : ''}
        onRetry={() => historyQuery.refetch()}
      />
    )
  } else {
    body = (
      <div className="space-y-6">
        <LeadSummaryCards lead={lead} />
        <LeadOverview lead={lead} />
      </div>
    )
  }

  if (!leadId) {
    return (
      <CRMPage>
        <CRMSection title="Lead workspace" description="Open a lead from the pipeline to view its workspace.">
          <CRMEmptyState
            title="No lead selected"
            description="Go to the CRM pipeline and click any lead card to open this workspace."
            action={(
              <Button type="button" variant="primary" onClick={() => navigate('/crm/pipeline')}>
                Open pipeline
              </Button>
            )}
          />
        </CRMSection>
      </CRMPage>
    )
  }

  if (leadQuery.isLoading) {
    return <LeadLoadingState />
  }

  if (errorStatus === 403) {
    return <LeadAccessDeniedState onBack={() => navigate('/crm/pipeline')} />
  }

  if (leadQuery.isError || !lead) {
    return (
      <CRMPage>
        <CRMSection title="Lead workspace" description="Could not load the selected lead.">
          <CRMEmptyState
            title="Lead not found"
            description="The selected lead does not exist or could not be loaded."
            action={(
              <Button type="button" variant="primary" onClick={() => navigate('/crm/pipeline')}>
                Back to pipeline
              </Button>
            )}
          />
        </CRMSection>
      </CRMPage>
    )
  }

  return (
    <LeadWorkspace
      title={lead.company_name || lead.prospect_name || 'Lead workspace'}
      description="Single source of truth for this CRM lead."
      breadcrumbs={['CRM', 'Pipeline', lead.company_name || lead.prospect_name || 'Lead']}
      lead={lead}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onBack={() => navigate('/crm/pipeline')}
      onRefresh={() => {
        handleRefresh()
        if (activeTab === 'timeline') {
          timelineQuery.refetch()
        } else if (activeTab === 'history') {
          historyQuery.refetch()
        }
      }}
      body={body}
      sidebar={<LeadSidebar lead={lead} />}
    />
  )
}
