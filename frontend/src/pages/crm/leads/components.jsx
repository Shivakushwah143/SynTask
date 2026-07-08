/* eslint-disable react-refresh/only-export-components */
import { memo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BadgeInfo, CalendarClock, Clock3, FileText, History, Lock, Mail, MessageSquare, Sparkles, StickyNote, Video, Wand2 } from 'lucide-react'
import { CRMContent, CRMEmptyState, CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'
import { Badge, Button, EmptyState, inputClassName } from '../../../components/ui'
import { formatCurrency, formatShortDate, getLeadContactLabel, getLeadOwnerLabel, getLeadTags } from '../pipeline/utils'

export const LEAD_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'notes', label: 'Notes' },
  { key: 'files', label: 'Files' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'emails', label: 'Emails' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'history', label: 'History' },
  { key: 'ai', label: 'AI Sales' },
]

export const LeadWorkspace = memo(function LeadWorkspace({
  title,
  description,
  breadcrumbs,
  lead,
  activeTab,
  onTabChange,
  onBack,
  onRefresh,
  body,
  sidebar,
}) {
  return (
    <CRMPage>
      <CRMPageTitle
        eyebrow="CRM Lead Workspace"
        title={title}
        description={description}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
              Back to pipeline
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
    <CRMContent aside={sidebar}>
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
  const createdDate = formatShortDate(lead?.created_at || lead?.createdAt || lead?.created_date)

  return (
    <CRMSection
      title="Lead summary"
      description="Single source of truth for the selected CRM lead."
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <Badge label={stage} colorKey="draft" />
          <Badge label={lead?.priority || lead?.interest_level || 'medium'} colorKey={lead?.priority || 'medium'} />
        </div>
      )}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))]">
          <article className="rounded-2xl border border-surface-border/80 bg-gradient-to-br from-slate-50 to-white p-5 dark:border-gray-800 dark:from-gray-900 dark:to-gray-950">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">Company</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            {companyName}
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            {contactName || 'Primary contact not available'}
          </p>
        </article>
        <SummaryChip label="Contact" value={contactName} />
        <SummaryChip label="Stage" value={stage} />
        <SummaryChip label="Owner" value={ownerName} />
        <SummaryChip label="Deal value" value={formatCurrency(dealValue)} />
        <SummaryChip label="Created" value={createdDate} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Tags</span>
        {leadTags.length ? leadTags.map((tag) => (
          <Badge key={tag} label={tag} colorKey="draft" />
        )) : (
          <span className="text-sm text-gray-500 dark:text-gray-400">No tags</span>
        )}
      </div>
      <div className="mt-4">
        <LeadActions lead={lead} />
      </div>
      {breadcrumbs?.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          {breadcrumbs.map((crumb, index) => (
            <span key={`${crumb}-${index}`} className="inline-flex items-center gap-2">
              {index > 0 ? <ArrowRight className="h-3.5 w-3.5" /> : null}
              <span>{crumb}</span>
            </span>
          ))}
        </div>
      ) : null}
    </CRMSection>
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
  const items = [
    { label: 'Company', value: lead?.crm_company_name || lead?.company_name || '-' },
    { label: 'Primary Contact', value: lead?.crm_contact_name || lead?.primary_contact || lead?.contact_name || lead?.prospect_name || '-' },
    { label: 'Owner', value: lead?.owner_name || lead?.assigned_to_name || lead?.assigned_to || '-' },
    { label: 'Stage', value: lead?.current_stage || '-' },
    { label: 'Priority', value: lead?.priority || lead?.interest_level || '-' },
    { label: 'Deal Value', value: formatCurrency(lead?.won_amount ?? lead?.deal_value ?? 0) },
    { label: 'Created Date', value: formatShortDate(lead?.created_at || lead?.createdAt || lead?.created_date) },
    { label: 'Last Activity', value: formatShortDate(lead?.updated_at || lead?.updatedAt || lead?.stage_last_changed_at) },
    { label: 'Tags', value: Array.isArray(lead?.tag) ? lead.tag.join(', ') : lead?.tag || '-' },
    { label: 'Source', value: lead?.channel || '-' },
    { label: 'Status', value: lead?.status || '-' },
  ]

  return (
    <CRMSection title="Overview" description="Core lead data sourced from the Sales domain.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <article key={item.label} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">{item.label}</p>
            <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{item.value}</p>
          </article>
        ))}
      </div>
    </CRMSection>
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

export const LeadSidebar = memo(function LeadSidebar({ lead }) {
  const navigate = useNavigate()
  const activityPath = lead?.id ? `/crm/activities?entity_type=lead&entity_id=${lead.id}` : '/crm/activities'
  return (
    <div className="space-y-6">
      <CRMSection title="Quick Actions" description="Shortcuts for lead workflows that already exist.">
        <div className="grid gap-2">
          <Link className="btn btn-secondary justify-between" to={activityPath}>
            <span>Lead activities</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Button type="button" variant="primary" className="justify-between" onClick={() => navigate('/crm/pipeline')}>
            <span>Back to pipeline</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button type="button" variant="secondary" className="justify-between" onClick={() => navigate('/crm/dashboard')}>
            <span>CRM dashboard</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CRMSection>

      <CRMSection title="Upcoming Meeting" description="Meeting integration is not implemented yet.">
        <EmptyState
          icon={Video}
          title="No meeting linked"
          description="The workspace is reserved for future meeting data without introducing a separate data flow."
        />
      </CRMSection>

      <CRMSection title="Recent Activity" description="Timeline is not implemented in this sprint.">
        <EmptyState
          icon={History}
          title="No timeline data"
          description="This panel will show the lead activity stream once timeline features are enabled."
        />
      </CRMSection>

      <CRMSection title="Reserved AI Panel" description="Disabled until AI support is introduced.">
        <div className="rounded-2xl border border-dashed border-surface-border bg-white/70 p-5 dark:border-gray-800 dark:bg-gray-900/70">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-gray-100 p-3 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">AI workspace reserved</p>
              <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                This section is intentionally disabled and ready for future AI workflows.
              </p>
            </div>
          </div>
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

function SummaryChip({ label, value }) {
  return (
    <article className="rounded-2xl border border-surface-border/80 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-base font-semibold text-gray-900 dark:text-gray-100">{value}</p>
    </article>
  )
}
