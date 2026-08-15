import { useCallback, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { crmApi } from '../../../api/crm'
import { salesApi } from '../../../api/sales'
import { usersAPI } from '../../../api/users'
import { CRMEmptyState, CRMPage, CRMSection } from '../../../components/crm'
import { EmailComposer } from '../../../components/EmailComposer'
import { Button, ConfirmDialog, Modal } from '../../../components/ui'
import { useConfirmation } from '../../../hooks/useConfirmation'
import SalesFollowUpDialog from '../../../components/sales/SalesFollowUpDialog'
import { StageRequirementsDialog } from '../../../components/sales/StageRequirementsDialog'
import {
  TRANSITION_BLOCKER,
  TRANSITION_WARNING_TOAST,
  classifyTransitionFailure,
} from '../../../utils/salesTransition'
import { LeadAccessDeniedState, LeadAttachmentsTab, LeadCallLogsTab, LeadEmailsTab, LeadHistoryTab, LeadLoadingState, LeadMeetingsTab, LeadOverview, LeadSidebar, LeadTasksTab, LeadWorkspace } from './components'
import { LEAD_FILES_QUERY_KEY, LeadFilesTab } from './files'
import { LEAD_NOTES_QUERY_KEY, LeadNotesTab } from './notes'
import { LeadTimelineTab } from './timeline'
import { LeadAISalesTab } from './ai'
import { MetaAttribution } from './MetaAttribution'
import { LeadDocumentsTab } from './documents'
import { LeadAuditTab, LeadDiscoveryTab } from './discoveryAudit'
import { LeadNegotiationTab } from './negotiation'

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
  const [quotationDraftPrompt, setQuotationDraftPrompt] = useState(null)
  const [requirementsDialog, setRequirementsDialog] = useState(null)
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Synchronous guard so a rapid double-click on the confirm button cannot fire
  // two DELETE calls before React flips the mutation loading state.
  const deleteInFlightRef = useRef(false)

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

  const lead = leadQuery.data || null
  const errorStatus = leadQuery.error?.response?.status
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
  const handleDeleteSettled = useCallback(() => {
    queryClient.invalidateQueries('crm-pipeline-board')
    queryClient.invalidateQueries('crm-leads-entry')
    queryClient.invalidateQueries('sales-prospects')
    navigate('/crm/pipeline')
  }, [queryClient, navigate])

  const deleteLeadMutation = useMutation(
    () => crmApi.deleteLead(leadId),
    {
      onSuccess: (data) => {
        handleDeleteSettled()
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
      },
      onError: (error) => {
        const status = error?.response?.status
        if (status === 403) {
          toast.error('You do not have permission to delete this lead')
        } else if (status === 404) {
          // Already deleted (e.g. duplicate request) — treat as success.
          handleDeleteSettled()
          toast.success('Lead deleted')
        } else {
          toast.error(error?.response?.data?.detail || 'Failed to delete lead')
        }
      },
    },
  )
  const moveStageMutation = useMutation(
    ({ stage }) => crmApi.updatePipelineStage(leadId, { stage }),
    {
      onSuccess: (_data, variables) => {
        toast.success('Lead stage updated')
        setQuotationDraftPrompt(null)
        setRequirementsDialog(null)
        queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId], { exact: true })
        queryClient.invalidateQueries('crm-pipeline-board')
        if (variables?.tab) handleTabChange(variables.tab)
      },
      onError: (error, variables) => {
        const blocker = classifyTransitionFailure(error, 'Could not move lead stage yet')
        if (blocker.category === TRANSITION_BLOCKER.MISSING_DETAILS) {
          setRequirementsDialog({ blocker, targetStageKey: variables?.stage, tab: variables?.tab })
          return
        }
        if (blocker.category === TRANSITION_BLOCKER.TECHNICAL_ERROR) toast.error(blocker.message)
        else toast(blocker.message, TRANSITION_WARNING_TOAST)
      },
    },
  )

  const saveDialogFieldsOnly = useCallback(async (values) => {
    const entries = Object.entries(values || {})
    if (!entries.length) return
    await salesApi.updateLeadForm(leadId, Object.fromEntries(entries))
  }, [leadId])

  const handleDialogSaveFields = useCallback(async (values) => {
    try {
      await saveDialogFieldsOnly(values)
      toast.success('Details saved')
      setRequirementsDialog(null)
      queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId], { exact: true })
    } catch (error) {
      const blocker = classifyTransitionFailure(error, 'Unable to save details')
      if (blocker.category === TRANSITION_BLOCKER.TECHNICAL_ERROR) toast.error(blocker.message)
      else toast(blocker.message, TRANSITION_WARNING_TOAST)
      throw error
    }
  }, [leadId, queryClient, saveDialogFieldsOnly])

  const handleDialogSaveAndMove = useCallback(async (values) => {
    if (!requirementsDialog?.targetStageKey) return
    await saveDialogFieldsOnly(values)
    moveStageMutation.mutate({ stage: requirementsDialog.targetStageKey, tab: requirementsDialog.tab })
  }, [moveStageMutation, requirementsDialog, saveDialogFieldsOnly])

  const moveLeadStage = useCallback((stage, tab) => {
    if (!stage || moveStageMutation.isLoading) return
    moveStageMutation.mutate({ stage, tab })
  }, [moveStageMutation])

  const handleQuotationGenerated = useCallback((document) => {
    queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId], { exact: true })
    const currentStage = String(lead?.current_stage || '').toLowerCase()
    const proposalOpen = ['proposal', 'negotiation', 'agreement', 'won'].includes(currentStage)
    if (proposalOpen) {
      handleTabChange('proposal')
      return
    }
    setQuotationDraftPrompt(document || {})
  }, [handleTabChange, lead?.current_stage, leadId, queryClient])

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
  else if (activeTab === 'discovery') body = <LeadDiscoveryTab leadId={leadId} lead={lead} onScheduleFollowUp={openFollowUp} />
  else if (activeTab === 'audit') body = <LeadAuditTab leadId={leadId} lead={lead} onScheduleFollowUp={openFollowUp} onQuotationGenerated={handleQuotationGenerated} onGoToDiscovery={() => handleTabChange('discovery')} />
  else if (activeTab === 'documents') body = <LeadDocumentsTab leadId={leadId} lead={lead} mode="documents" />
  else if (activeTab === 'negotiation') body = <LeadNegotiationTab leadId={leadId} lead={lead} onSaved={handleRefresh} onScheduleFollowUp={openFollowUp} />
  else if (activeTab === 'agreement') body = <LeadDocumentsTab leadId={leadId} lead={lead} mode="agreement" />
  else if (activeTab === 'proposal') {
    body = (
      <LeadDocumentsTab leadId={leadId} lead={lead} mode="proposal" />
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
            // Return the promise so the shared <Button> locks against repeat
            // clicks while the DELETE is in flight (its pendingRef only engages
            // when the handler returns a promise).
            return deleteLeadMutation.mutateAsync(leadId).finally(() => {
              deleteInFlightRef.current = false
            })
          }
          return undefined
        }}
        onClose={() => {
          if (!deleteLeadMutation.isLoading) setDeleteOpen(false)
        }}
      />
      <Modal
        isOpen={Boolean(quotationDraftPrompt)}
        title="Quotation draft created"
        description="Discovery and Audit are ready for the Proposal step."
        size="sm"
        onClose={() => {
          if (!moveStageMutation.isLoading) setQuotationDraftPrompt(null)
        }}
        footer={(
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={moveStageMutation.isLoading}
              onClick={() => setQuotationDraftPrompt(null)}
            >
              Stay in Audit
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={moveStageMutation.isLoading}
              onClick={() => moveLeadStage('proposal', 'proposal')}
            >
              Move to Proposal
            </Button>
          </div>
        )}
      >
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
          <p>
            The quotation draft was saved successfully. To review and send it from the Proposal workspace, move this lead to the next sales stage.
          </p>
          {quotationDraftPrompt?.document_number ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
              {quotationDraftPrompt.document_number} is ready for review.
            </p>
          ) : null}
        </div>
      </Modal>
      <StageRequirementsDialog
        open={Boolean(requirementsDialog)}
        blocker={requirementsDialog?.blocker}
        lead={lead}
        users={users}
        saving={moveStageMutation.isLoading}
        moving={moveStageMutation.isLoading}
        onClose={() => {
          if (!moveStageMutation.isLoading) setRequirementsDialog(null)
        }}
        onSaveFields={handleDialogSaveFields}
        onSaveAndMove={handleDialogSaveAndMove}
      />
    </>
  )
}
