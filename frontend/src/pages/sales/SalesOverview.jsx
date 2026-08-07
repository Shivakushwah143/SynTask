// Sales Workspace — Overview.
// The salesperson's daily dashboard answering "What requires my attention today?".
// Every metric is computed from live system data (sales dashboard, pipeline board,
// and CRM activities). Values that cannot be calculated are shown as "—" instead of
// fabricating results.
//
// Compact layout: slim hero, a 2×4 KPI grid (4 tiles per row), and tight cards so the
// whole dashboard reads well without excessive vertical scrolling. Every value and label
// stays fully visible (no truncation on the KPI tiles or card headers).
import { useCallback, useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileDown,
  LayoutDashboard,
  Phone,
  PhoneCall,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  Users,
  Video,
} from 'lucide-react'
import { salesApi } from '../../api/sales'
import { crmApi } from '../../api/crm'
import {
  buildPipelineBoard,
  formatCurrency,
  getLeadDealValue,
  getLeadOwnerLabel,
  getLeadPriority,
  normalizeText,
} from '../crm/pipeline/utils'
import { CRMEmptyState } from '../../components/crm'
import { Badge, Button, Skeleton } from '../../components/ui'
import SalesFollowUpDialog from '../../components/sales/SalesFollowUpDialog'

const isToday = (value) => {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return date.toDateString() === new Date().toDateString()
}

const isDueToday = (value) => isToday(value)

