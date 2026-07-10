/* eslint-disable react-refresh/only-export-components */
import { memo, useEffect, useState } from 'react'
import { useMutation, useQuery } from 'react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BadgeInfo, CalendarClock, Clock3, FileText, History, Lock, Mail, MessageSquare, Sparkles, StickyNote, Video, Wand2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { crmApi } from '../../../api/crm'
import { salesApi } from '../../../api/sales'
import { usersAPI } from '../../../api/users'
import { CRMContent, CRMEmptyState, CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'
import { Badge, Button, EmptyState, inputClassName } from '../../../components/ui'
import { formatCurrency, formatShortDate, getLeadContactLabel, getLeadOwnerLabel, getLeadTags } from '../pipeline/utils'
import { LeadFilesTab } from './files'

export const LEAD_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'notes', label: 'Notes' },
  { key: 'files', label: 'Files' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'proposal', label: 'Proposal' },
]

const leadTone = (value) => {
  const key = String(value || '').toLowerCase()
  if (['critical', 'high', 'hot', 'lost', 'dead'].some((item) => key.includes(item))) return 'rose'
  if (['warm', 'medium', 'proposal', 'qualified', 'contacted'].some((item) => key.includes(item))) return 'amber'
  if (['won', 'active', 'low', 'cold', 'new'].some((item) => key.includes(item))) return 'emerald'
  return 'slate'
}

const toneClass = (tone) => ({
  rose: 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-200 dark:ring-rose-900/50',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900/50',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-900/50',
  slate: 'bg-slate-50 text-slate-700 ring-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800',
}[tone] || 'bg-slate-50 text-slate-700 ring-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800')

