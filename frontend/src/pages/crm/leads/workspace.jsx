import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { crmApi } from '../../../api/crm'
import { salesApi } from '../../../api/sales'
import { usersAPI } from '../../../api/users'
import { CRMEmptyState, CRMPage, CRMSection } from '../../../components/crm'
import { EmailComposer } from '../../../components/EmailComposer'
import { Button, ConfirmDialog } from '../../../components/ui'
import { useConfirmation } from '../../../hooks/useConfirmation'
import SalesFollowUpDialog from '../../../components/sales/SalesFollowUpDialog'
import { LeadAccessDeniedState, LeadAttachmentsTab, LeadCallLogsTab, LeadEmailsTab, LeadHistoryTab, LeadLoadingState, LeadMeetingsTab, LeadOverview, LeadProposalTab, LeadSidebar, LeadTasksTab, LeadWorkspace } from './components'
import { LEAD_FILES_QUERY_KEY, LeadFilesTab } from './files'
import { LEAD_NOTES_QUERY_KEY, LeadNotesTab } from './notes'
import { LeadTimelineTab } from './timeline'
import { LeadAISalesTab } from './ai'
import { MetaAttribution } from './MetaAttribution'
import { LeadDocumentsTab } from './documents'

const ACTIVE_TAB_KEY = 'tab'
const WORKSPACE_QUERY_KEY = 'crm-lead-workspace'

