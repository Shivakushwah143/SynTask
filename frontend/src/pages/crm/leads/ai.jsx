import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { CheckCircle2, Edit3, Mail, MessageSquare, RefreshCcw, Send, Sparkles, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { aiAPI } from '../../../api/ai'
import { crmApi } from '../../../api/crm'
import { CRMEmptyState, CRMSection } from '../../../components/crm'
import { Badge, Button, Modal, inputClassName } from '../../../components/ui'
import { EmailComposer } from '../../../components/EmailComposer'
import { formatShortDate } from '../pipeline/utils'
import { sanitizeHtml } from '../../../utils/sanitizeHtml'
import { timeService } from '@/services/timeService'

const WORKSPACE_QUERY_KEY = 'crm-lead-workspace'
const defaultDraft = (lead = null) => ({
  subject: '',
  html: '',
  text: '',
  whatsapp: '',
  meeting: '',
  followUp: '',
  mode: 'manual',
  executionMode: 'manual',
  executionStatus: 'idle',
  delivery: null,
  ai: null,
  lastGeneratedAt: null,
  leadSnapshot: lead,
})

const stripHtml = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

export function LeadAISalesTab({ leadId, lead, onRefresh }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(defaultDraft(lead))
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorField, setEditorField] = useState('email')
  const [editorValue, setEditorValue] = useState('')
  const [mode, setMode] = useState('manual')
  const [pendingApproval, setPendingApproval] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)

  useEffect(() => {
    setDraft((current) => ({
      ...current,
      leadSnapshot: lead,
    }))
  }, [lead])

  const timelineQuery = useQuery(
    [WORKSPACE_QUERY_KEY, leadId, 'ai-timeline'],
    () => crmApi.getLeadTimeline(leadId),
    {
      enabled: Boolean(leadId),
      retry: false,
      staleTime: 60 * 1000,
    }
  )

  const activitiesQuery = useQuery(
    [WORKSPACE_QUERY_KEY, leadId, 'ai-activities'],
    () => crmApi.getActivities({ entity_type: 'lead', entity_id: leadId, limit: 10 }),
    {
      enabled: Boolean(leadId),
      retry: false,
      staleTime: 60 * 1000,
    }
  )

  const salesAgentMutation = useMutation(
    (payload) => aiAPI.generateSalesAgent(payload),
    {
      onSuccess: (response, variables) => {
        const communication = response?.email || {}
        const whatsapp = response?.whatsapp || {}
        const ai = response?.lead_intelligence || null
        setDraft((current) => ({
          ...current,
          subject: communication.subject || current.subject,
          html: communication.html || current.html,
          text: communication.text || current.text,
          whatsapp: whatsapp.message || current.whatsapp,
          meeting: response?.meeting?.reason || current.meeting,
          followUp: response?.follow_up?.summary || current.followUp,
          mode: variables?.execution_mode || current.mode,
          executionMode: response?.execution_mode || variables?.execution_mode || current.executionMode,
          executionStatus: response?.execution_status || current.executionStatus,
          delivery: response?.delivery || null,
          ai,
          lastGeneratedAt: response?.generated_at || timeService.toUtcISOString(timeService.now()),
        }))
        setPendingApproval(variables?.execution_mode === 'manual')
        toast.success(variables?.execution_mode === 'auto' ? 'Sales action executed' : 'AI generated')
        queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId], { exact: false })
        queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId, 'timeline'], { exact: false })
        queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId, 'history'], { exact: false })
        queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId, 'ai-activities'], { exact: false })
        onRefresh?.()
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || 'Failed to generate sales AI')
      },
    }
  )

  const summary = draft.ai || {}
  const delivery = draft.delivery || {}
  const hasGenerated = Boolean(draft.lastGeneratedAt)
  const timelineItems = useMemo(() => timelineQuery.data?.items || [], [timelineQuery.data])
  const activityItems = useMemo(() => activitiesQuery.data?.items || activitiesQuery.data?.activities || [], [activitiesQuery.data])

  const runAgent = (executionMode) => {
    if (!leadId) return
    setMode(executionMode)
    salesAgentMutation.mutate({
      lead_id: leadId,
      depth: 'standard',
      persist: false,
      execution_mode: executionMode,
    })
  }

  const openComposerFromDraft = () => {
    if (!hasGenerated) {
      runAgent('manual')
      return
    }
    setComposerOpen(true)
  }

  const openEditor = (field) => {
    setEditorField(field)
    if (field === 'email') {
      setEditorValue(draft.text || stripHtml(draft.html))
    } else if (field === 'whatsapp') {
      setEditorValue(draft.whatsapp || '')
    } else {
      setEditorValue('')
    }
    setEditorOpen(true)
  }

  const applyEditor = () => {
    if (editorField === 'email') {
      setDraft((current) => ({
        ...current,
        text: editorValue,
        html: `<p>${editorValue.replace(/\n/g, '<br/>')}</p>`,
      }))
    } else if (editorField === 'whatsapp') {
      setDraft((current) => ({ ...current, whatsapp: editorValue }))
    }
    setEditorOpen(false)
  }

  if (!leadId) {
    return (
      <CRMSection title="AI Sales Workspace" description="Open a lead from the pipeline to use AI assistance.">
        <CRMEmptyState
          icon={Sparkles}
          title="No lead selected"
          description="Choose a lead from the pipeline to generate a sales recommendation."
        />
      </CRMSection>
    )
  }

  return (
    <div className="space-y-6">
      <CRMSection
        title="AI Sales Employee"
        description="Generate deterministic sales recommendations from the existing CRM AI platform."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => runAgent('manual')} loading={salesAgentMutation.isLoading}>
              <Sparkles className="h-4 w-4" />
              Generate AI
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => runAgent(mode)}>
              <RefreshCcw className="h-4 w-4" />
              Regenerate
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => openEditor('email')} disabled={!hasGenerated}>
              <Edit3 className="h-4 w-4" />
              Edit Email
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => openEditor('whatsapp')} disabled={!hasGenerated}>
              <MessageSquare className="h-4 w-4" />
              Edit WhatsApp
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setPendingApproval(false)} disabled={!hasGenerated}>
              <CheckCircle2 className="h-4 w-4" />
              Approve
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setPendingApproval(false)} disabled={!hasGenerated}>
              <X className="h-4 w-4" />
              Reject
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={openComposerFromDraft} disabled={!leadId}>
              <Send className="h-4 w-4" />
              Send
            </Button>
          </div>
        )}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatusCard label="Mode" value={draft.executionMode || mode} helper={draft.executionMode === 'auto' ? 'Auto execution' : 'Manual approval'} />
          <StatusCard label="Status" value={draft.executionStatus || 'idle'} helper={draft.delivery?.sent ? 'Delivered' : 'Awaiting action'} />
          <StatusCard label="Delivery" value={delivery?.sent ? 'Sent' : delivery?.mode || 'Draft'} helper={delivery?.actions?.length ? `${delivery.actions.length} tool actions` : 'No delivery yet'} />
          <StatusCard label="Generated" value={formatShortDate(draft.lastGeneratedAt)} helper={pendingApproval ? 'Waiting for approval' : 'Ready'} />
        </div>
      </CRMSection>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
        <div className="space-y-6">
          <CRMSection title="Lead summary" description="The AI uses the current CRM record and context only.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <CompactInfo label="Name" value={lead?.prospect_name || '-'} />
              <CompactInfo label="Company" value={lead?.company_name || '-'} />
              <CompactInfo label="Phone" value={lead?.phone || '-'} />
              <CompactInfo label="Email" value={lead?.email || '-'} />
              <CompactInfo label="Source" value={lead?.source || lead?.channel || '-'} />
              <CompactInfo label="Owner" value={lead?.owner_name || lead?.assigned_to_name || lead?.assigned_to || '-'} />
              <CompactInfo label="Pipeline stage" value={lead?.current_stage || '-'} />
              <CompactInfo label="Lead score" value={summary.lead_score ?? '-'} />
            </div>
          </CRMSection>

          <CRMSection title="AI analysis" description="Structured recommendations generated by the Lead Intelligence and Sales agents.">
            <div className="grid gap-4 md:grid-cols-2">
              <AnalysisCard label="Priority" value={summary.priority || '-'} />
              <AnalysisCard label="Buying intent" value={summary.buying_intent || '-'} />
              <AnalysisCard label="Company size" value={summary.context?.company?.company_size || lead?.company_size || '-'} />
              <AnalysisCard label="Industry" value={summary.context?.company?.industry || lead?.industry || '-'} />
              <AnalysisCard label="Recommended salesperson" value={summary.recommended_salesperson?.name || summary.recommended_salesperson?.id || '-'} />
              <AnalysisCard label="Recommended stage" value={summary.recommended_pipeline_stage || '-'} />
              <AnalysisCard label="Next action" value={summary.recommended_next_action || '-'} />
              <AnalysisCard label="Reasoning summary" value={summary.reasoning_summary || '-'} />
            </div>
          </CRMSection>

          <CRMSection title="AI communication" description="Review the recommended communication before approving or sending.">
            <div className="grid gap-4 lg:grid-cols-2">
              <CommunicationCard
                title="Email draft"
                icon={Mail}
                subject={draft.subject || 'No subject'}
                html={draft.html || ''}
                text={draft.text || ''}
                onEdit={() => openEditor('email')}
              />
              <CommunicationCard
                title="WhatsApp draft"
                icon={MessageSquare}
                text={draft.whatsapp || 'No WhatsApp draft available'}
                onEdit={() => openEditor('whatsapp')}
              />
              <SimpleRecommendation
                title="Meeting recommendation"
                value={summary.meeting?.recommended ? 'Recommended' : 'Not recommended'}
                detail={summary.meeting?.reason || 'No recommendation yet'}
              />
              <SimpleRecommendation
                title="Follow-up recommendation"
                value={summary.follow_up?.recommended_date || 'Not set'}
                detail={summary.follow_up?.summary || 'No follow-up recommendation yet'}
              />
            </div>
          </CRMSection>
        </div>

        <div className="space-y-6">
          <CRMSection title="Execution status" description="Manual approval or auto execution updates the CRM after send.">
            <div className="space-y-3">
              <StatusRow label="Generated" status={Boolean(draft.lastGeneratedAt)} />
              <StatusRow label="Approved" status={pendingApproval === false && hasGenerated} />
              <StatusRow label="Sent" status={Boolean(delivery?.sent)} />
              <StatusRow label="Failed" status={draft.executionStatus === 'failed' || delivery?.status === 'failed'} />
            </div>
            {delivery?.error ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                {delivery.error}
              </div>
            ) : null}
          </CRMSection>

          <CRMSection title="Delivery status" description="Notification service response and tool-layer execution details.">
            {delivery?.actions?.length ? (
              <div className="space-y-3">
                {delivery.actions.map((action, index) => (
                  <article key={`${action.tool}-${index}`} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{action.tool}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                          {action.result?.status || action.result?.delivery?.status || 'done'}
                        </p>
                      </div>
                      <Badge label={action.result?.success === false ? 'failed' : 'success'} colorKey={action.result?.success === false ? 'critical' : 'active'} />
                    </div>
                    <pre className="mt-3 overflow-x-auto rounded-2xl bg-gray-50 p-3 text-xs leading-5 text-gray-700 dark:bg-gray-950 dark:text-gray-300">
                      {JSON.stringify(action.result, null, 2)}
                    </pre>
                  </article>
                ))}
              </div>
            ) : (
              <CRMEmptyState
                icon={Sparkles}
                title="No delivery yet"
                description="Generate the AI recommendation and switch to AUTO when ready to send."
              />
            )}
          </CRMSection>

          <CRMSection title="Timeline events" description="Latest CRM timeline activity for this lead.">
            {timelineQuery.isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />)}
              </div>
            ) : timelineItems.length ? (
              <div className="space-y-3">
                {timelineItems.slice(0, 4).map((item) => (
                  <article key={item.id} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.title || item.event_name || 'Timeline event'}</p>
                        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{item.description || item.event_name}</p>
                      </div>
                      <Badge label={formatShortDate(item.timestamp)} colorKey="draft" />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <CRMEmptyState icon={Sparkles} title="No timeline events" description="AI execution will add timeline events here after send." />
            )}
          </CRMSection>

          <CRMSection title="CRM activity" description="Latest CRM activity entries for this lead.">
            {activitiesQuery.isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />)}
              </div>
            ) : activityItems.length ? (
              <div className="space-y-3">
                {activityItems.slice(0, 4).map((item) => (
                  <article key={item.id} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.title || item.activity_type || 'Activity'}</p>
                        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{item.description || item.activity_type}</p>
                      </div>
                      <Badge label={item.status || 'draft'} colorKey={item.status === 'completed' ? 'active' : 'draft'} />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <CRMEmptyState icon={Sparkles} title="No CRM activity" description="Sending the AI Sales workflow will create an activity entry here." />
            )}
          </CRMSection>
        </div>
      </div>

      <Modal isOpen={editorOpen} onClose={() => setEditorOpen(false)} title={editorField === 'whatsapp' ? 'Edit WhatsApp draft' : 'Edit email draft'} size="xl">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Draft content</span>
            <textarea
              className={`${inputClassName} min-h-64`}
              value={editorValue}
              onChange={(event) => setEditorValue(event.target.value)}
              placeholder="Edit the draft locally before approval"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={applyEditor}>
              Save draft
            </Button>
          </div>
        </div>
      </Modal>

      <EmailComposer
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        initialData={{
          to: lead?.email ? [{ email: lead.email, name: lead.prospect_name || lead.company_name || '' }] : [],
          subject: draft.subject,
          html: draft.html,
          text: draft.text,
          related_entity_type: 'lead',
          related_entity_id: leadId,
          related_module: 'crm',
        }}
        onSend={async (response) => {
          setPendingApproval(false)
          setDraft((current) => ({
            ...current,
            executionStatus: response?.status || 'sent',
            delivery: response?.delivery || current.delivery,
          }))
          toast.success('Email sent through Notification API')
          queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId], { exact: false })
          queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId, 'timeline'], { exact: false })
          queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId, 'history'], { exact: false })
          queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId, 'ai-activities'], { exact: false })
          onRefresh?.()
        }}
      />
    </div>
  )
}

