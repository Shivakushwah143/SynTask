import { useCallback, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { crmApi } from '../../../api/crm'
import { salesApi } from '../../../api/sales'
import { CRMEmptyState, CRMPage, CRMSection } from '../../../components/crm'
import { EmailComposer } from '../../../components/EmailComposer'
import { Button } from '../../../components/ui'
import { LeadAccessDeniedState, LeadAttachmentsTab, LeadCallLogsTab, LeadEmailsTab, LeadHistoryTab, LeadLoadingState, LeadMeetingsTab, LeadOverview, LeadProposalTab, LeadSidebar, LeadTasksTab, LeadWorkspace } from './components'
import { LEAD_FILES_QUERY_KEY, LeadFilesTab } from './files'
import { LEAD_NOTES_QUERY_KEY, LeadNotesTab } from './notes'
import { LeadTimelineTab } from './timeline'
import { LeadAISalesTab } from './ai'

const ACTIVE_TAB_KEY = 'tab'
const WORKSPACE_QUERY_KEY = 'crm-lead-workspace'

export default function CRMLeadWorkspacePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { leadId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [timelineSearch, setTimelineSearch] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)

  const activeTab = searchParams.get(ACTIVE_TAB_KEY) || 'overview'

  const leadQuery = useQuery(
    [WORKSPACE_QUERY_KEY, leadId],
    () => salesApi.getLead(leadId),
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
  const proposals = useMemo(() => (Array.isArray(proposalQuery.data?.proposals) ? proposalQuery.data.proposals : []), [proposalQuery.data])
  const leadLabel = lead?.company_name || lead?.prospect_name || 'Lead'

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId], { exact: true })
    queryClient.invalidateQueries([LEAD_FILES_QUERY_KEY, leadId], { exact: true })
    queryClient.invalidateQueries([LEAD_NOTES_QUERY_KEY, leadId], { exact: true })
    leadQuery.refetch()
  }, [leadId, leadQuery, queryClient])

  const handleTabChange = useCallback((tab) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (tab && tab !== 'overview') next.set(ACTIVE_TAB_KEY, tab)
      else next.delete(ACTIVE_TAB_KEY)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const openComposer = useCallback(() => setComposerOpen(true), [])

  let body
  if (activeTab === 'notes') body = <LeadNotesTab leadId={leadId} lead={lead} />
  else if (activeTab === 'files') body = <LeadFilesTab leadId={leadId} lead={lead} />
  else if (activeTab === 'attachments') body = <LeadAttachmentsTab leadId={leadId} lead={lead} />
  else if (activeTab === 'tasks') body = <LeadTasksTab />
  else if (activeTab === 'meetings') body = <LeadMeetingsTab />
  else if (activeTab === 'emails') body = <LeadEmailsTab />
  else if (activeTab === 'call_logs') body = <LeadCallLogsTab />
  else if (activeTab === 'proposal') {
    body = (
      <LeadProposalTab
        deal={deal}
        proposals={proposals}
        form={{
          title: proposals[0]?.title || '',
          summary: proposals[0]?.summary || '',
          status: proposals[0]?.status || 'draft',
          deal_value: String(deal?.value ?? proposals[0]?.deal_value ?? ''),
          expected_close_date: proposals[0]?.expected_close_date || deal?.expected_close_date || '',
          probability: String(proposals[0]?.probability ?? deal?.probability ?? 0),
          negotiation_notes: proposals[0]?.negotiation_notes || deal?.negotiation_notes || '',
          competitors: Array.isArray(proposals[0]?.competitors) ? proposals[0].competitors.join(', ') : (Array.isArray(deal?.competitors) ? deal.competitors.join(', ') : ''),
          decision_maker: proposals[0]?.decision_maker || deal?.decision_maker || '',
        }}
        onChange={() => {}}
        onSubmit={() => {}}
        onArchive={() => {}}
        isSaving={false}
        isLoading={proposalQuery.isLoading}
        errorMessage={proposalQuery.isError ? proposalQuery.error?.response?.data?.detail || 'Proposal data could not be loaded.' : ''}
        onRetry={() => proposalQuery.refetch()}
      />
    )
  } else if (activeTab === 'ai') {
    body = <LeadAISalesTab leadId={leadId} lead={lead} onRefresh={handleRefresh} />
  } else if (activeTab === 'timeline') {
    body = (
      <LeadTimelineTab
        items={timelineQuery.data?.items || []}
        summary={timelineQuery.data?.summary || {}}
        searchValue={timelineSearch}
        onSearchChange={setTimelineSearch}
        activeFilter="all"
        onFilterChange={() => {}}
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
      <div className="space-y-4">
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
    <>
      <LeadWorkspace
        title={lead.company_name || lead.prospect_name || 'Lead workspace'}
        description="Important lead details, activity, notes, files, and deal context."
        breadcrumbs={['CRM', 'Pipeline', leadLabel]}
        lead={lead}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onBack={() => navigate('/crm/pipeline')}
        onRefresh={handleRefresh}
        onSendEmail={openComposer}
        body={body}
        sidebar={<LeadSidebar lead={lead} onSendEmail={openComposer} />}
      />
      <EmailComposer
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        initialData={{
          to: lead?.email ? [{ email: lead.email, name: lead.prospect_name || lead.company_name || '' }] : [],
          subject: lead?.company_name ? `Hello ${lead.company_name}` : `Hello ${lead?.prospect_name || 'there'}`,
          html: '<p>Hi,</p><p></p>',
          text: 'Hi,',
          related_entity_type: 'lead',
          related_entity_id: leadId,
          related_module: 'crm',
        }}
      />
    </>
  )
}