function LeadPill({ label, value }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${toneClass(leadTone(value))}`}>
      {label ? <span className="text-current/70">{label}</span> : null}
      {value || '-'}
    </span>
  )
}

export const LeadWorkspace = memo(function LeadWorkspace({
  title,
  description,
  breadcrumbs,
  lead,
  activeTab,
  onTabChange,
  onBack,
  onRefresh,
  onSendEmail,
  body,
  sidebar,
}) {
  return (
    <CRMPage>
      <CRMPageTitle
        eyebrow="CRM Lead"
        title={title}
        description={description}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="primary" size="sm" onClick={onSendEmail}>
              <Mail className="h-4 w-4" />
              Send Email
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onRefresh}>
              Refresh
            </Button>
          </div>
        )}
      />

      <LeadHeader lead={lead} breadcrumbs={breadcrumbs} />

      <LeadTabs activeTab={activeTab} onTabChange={onTabChange} />

      <LeadWorkspaceLayout body={body} sidebar={sidebar} />
    </CRMPage>
  )
})

export const LeadWorkspaceLayout = memo(function LeadWorkspaceLayout({ body, sidebar }) {
  return (
    <CRMContent className="xl:grid-cols-[minmax(0,1fr)_320px]" aside={sidebar}>
      {body}
    </CRMContent>
  )
})

export const LeadHeader = memo(function LeadHeader({ lead, breadcrumbs = [] }) {
  const companyName = lead?.crm_company_name || lead?.company_name || lead?.prospect_name || 'Lead'
  const contactName = getLeadContactLabel(lead)
  const ownerName = getLeadOwnerLabel(lead)
  const leadTags = getLeadTags(lead)
  const dealValue = lead?.won_amount ?? lead?.deal_value ?? 0
  const stage = lead?.current_stage || 'Unassigned'
  const priority = lead?.priority || lead?.interest_level || 'medium'
  const status = lead?.status || 'active'
  const createdDate = formatShortDate(lead?.created_at || lead?.createdAt || lead?.created_date)

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-100/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="h-1.5 bg-gradient-to-r from-primary-500 via-emerald-400 to-amber-300" />
      <div className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <LeadPill label="Stage" value={stage} />
              <LeadPill label="Priority" value={priority} />
              <LeadPill label="Status" value={status} />
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            {companyName}
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{contactName || 'Primary contact not available'}</p>
            {breadcrumbs?.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                {breadcrumbs.map((crumb, index) => (
                  <span key={`${crumb}-${index}`} className="inline-flex items-center gap-2">
                    {index > 0 ? <ArrowRight className="h-3.5 w-3.5" /> : null}
                    <span>{crumb}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="grid min-w-[240px] gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <SummaryChip label="Owner" value={ownerName} compact />
            <SummaryChip label="Deal value" value={formatCurrency(dealValue)} compact />
            <SummaryChip label="Created" value={createdDate} compact />
          </div>
        </div>
        {leadTags.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
            {leadTags.slice(0, 5).map((tag) => <Badge key={tag} label={tag} colorKey="draft" />)}
          </div>
        ) : null}
      </div>
    </section>
  )
})

export const LeadTabs = memo(function LeadTabs({ activeTab, onTabChange }) {
  return (
    <nav aria-label="Lead workspace sections" className="overflow-x-auto rounded-2xl border border-surface-border/80 bg-white/90 p-2 shadow-sm dark:border-gray-800 dark:bg-gray-900/85">
      <div className="flex min-w-max items-center gap-2">
        {LEAD_TABS.map((tab) => {
          const isActive = activeTab === tab.key
          const commonClass = `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            isActive
              ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-200'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
          }`

          if (tab.disabled) {
            return (
              <button
                key={tab.key}
                type="button"
                className={`${commonClass} cursor-not-allowed opacity-60`}
                aria-disabled="true"
                title="Coming soon"
              >
                {tab.label}
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  Soon
                </span>
              </button>
            )
          }

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange?.(tab.key)}
              aria-current={isActive ? 'page' : undefined}
              className={commonClass}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
})

export const LeadOverview = memo(function LeadOverview({ lead }) {
  const customFields = lead?.custom_fields && typeof lead.custom_fields === 'object' ? lead.custom_fields : {}
  const items = [
    { label: 'Contact', value: lead?.crm_contact_name || lead?.primary_contact || lead?.contact_name || lead?.prospect_name || '-' },
    { label: 'Email', value: lead?.email || '-' },
    { label: 'Phone', value: lead?.phone || '-' },
    { label: 'Source', value: lead?.channel || '-' },
    { label: 'Estimated close', value: formatShortDate(lead?.estimated_close_date) },
    { label: 'Days in stage', value: String(Math.max(Number(lead?.days_in_stage || 0), 0)) },
  ]

  return (
    <div className="space-y-4">
      <CRMSection title="Lead details" description="The main fields you need before contacting or updating this lead.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article key={item.label} className="rounded-xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{item.label}</p>
              <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{item.value}</p>
            </article>
          ))}
        </div>
      </CRMSection>
      {Object.keys(customFields).length ? (
        <CRMSection title="Custom fields" description="Additional values saved with this lead.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Object.entries(customFields).map(([key, value]) => (
              <article key={key} className="rounded-xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{key}</p>
                <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{String(value)}</p>
              </article>
            ))}
          </div>
        </CRMSection>
      ) : null}
    </div>
  )
})

export const LeadSummaryCards = memo(function LeadSummaryCards({ lead }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <CRMStatCard icon={BadgeInfo} label="Priority" value={lead?.priority || lead?.interest_level || 'medium'} tone="blue" />
      <CRMStatCard icon={Clock3} label="Days in stage" value={String(Math.max(Number(lead?.days_in_stage || 0), 0))} tone="emerald" />
      <CRMStatCard icon={CalendarClock} label="Created" value={formatShortDate(lead?.created_at || lead?.createdAt || lead?.created_date)} tone="amber" />
      <CRMStatCard icon={FileText} label="Deal value" value={formatCurrency(lead?.won_amount ?? lead?.deal_value ?? 0)} tone="slate" />
    </div>
  )
})

export const LeadSidebar = memo(function LeadSidebar({ lead, onSendEmail }) {
  const navigate = useNavigate()
  const activityPath = lead?.id ? `/crm/activities?entity_type=lead&entity_id=${lead.id}` : '/crm/activities'
  const { data: stagesData } = useQuery('crm-lead-edit-stages', salesApi.getStages)
  const { data: usersData } = useQuery('crm-lead-edit-users', () => usersAPI.getAssignableUsers())
  const stages = Array.isArray(stagesData?.stages) ? stagesData.stages : []
  const users = Array.isArray(usersData?.users) ? usersData.users : []
  const [form, setForm] = useState({ current_stage: '', status: '', assigned_to: '', interest_level: '', channel: '', tag: '' })
  const [customFields, setCustomFields] = useState('{}')

  useEffect(() => {
    const custom = lead?.custom_fields && typeof lead.custom_fields === 'object' ? lead.custom_fields : {}
    setForm({
      current_stage: lead?.current_stage || '',
      status: lead?.status || '',
      assigned_to: lead?.assigned_to || '',
      interest_level: lead?.interest_level || '',
      channel: lead?.channel || '',
      tag: Array.isArray(lead?.tag) ? lead.tag.join('|') : (lead?.tag || ''),
    })
    setCustomFields(JSON.stringify(custom, null, 2))
  }, [lead])

  const stageMutation = useMutation((stage) => crmApi.updatePipelineStage(lead?.id, { stage }), {
    onSuccess: () => toast.success('Lead stage updated'),
    onError: (error) => toast.error(error?.response?.data?.detail || 'Stage update failed'),
  })

  const saveMutation = useMutation((payload) => salesApi.updateProspectForm(lead?.id, payload), {
    onSuccess: () => toast.success('Lead updated'),
    onError: (error) => toast.error(error?.response?.data?.detail || 'Update failed'),
  })

  const saveLead = () => {
    const payload = new FormData()
    Object.entries(form).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') payload.append(key, value)
    })
    try {
      const parsed = customFields.trim() ? JSON.parse(customFields) : {}
      payload.append('custom_fields', JSON.stringify(parsed))
    } catch {
      toast.error('Custom fields must be valid JSON')
      return
    }
    const nextStage = form.current_stage?.trim()
    if (nextStage && nextStage !== (lead?.current_stage || '')) {
      stageMutation.mutate(nextStage)
    }
    saveMutation.mutate(payload)
  }
  return (
    <div className="space-y-6">
      <CRMSection title="Update lead" description="Quick edit for ownership and pipeline fields.">
        <div className="grid gap-3">
          <select className={inputClassName} value={form.current_stage} onChange={(e) => setForm((s) => ({ ...s, current_stage: e.target.value }))}>
            <option value="">Stage</option>
            {stages.map((stage) => <option key={stage.id || stage.name} value={stage.id || stage.name}>{stage.name}</option>)}
          </select>
          <select className={inputClassName} value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
            <option value="">Status</option>
            <option value="active">Active</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="closed">Closed</option>
          </select>
          <select className={inputClassName} value={form.assigned_to} onChange={(e) => setForm((s) => ({ ...s, assigned_to: e.target.value }))}>
            <option value="">Owner</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.first_name} {user.last_name}</option>)}
          </select>
          <select className={inputClassName} value={form.interest_level} onChange={(e) => setForm((s) => ({ ...s, interest_level: e.target.value }))}>
            <option value="">Priority</option>
            <option value="cold">Cold</option>
            <option value="warm">Warm</option>
            <option value="hot">Hot</option>
          </select>
          <input className={inputClassName} value={form.channel} onChange={(e) => setForm((s) => ({ ...s, channel: e.target.value }))} placeholder="Source" />
          <input className={inputClassName} value={form.tag} onChange={(e) => setForm((s) => ({ ...s, tag: e.target.value }))} placeholder="Tags, pipe-separated" />
        </div>
        <details className="mt-4 rounded-xl border border-surface-border/80 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
          <summary className="cursor-pointer list-none text-sm font-medium text-gray-700 dark:text-gray-200">
            Advanced fields
          </summary>
          <div className="mt-4 space-y-3">
            <textarea className={`${inputClassName} min-h-28`} value={customFields} onChange={(e) => setCustomFields(e.target.value)} placeholder='{"budget":"10000"}' />
            <Button type="button" variant="primary" className="w-full" onClick={saveLead} loading={saveMutation.isLoading}>
              Save lead
            </Button>
          </div>
        </details>
      </CRMSection>
      <CRMSection title="Actions" description="Fast links to related CRM areas.">
        <div className="grid gap-2">
          <Button type="button" variant="primary" className="justify-between" onClick={onSendEmail}>
            <span>Send Email</span>
            <Mail className="h-4 w-4" />
          </Button>
          <Link className="btn btn-secondary justify-between" to={activityPath}>
            <span>Activities</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Button type="button" variant="secondary" className="justify-between" onClick={() => navigate('/crm/pipeline')}>
            <span>Pipeline</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CRMSection>

    </div>
  )
})

export const LeadActions = memo(function LeadActions() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" size="sm">
        <MessageSquare className="h-4 w-4" />
        Quick note
      </Button>
      <Button type="button" variant="secondary" size="sm">
        <Mail className="h-4 w-4" />
        Send email
      </Button>
      <Button type="button" variant="secondary" size="sm">
        <StickyNote className="h-4 w-4" />
        Add note
      </Button>
      <Button type="button" variant="secondary" size="sm" disabled>
        <Wand2 className="h-4 w-4" />
        AI disabled
      </Button>
    </div>
  )
})

export const LeadAccessDeniedState = memo(function LeadAccessDeniedState({ onBack }) {
  return (
    <CRMSection title="Lead workspace" description="Access is controlled by the Sales module permission.">
      <EmptyState
        icon={Lock}
        title="Access denied"
        description="You do not have access to this CRM lead workspace. Ask an administrator to enable the sales module for your account."
        action={(
          <Button type="button" variant="primary" onClick={onBack}>
            Back to pipeline
          </Button>
        )}
      />
    </CRMSection>
  )
})

export const LeadLoadingState = memo(function LeadLoadingState() {
  return (
    <CRMSection title="Loading lead" description="Fetching the selected lead from the Sales domain.">
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
        <div className="h-12 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <div className="h-80 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />
            <div className="h-80 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />
          </div>
          <div className="space-y-4">
            <div className="h-48 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />
            <div className="h-48 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />
            <div className="h-48 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />
          </div>
        </div>
      </div>
    </CRMSection>
  )
})

export const LeadTimelineTab = memo(function LeadTimelineTab() {
  return (
    <CRMSection title="Timeline" description="Timeline is reserved for a future activity stream.">
      <CRMEmptyState
        icon={History}
        title="Timeline coming soon"
        description="Lead activity will appear here once the CRM timeline workspace is introduced."
      />
    </CRMSection>
  )
})

export const LeadMeetingsTab = memo(function LeadMeetingsTab() {
  return (
    <CRMSection title="Meetings" description="Meeting coordination will be added later.">
      <CRMEmptyState
        icon={Video}
        title="Meetings coming soon"
        description="This section will host future meeting scheduling data."
      />
    </CRMSection>
  )
})

export const LeadTasksTab = memo(function LeadTasksTab() {
  return (
    <CRMSection title="Tasks" description="Lead-scoped task links will appear here.">
      <CRMEmptyState
        icon={Sparkles}
        title="Tasks ready"
        description="This tab is reserved for lead tasks without duplicating task records."
      />
    </CRMSection>
  )
})

export const LeadAttachmentsTab = memo(function LeadAttachmentsTab({ leadId, lead }) {
  return <LeadFilesTab leadId={leadId} lead={lead} />
})

export const LeadCallLogsTab = memo(function LeadCallLogsTab() {
  return (
    <CRMSection title="Call Logs" description="Call history will be surfaced here when telephony events are connected.">
      <CRMEmptyState
        icon={Video}
        title="No call logs yet"
        description="Incoming and outgoing call events will appear here."
      />
    </CRMSection>
  )
})

export const LeadEmailsTab = memo(function LeadEmailsTab() {
  return (
    <CRMSection title="Emails" description="Email threads are not implemented yet.">
      <CRMEmptyState
        icon={Mail}
        title="Emails coming soon"
        description="Unified email threads will appear here in a future sprint."
      />
    </CRMSection>
  )
})

export const LeadProposalTab = memo(function LeadProposalTab({
  deal = null,
  proposals = [],
  form,
  onChange,
  onSubmit,
  onArchive,
  isSaving = false,
  isLoading = false,
  errorMessage = '',
  onRetry,
}) {
  if (isLoading) {
    return (
      <CRMSection title="Proposal" description="Loading the deal and proposal history.">
        <div className="space-y-3">
          {[1, 2].map((item) => (
            <div key={item} className="h-32 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      </CRMSection>
    )
  }

  if (errorMessage) {
    return (
      <CRMSection title="Proposal" description="Could not load deal data.">
        <EmptyState
          icon={Wand2}
          title="Proposal unavailable"
          description={errorMessage}
          action={(
            <Button type="button" variant="primary" onClick={onRetry}>
              Retry
            </Button>
          )}
        />
      </CRMSection>
    )
  }

  return (
    <div className="space-y-6">
      <CRMSection title="Deal" description="One deal owns multiple proposal versions.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryChip label="Value" value={formatCurrency(deal?.value ?? 0)} />
          <SummaryChip label="Stage" value={deal?.stage || '-'} />
          <SummaryChip label="Probability" value={`${deal?.probability ?? 0}%`} />
          <SummaryChip label="Expected close" value={formatShortDate(deal?.expected_close_date)} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Decision maker</p>
            <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{deal?.decision_maker || 'Not set'}</p>
          </article>
          <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Competitors</p>
            <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
              {Array.isArray(deal?.competitors) && deal.competitors.length ? deal.competitors.join(', ') : 'None recorded'}
            </p>
          </article>
        </div>
      </CRMSection>

      <CRMSection title="Proposal composer" description="Create or update proposal versions without leaving the lead workspace.">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Title</span>
            <input className={inputClassName} value={form.title} onChange={(event) => onChange('title', event.target.value)} placeholder="Proposal v1" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Status</span>
            <select className={inputClassName} value={form.status} onChange={(event) => onChange('status', event.target.value)}>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="viewed">Viewed</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Deal value</span>
            <input className={inputClassName} type="number" value={form.deal_value} onChange={(event) => onChange('deal_value', event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Probability %</span>
            <input className={inputClassName} type="number" min="0" max="100" value={form.probability} onChange={(event) => onChange('probability', event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Expected close date</span>
            <input className={inputClassName} type="datetime-local" value={form.expected_close_date} onChange={(event) => onChange('expected_close_date', event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Decision maker</span>
            <input className={inputClassName} value={form.decision_maker} onChange={(event) => onChange('decision_maker', event.target.value)} />
          </label>
          <label className="block lg:col-span-2">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Competitors</span>
            <input className={inputClassName} value={form.competitors} onChange={(event) => onChange('competitors', event.target.value)} placeholder="Comma separated competitors" />
          </label>
          <label className="block lg:col-span-2">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Negotiation notes</span>
            <textarea className={`${inputClassName} min-h-28`} value={form.negotiation_notes} onChange={(event) => onChange('negotiation_notes', event.target.value)} />
          </label>
          <label className="block lg:col-span-2">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Summary</span>
            <textarea className={`${inputClassName} min-h-24`} value={form.summary} onChange={(event) => onChange('summary', event.target.value)} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {proposals[0] && !proposals[0].archived ? (
            <Button type="button" variant="secondary" onClick={() => onArchive?.(proposals[0])}>Archive latest</Button>
          ) : null}
          <Button type="button" variant="primary" onClick={onSubmit} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save proposal version'}
          </Button>
        </div>
      </CRMSection>

      <CRMSection title="Proposal versions" description="Version history for the current deal.">
        <div className="space-y-3">
          {proposals.length ? proposals.map((proposal) => (
            <article key={proposal.id} className="rounded-3xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{proposal.title}</h3>
                    <Badge label={`v${proposal.version}`} colorKey="draft" />
                    <Badge label={proposal.status} colorKey={proposal.status === 'accepted' ? 'completed' : proposal.status === 'rejected' ? 'critical' : 'scheduled'} />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{proposal.summary || 'No summary provided.'}</p>
                </div>
                <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                  <p>Created {formatShortDate(proposal.created_at)}</p>
                  <p className="mt-1">{proposal.archived ? 'Archived' : 'Active'}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge label={`Value ${formatCurrency(proposal.deal_value || 0)}`} colorKey="draft" />
                <Badge label={`Close ${formatShortDate(proposal.expected_close_date)}`} colorKey="draft" />
                <Badge label={`Probability ${proposal.probability ?? 0}%`} colorKey="draft" />
              </div>
            </article>
          )) : (
            <CRMEmptyState
              icon={Wand2}
              title="No proposals yet"
              description="Create the first proposal version for this deal."
            />
          )}
        </div>
      </CRMSection>
    </div>
  )
})

export const LeadHistoryTab = memo(function LeadHistoryTab({
  items = [],
  isLoading = false,
  errorMessage = '',
  onRetry,
}) {
  if (isLoading) {
    return (
      <CRMSection title="History" description="Loading the pipeline history.">
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      </CRMSection>
    )
  }

  if (errorMessage) {
    return (
      <CRMSection title="History" description="Could not load the pipeline history.">
        <EmptyState
          icon={History}
          title="History unavailable"
          description={errorMessage}
          action={(
            <Button type="button" variant="primary" onClick={onRetry}>
              Retry
            </Button>
          )}
        />
      </CRMSection>
    )
  }

  if (!items.length) {
    return (
      <CRMSection title="History" description="Historical audit views use the pipeline history endpoint.">
        <CRMEmptyState
          icon={History}
          title="No history yet"
          description="Stage transitions and other pipeline changes will appear here over time."
        />
      </CRMSection>
    )
  }

  return (
    <CRMSection title="History" description="Read-only stage transition history from the Sales domain.">
      <div className="space-y-3">
        {items.map((item) => (
          <article key={item.id} className="rounded-3xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {item.previous_stage ? `${item.previous_stage} → ${item.new_stage}` : item.new_stage}
                  </h3>
                  <Badge label="History" colorKey="draft" />
                </div>
                <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">
                  {item.reason || 'Stage transition recorded.'}
                </p>
              </div>
              <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                <p>{item.user_name || 'System'}</p>
                <p className="mt-1">{formatShortDate(item.timestamp)}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge label={`Days in previous stage: ${item.days_in_previous_stage ?? 0}`} colorKey="draft" />
              {item.previous_stage ? <Badge label={`From: ${item.previous_stage}`} colorKey="draft" /> : null}
              {item.new_stage ? <Badge label={`To: ${item.new_stage}`} colorKey="draft" /> : null}
            </div>
          </article>
        ))}
      </div>
    </CRMSection>
  )
})

export const LeadAITab = memo(function LeadAITab() {
  return (
    <CRMSection title="AI" description="AI Sales is available from the lead workspace.">
      <CRMEmptyState
        icon={Sparkles}
        title="Open the AI Sales tab"
        description="Use the lead workspace AI tab to generate communication, approve drafts, and send through the notification service."
      />
    </CRMSection>
  )
})

function SummaryChip({ label, value, compact = false }) {
  return (
    <article className={`rounded-xl border border-surface-border/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 ${compact ? 'p-3' : 'p-5'}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`${compact ? 'mt-1 text-sm' : 'mt-2 text-base'} font-semibold text-gray-900 dark:text-gray-100`}>{value}</p>
    </article>
  )
}