export default function CRMLeadWorkspacePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { leadId } = useParams()
  const { showUndoNotification } = useConfirmation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [timelineSearch, setTimelineSearch] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [pendingLeadUpdate, setPendingLeadUpdate] = useState(null)
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Synchronous guard so a rapid double-click on the confirm button cannot fire
  // two DELETE calls before React flips the mutation loading state.
  const deleteInFlightRef = useRef(false)
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

  const usersQuery = useQuery(
    'crm-lead-workspace-users',
    () => usersAPI.getAssignableUsersWithJuniors(),
    {
      enabled: Boolean(leadId),
      staleTime: 5 * 60 * 1000,
    }
  )
  const users = useMemo(() => {
    const raw = usersQuery.data?.users || usersQuery.data || []
    return Array.isArray(raw) ? raw : []
  }, [usersQuery.data])

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

  useEffect(() => {
    const latestProposal = proposals[0] || null
    setProposalForm({
      title: latestProposal?.title || '',
      summary: latestProposal?.summary || '',
      status: latestProposal?.status || 'draft',
      deal_value: String(deal?.value ?? latestProposal?.deal_value ?? ''),
      expected_close_date: latestProposal?.expected_close_date || deal?.expected_close_date || '',
      probability: String(latestProposal?.probability ?? deal?.probability ?? 0),
      negotiation_notes: latestProposal?.negotiation_notes || deal?.negotiation_notes || '',
      competitors: Array.isArray(latestProposal?.competitors)
        ? latestProposal.competitors.join(', ')
        : Array.isArray(deal?.competitors)
          ? deal.competitors.join(', ')
          : '',
      decision_maker: latestProposal?.decision_maker || deal?.decision_maker || '',
    })
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
      if (tab && tab !== 'overview') next.set(ACTIVE_TAB_KEY, tab)
      else next.delete(ACTIVE_TAB_KEY)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const openComposer = useCallback(() => setComposerOpen(true), [])
  const openFollowUp = useCallback(() => setFollowUpOpen(true), [])
  const leadUpdateMutation = useMutation(
    (payload) => salesApi.updateLeadForm(leadId, payload),
    {
      onSuccess: () => {
        toast.success('Lead updated')
        setPendingLeadUpdate(null)
        // Guard the refetch so a network blip isn't misread as a failed save
        // (mutateAsync would otherwise reject and keep the edit form open).
        leadQuery.refetch().catch(() => {})
        queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId, 'timeline'], { exact: true })
        queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId, 'history'], { exact: true })
        // The pipeline board caches for 5 minutes; without this, a budget or
        // owner edit made here would stay invisible on /crm/pipeline (stale
        // Value column and a stale gate that re-asks for already-saved fields).
        queryClient.invalidateQueries('crm-pipeline-board')
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || 'Lead update failed')
      },
    },
  )
  const restoreLeadMutation = useMutation(
    ({ restoreToken }) => crmApi.restoreLead(leadId, restoreToken),
    {
      onSuccess: () => {
        toast.success('Lead restored')
        queryClient.invalidateQueries(WORKSPACE_QUERY_KEY)
        queryClient.invalidateQueries('crm-pipeline-board')
        queryClient.invalidateQueries('crm-leads-entry')
        queryClient.invalidateQueries('sales-prospects')
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || 'Failed to restore lead')
      },
    },
  )
  const deleteLeadMutation = useMutation(
    () => crmApi.deleteLead(leadId),
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('crm-pipeline-board')
        queryClient.invalidateQueries('crm-leads-entry')
        queryClient.invalidateQueries('sales-prospects')
        const restoreToken = data?.restore_token
        if (restoreToken) {
          showUndoNotification({
            message: 'Lead deleted permanently',
            duration: 6000,
            onUndo: () => restoreLeadMutation.mutate({ restoreToken }),
          })
        } else {
          toast.success('Lead deleted permanently')
        }
        navigate('/crm/pipeline')
      },
      onError: (error) => {
        const status = error?.response?.status
        if (status === 403) toast.error('You do not have permission to delete this lead')
        else if (status === 404) toast.error('Lead not found — it may have already been deleted')
        else toast.error(error?.response?.data?.detail || 'Failed to delete lead')
      },
    },
  )
  const proposalMutation = useMutation(
    (payload) => {
      const proposalId = payload.proposalId || proposalQuery.data?.proposals?.[0]?.id || null
      if (payload.action === 'archive') return crmApi.archiveLeadProposal(leadId, proposalId)
      if (proposalId) return crmApi.updateLeadProposal(leadId, proposalId, payload.body)
      return crmApi.createLeadProposal(leadId, payload.body)
    },
    {
      onSuccess: async () => {
        toast.success('Proposal saved')
        await proposalQuery.refetch()
        queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId, 'timeline'], { exact: true })
        queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId, 'history'], { exact: true })
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || 'Proposal save failed')
      },
    },
  )

  const handleProposalChange = useCallback((field, value) => {
    setProposalForm((state) => ({ ...state, [field]: value }))
  }, [])

  const handleProposalSubmit = useCallback(() => {
    const competitors = proposalForm.competitors
      ? proposalForm.competitors.split(',').map((item) => item.trim()).filter(Boolean)
      : []
    proposalMutation.mutate({
      body: {
        title: proposalForm.title,
        summary: proposalForm.summary,
        status: proposalForm.status,
        deal_value: proposalForm.deal_value === '' ? undefined : Number(proposalForm.deal_value),
        expected_close_date: proposalForm.expected_close_date || undefined,
        probability: proposalForm.probability === '' ? undefined : Number(proposalForm.probability),
        negotiation_notes: proposalForm.negotiation_notes,
        competitors,
        decision_maker: proposalForm.decision_maker,
      },
    })
  }, [proposalForm, proposalMutation])

  const handleProposalArchive = useCallback((proposal) => {
    proposalMutation.mutate({ action: 'archive', proposalId: proposal?.id })
  }, [proposalMutation])

  const handleLeadOverviewSubmit = useCallback((payload) => {
    setPendingLeadUpdate(payload)
  }, [])

  const handleHeaderSave = useCallback((payload) => {
    // Return the mutation promise so the LeadHeader can keep its edit state open
    // (with disabled buttons + spinner) until the request actually completes.
    return leadUpdateMutation.mutateAsync(payload)
  }, [leadUpdateMutation])

  const handleConfirmLeadUpdate = useCallback(() => {
    if (!pendingLeadUpdate) return
    leadUpdateMutation.mutate(pendingLeadUpdate)
  }, [leadUpdateMutation, pendingLeadUpdate])

  let body
  if (activeTab === 'notes') body = <LeadNotesTab leadId={leadId} lead={lead} />
  else if (activeTab === 'files') body = <LeadFilesTab leadId={leadId} lead={lead} />
  else if (activeTab === 'attachments') body = <LeadAttachmentsTab leadId={leadId} lead={lead} />
  else if (activeTab === 'tasks') body = <LeadTasksTab />
  else if (activeTab === 'meetings') body = <LeadMeetingsTab />
  else if (activeTab === 'emails') body = <LeadEmailsTab />
  else if (activeTab === 'call_logs') body = <LeadCallLogsTab />
  else if (activeTab === 'documents') body = <LeadDocumentsTab leadId={leadId} lead={lead} />
  else if (activeTab === 'proposal') {
    body = (
      <LeadProposalTab
        deal={deal}
        proposals={proposals}
        form={proposalForm}
        onChange={handleProposalChange}
        onSubmit={handleProposalSubmit}
        onArchive={handleProposalArchive}
        isSaving={proposalMutation.isLoading}
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
        <MetaAttribution lead={lead} />
        <LeadOverview
          lead={lead}
          users={users}
          onSubmit={handleLeadOverviewSubmit}
          isSaving={leadUpdateMutation.isLoading}
        />
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
        onScheduleFollowUp={openFollowUp}
        onDeleteLead={() => setDeleteOpen(true)}
        deletingLead={deleteLeadMutation.isLoading}
        onSaveLead={handleHeaderSave}
        isSaving={leadUpdateMutation.isLoading}
        users={users}
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
      <SalesFollowUpDialog
        open={followUpOpen}
        lead={lead}
        users={users}
        onClose={() => setFollowUpOpen(false)}
      />
      <ConfirmDialog
        isOpen={Boolean(pendingLeadUpdate)}
        title="Confirm lead changes"
        message="Review accuracy before saving. These changes will update the lead record."
        confirmLabel="Save changes"
        loading={leadUpdateMutation.isLoading}
        onConfirm={handleConfirmLeadUpdate}
        onClose={() => {
          if (!leadUpdateMutation.isLoading) setPendingLeadUpdate(null)
        }}
      />
      <ConfirmDialog
        isOpen={deleteOpen}
        title="Delete lead permanently?"
        message={`This will permanently delete "${leadLabel}" and all of its history, deals, proposals, documents, notes, files, activities and tasks. This action cannot be undone.`}
        confirmLabel="Delete lead"
        loading={deleteLeadMutation.isLoading}
        onConfirm={() => {
          if (!deleteLeadMutation.isLoading && !deleteInFlightRef.current) {
            deleteInFlightRef.current = true
            deleteLeadMutation.mutate(leadId, {
              onSettled: () => {
                deleteInFlightRef.current = false
              },
            })
          }
        }}
        onClose={() => {
          if (!deleteLeadMutation.isLoading) setDeleteOpen(false)
        }}
      />
    </>
  )
}