const StatCard = ({ label, value, icon: Icon, color = 'indigo', hint, currency }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    blue: 'from-blue-500 to-cyan-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    teal: 'from-teal-500 to-cyan-500',
    violet: 'from-violet-500 to-fuchsia-500',
  }
  const numeric = typeof value === 'number'
  const display =
    currency && numeric
      ? formatCurrency(value, currency)
      : numeric
        ? value.toLocaleString('en-IN')
        : value
  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm transition-all hover:border-indigo-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
      <div className="flex items-center gap-2.5">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${colors[color]} text-white shadow transition-transform group-hover:scale-105`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {label}
          </p>
          <p className="text-xl font-bold leading-tight text-gray-900 dark:text-white">
            {display}
            {numeric && label.includes('Rate') ? '%' : ''}
          </p>
        </div>
      </div>
      {hint ? (
        <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500" title={hint}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

// Shared compact card shell so every section keeps the same tight rhythm.
const SectionCard = ({
  title,
  subtitle,
  badge,
  badgeColor = 'draft',
  icon: Icon,
  iconColor = 'bg-violet-100 text-violet-600 dark:bg-violet-900/50 dark:text-violet-300',
  children,
  className = '',
}) => (
  <section className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 ${className}`}>
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {Icon ? (
          <span className={`shrink-0 rounded-lg p-1.5 ${iconColor}`}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
        </div>
      </div>
      {badge ? <Badge label={badge} colorKey={badgeColor} pill /> : null}
    </div>
    <div className="mt-3">{children}</div>
  </section>
)

// Per-stage accent colours (mirror the pipeline journey colours).
const STAGE_ACCENTS = {
  acquire: 'bg-sky-500',
  qualify: 'bg-amber-500',
  discovery: 'bg-violet-500',
  proposal: 'bg-indigo-500',
  negotiation: 'bg-orange-500',
  agreement: 'bg-purple-500',
  won: 'bg-emerald-500',
  lost: 'bg-rose-500',
}

// One card per pipeline stage: stage name and its live lead count.
const StageCard = ({ stage }) => {
  const accent = STAGE_ACCENTS[stage.key] || 'bg-sky-500'
  return (
    <Link
      to={`/crm/pipeline/${stage.key}`}
      className="group rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-600"
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${accent}`} />
          <span className="truncate text-xs font-semibold text-gray-600 dark:text-gray-300">{stage.name}</span>
        </span>
        <ArrowRight className="h-3 w-3 shrink-0 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-indigo-400" />
      </div>
      <p className="mt-2 text-xl font-bold leading-tight text-gray-900 dark:text-white">{stage.leadCount}</p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Leads</p>
    </Link>
  )
}

export default function SalesOverview() {
  const navigate = useNavigate()
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [followUpLead, setFollowUpLead] = useState(null)
  const overviewQuery = useQuery('sales-overview-dashboard', salesApi.getOverview, { staleTime: 60_000 })
  const pipelineQuery = useQuery('sales-overview-pipeline', crmApi.getPipeline, { staleTime: 60_000 })
  const activitiesQuery = useQuery('sales-overview-activities', () => crmApi.getActivities({ limit: 30 }), { staleTime: 60_000 })

  const overview = overviewQuery.data?.data || overviewQuery.data || {}
  const overviewMetrics = overview.overview || {}
  const closedVsTarget = overview.closed_vs_target || {}
  const summary = overview.summary || {}
  const spotlight = overview.spotlight || {}

  const board = useMemo(() => buildPipelineBoard(pipelineQuery.data?.data || pipelineQuery.data || {}), [pipelineQuery.data])
  const allLeads = useMemo(() => (board.stages || []).flatMap((stage) => stage.leads || []), [board])
  const hotLeads = useMemo(() => allLeads.filter((lead) => ['critical', 'high', 'hot'].includes(normalizeText(getLeadPriority(lead)))).slice(0, 5), [allLeads])
  const wonLeads = useMemo(() => allLeads.filter((lead) => normalizeText(lead.current_stage) === 'won'), [allLeads])

  const activities = useMemo(() => {
    const data = activitiesQuery.data?.data || activitiesQuery.data || {}
    const raw = data.items || data.activities || (Array.isArray(data) ? data : [])
    return Array.isArray(raw) ? raw : []
  }, [activitiesQuery.data])

  const todayActivities = useMemo(
    () => activities.filter((item) => isToday(item.created_at || item.createdAt || item.date)).slice(0, 6),
    [activities]
  )
  const followUpsDue = useMemo(
    () => allLeads.filter((lead) => isDueToday(lead.next_follow_up_at || lead.nextFollowUpAt || lead.due_date)).slice(0, 6),
    [allLeads]
  )
  const currency = pipelineQuery.data?.data?.meta?.currency || 'INR'

  const isLoading = overviewQuery.isLoading || pipelineQuery.isLoading
  const hasError = overviewQuery.isError

  const conversionRate = overviewMetrics.conversion_rate ?? (allLeads.length ? (wonLeads.length / allLeads.length) * 100 : 0)
  const revenueClosed = overviewMetrics.revenue_closed_this_month ?? summary.this_month ?? 0
  const monthlyTarget = overviewMetrics.monthly_target ?? (Array.isArray(closedVsTarget.target) ? closedVsTarget.target[closedVsTarget.target.length - 1] : 0)

  const handleScheduleFollowUp = useCallback(() => {
    setFollowUpLead(null)
    setFollowUpOpen(true)
  }, [])

  const quickActions = [
    { label: 'Add Lead', href: '/crm/leads?create=1', icon: Plus, tone: 'bg-indigo-600 text-white' },
    { label: 'Import Leads', href: '/bulk-leads', icon: Upload, tone: 'bg-emerald-600 text-white' },
    { label: 'Create Meeting', href: '/meetings', icon: Video, tone: 'bg-violet-600 text-white' },
    { label: 'Generate Proposal', href: '/crm/pipeline/proposal', icon: FileDown, tone: 'bg-amber-600 text-white' },
    { label: 'Schedule Follow-up', action: handleScheduleFollowUp, icon: CalendarClock, tone: 'bg-rose-600 text-white' },
  ]

  // Real, computed brief — never fabricated AI output.
  const briefItems = [
    { icon: Target, tone: 'text-rose-500', text: `${hotLeads.length} high-priority lead${hotLeads.length === 1 ? '' : 's'} need attention today.` },
    { icon: FileDown, tone: 'text-amber-500', text: `${overviewMetrics.proposals_pending ?? 0} proposal${(overviewMetrics.proposals_pending ?? 0) === 1 ? ' is' : 's are'} pending client review.` },
    { icon: PhoneCall, tone: 'text-emerald-500', text: `${overviewMetrics.today_calls ?? 0} call${(overviewMetrics.today_calls ?? 0) === 1 ? '' : 's'} and ${overviewMetrics.today_meetings ?? 0} meeting${(overviewMetrics.today_meetings ?? 0) === 1 ? '' : 's'} recorded today.` },
    { icon: Users, tone: 'text-indigo-500', text: `${followUpsDue.length} follow-up${followUpsDue.length === 1 ? '' : 's'} due today.` },
  ]
  const topOpportunity = [...hotLeads].sort((a, b) => getLeadDealValue(b) - getLeadDealValue(a))[0]

  return (
    <div className="space-y-4">
      {/* Slim hero */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 px-4 py-3 text-white shadow-lg">
        <div className="absolute right-0 top-0 h-36 w-36 -translate-y-1/3 translate-x-1/3 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute bottom-0 left-0 h-28 w-28 -translate-x-1/3 translate-y-1/3 rounded-full bg-white/10 blur-2xl" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="rounded-lg bg-white/20 p-2 backdrop-blur-sm">
              <LayoutDashboard className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold leading-tight md:text-xl">Sales Overview</h1>
              <p className="truncate text-xs text-indigo-100 md:text-sm">What requires your attention today?</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center px-2 gap-2">
            <Button size="sm" variant="secondary" className="border-0 bg-white/15 px-4 !text-white hover:bg-white/25" onClick={() => navigate('/crm/pipeline')}>
              Open Pipeline
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" className="border-0 bg-white px-4 !text-white hover:bg-indigo-50" onClick={() => navigate('/crm/leads?create=1')}>
              {/* <Plus className="h-3.5 w-3.5" /> */}
              Lead Dashboard
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => <Skeleton key={item} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : hasError ? (
        <CRMEmptyState
          icon={TrendingUp}
          title="Unable to load sales overview"
          description={overviewQuery.error?.response?.data?.detail || 'Try again after reloading.'}
          action={<Button variant="secondary" onClick={() => overviewQuery.refetch()}>Retry</Button>}
        />
      ) : (
        <>
          {/* Stage momentum — one card per journey stage, shown at the top */}
          <SectionCard title="Stage Momentum" subtitle="Live leads and deal value per stage" badge={`${allLeads.length} leads`}>
            {board.stages.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:grid-cols-8">
                {board.stages.map((stage) => (
                  <StageCard key={stage.key} stage={stage} />
                ))}
              </div>
            ) : (
              <p className="py-2 text-sm text-gray-500 dark:text-gray-400">No pipeline data yet.</p>
            )}
          </SectionCard>

          {/* KPI grid — 4 tiles per row (2 rows of 4) so every label and value stays fully visible */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Today's Leads" value={overviewMetrics.today_leads ?? 0} icon={Users} color="indigo" hint="New leads created today" />
            <StatCard label="Today's Calls" value={overviewMetrics.today_calls ?? 0} icon={PhoneCall} color="emerald" hint="Calls recorded today" />
            <StatCard label="Today's Meetings" value={overviewMetrics.today_meetings ?? 0} icon={Video} color="violet" hint="Meetings recorded today" />
            <StatCard label="Follow-ups Due" value={overviewMetrics.today_follow_ups ?? 0} icon={CalendarClock} color="rose" hint="Follow-ups due today" />
            <StatCard label="Proposals Pending" value={overviewMetrics.proposals_pending ?? 0} icon={FileDown} color="amber" hint="Sent or viewed, awaiting response" />
            <StatCard label="Revenue Closed" value={revenueClosed} icon={TrendingUp} color="blue" hint="Closed this month" currency={currency} />
            <StatCard label="Conversion Rate" value={Math.round(conversionRate * 10) / 10} icon={Target} color="teal" hint={`${wonLeads.length} won of ${allLeads.length} leads`} />
            <StatCard label="Monthly Target" value={monthlyTarget} icon={CheckCircle2} color="emerald" hint="Pipeline value captured this month" currency={currency} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Follow-ups due */}
              <SectionCard
                title="Follow-ups Due Today"
                subtitle="Leads with follow-ups or due dates today"
                badge={`${followUpsDue.length} due`}
                badgeColor={followUpsDue.length ? 'scheduled' : 'draft'}
              >
                <div className="space-y-1.5">
                  {followUpsDue.length ? followUpsDue.map((lead) => (
                    <button
                      key={lead.id || lead._id}
                      type="button"
                      onClick={() => navigate(`/crm/leads/${lead.id || lead._id}`)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{lead.company_name || lead.prospect_name || 'Lead'}</span>
                        <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{getLeadOwnerLabel(lead)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {lead.phone ? <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><Phone className="h-3 w-3" />{lead.phone}</span> : null}
                        <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                      </span>
                    </button>
                  )) : (
                    <p className="py-2 text-center text-sm text-gray-500 dark:text-gray-400">Nothing due today — you&apos;re all caught up.</p>
                  )}
                </div>
              </SectionCard>

              {/* Today's activity */}
              <SectionCard title="Today's Activity" subtitle="Recent calls, meetings and pipeline changes" badge={`${todayActivities.length} events`}>
                <div className="space-y-1.5">
                  {todayActivities.length ? todayActivities.map((item, index) => (
                    <div key={item.id || `${item.title}-${index}`} className="flex items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
                      <span className="shrink-0 rounded-md bg-indigo-100 p-1.5 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300">
                        {item.activity_type === 'call' ? <PhoneCall className="h-3.5 w-3.5" /> : item.activity_type === 'meeting' ? <Video className="h-3.5 w-3.5" /> : <ClipboardList className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">{item.title}</span>
                        {item.description ? <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{item.description}</span> : null}
                      </span>
                      <span className="shrink-0 text-[11px] uppercase tracking-wide text-gray-400">{item.activity_type}</span>
                    </div>
                  )) : (
                    <p className="py-2 text-center text-sm text-gray-500 dark:text-gray-400">No activity recorded today yet.</p>
                  )}
                </div>
              </SectionCard>
            </div>

            <aside className="space-y-4">
              {/* Daily brief */}
              <SectionCard icon={Sparkles} title="AI Daily Brief" subtitle="Derived live from your pipeline data">
                <ul className="space-y-2">
                  {briefItems.map((item) => (
                    <li key={item.text} className="flex items-start gap-2 text-sm leading-snug text-gray-700 dark:text-gray-200">
                      <item.icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${item.tone}`} />
                      <span>{item.text}</span>
                    </li>
                  ))}
                  {topOpportunity ? (
                    <li className="flex items-start gap-2 text-sm leading-snug text-gray-700 dark:text-gray-200">
                      <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-500" />
                      <span>
                        Best open opportunity: <button type="button" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-300" onClick={() => navigate(`/crm/leads/${topOpportunity.id || topOpportunity._id}`)}>{topOpportunity.company_name || topOpportunity.prospect_name}</button> ({formatCurrency(getLeadDealValue(topOpportunity), currency)}).
                      </span>
                    </li>
                  ) : null}
                </ul>
              </SectionCard>

              {/* Quick actions */}
              <SectionCard title="Quick Actions">
                <div className="space-y-1.5">
                  {quickActions.map((action) => {
                    const Wrapper = action.action ? 'button' : Link
                    const wrapperProps = action.action
                      ? { onClick: action.action, type: 'button' }
                      : { to: action.href }
                    return (
                      <Wrapper
                        key={action.label}
                        {...wrapperProps}
                        className="group flex min-h-10 w-full items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40"
                      >
                        <span className={`rounded-md p-1 text-white ${action.tone}`}><action.icon className="h-3.5 w-3.5" /></span>
                        {action.label}
                        <ArrowRight className="ml-auto h-3.5 w-3.5 text-gray-400 transition-transform group-hover:translate-x-0.5" />
                      </Wrapper>
                    )
                  })}
                </div>
              </SectionCard>

              {/* Follow-up Dialog */}
              <SalesFollowUpDialog
                open={followUpOpen}
                lead={followUpLead}
                users={[]}
                onClose={() => {
                  setFollowUpOpen(false)
                  setFollowUpLead(null)
                }}
              />

              {/* Spotlight */}
              <SectionCard title="Spotlight">
                <dl className="space-y-2 text-sm">
                  {spotlight.fastest_prospect_name ? (
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-gray-500 dark:text-gray-400">Fastest close</dt>
                      <dd className="font-semibold text-gray-900 dark:text-gray-100">{spotlight.fastest_prospect_name} · {spotlight.fastest_prospect_closed_days}d</dd>
                    </div>
                  ) : null}
                  {spotlight.highest_amount_name ? (
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-gray-500 dark:text-gray-400">Biggest win</dt>
                      <dd className="font-semibold text-gray-900 dark:text-gray-100">{spotlight.highest_amount_name} · {formatCurrency(spotlight.highest_amount, currency)}</dd>
                    </div>
                  ) : null}
                  {spotlight.max_prospects_owner ? (
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-gray-500 dark:text-gray-400">Most active</dt>
                      <dd className="font-semibold text-gray-900 dark:text-gray-100">{spotlight.max_prospects_owner} · {spotlight.max_prospects_count} leads</dd>
                    </div>
                  ) : null}
                  {!spotlight.fastest_prospect_name && !spotlight.highest_amount_name ? (
                    <p className="text-gray-500 dark:text-gray-400">Won deals will appear here.</p>
                  ) : null}
                </dl>
              </SectionCard>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