function CompactInfo({ label, value }) {
  return (
    <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{value || '-'}</p>
    </article>
  )
}

function AnalysisCard({ label, value }) {
  return (
    <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-sm leading-6 text-gray-900 dark:text-gray-100">{value || '-'}</p>
    </article>
  )
}

function CommunicationCard({ title, icon: Icon, subject, html, text, onEdit }) {
  return (
    <article className="rounded-3xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-2xl bg-primary-50 p-2 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
          <Edit3 className="h-4 w-4" />
          Edit
        </Button>
      </div>
      <div className="mt-4 space-y-3">
        {subject ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Subject</p>
            <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{subject}</p>
          </div>
        ) : null}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Preview</p>
          <div className="mt-2 rounded-2xl border border-surface-border/80 bg-gray-50 p-3 text-sm leading-6 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
            {html ? <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} /> : <p>{text || 'No draft generated'}</p>}
          </div>
        </div>
        {text ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Plain text</p>
            <pre className="mt-2 overflow-x-auto rounded-2xl bg-gray-50 p-3 text-xs leading-5 text-gray-700 dark:bg-gray-950 dark:text-gray-300">{text}</pre>
          </div>
        ) : null}
      </div>
    </article>
  )
}

function SimpleRecommendation({ title, value, detail }) {
  return (
    <article className="rounded-3xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">{title}</p>
      <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{value}</p>
      <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{detail}</p>
    </article>
  )
}

function StatusCard({ label, value, helper }) {
  return (
    <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">{value || '-'}</p>
      {helper ? <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{helper}</p> : null}
    </article>
  )
}

function StatusRow({ label, status }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-surface-border/80 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
      <Badge label={status ? 'complete' : 'pending'} colorKey={status ? 'active' : 'draft'} />
    </div>
  )
}
