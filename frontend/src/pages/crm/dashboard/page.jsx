import { useQuery } from 'react-query'
<<<<<<< HEAD
import { Activity, ArrowRight, Briefcase, CalendarDays, CalendarRange, CheckCircle2, ClipboardList, Clock3, DollarSign, FileCheck2, GitBranch, HeartHandshake, LineChart, Receipt, TimerReset, TrendingUp, UserCheck, UserRoundSearch, Users } from 'lucide-react'
=======
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { Activity, ArrowRight, CalendarDays, Clock3, LineChart, TrendingUp, Users } from 'lucide-react'
>>>>>>> 58e94b3954491d1c231e25872ffc2e68ac57afff
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import { activityAPI } from '../../../api/activity'
import { crmApi } from '../../../api/crm'
import { meetingsApi } from '../../../api/meetings'
import { CRMEmptyState, CRMPage, CRMSection, CRMStatCard } from '../../../components/crm'
import { ChartTooltip } from '../../../components/charts/ChartTooltip'
import { Skeleton } from '../../../components/ui'
import { WorkflowGuide } from '../../../components/workflow/WorkflowGuide'
import { BUSINESS_WORKFLOW_STEPS } from '../../../config/businessWorkflow'
import { canAccessOwner } from '../../../config/domainOwnership'
import { useAuthStore } from '../../../store/authStore'
import { isSuperAdminRole, normalizeRole } from '../../../utils/roles'

const workflowIcons = {
  lead: UserRoundSearch,
  qualification: GitBranch,
  'follow-up': CalendarDays,
  meeting: CalendarRange,
  proposal: FileCheck2,
  negotiation: HeartHandshake,
  won: UserCheck,
  client: Briefcase,
  project: Briefcase,
  tasks: ClipboardList,
  execution: TimerReset,
  invoice: Receipt,
  payment: DollarSign,
  reports: LineChart,
}

const formatCurrency = (value, currency = 'INR') => {
  const numericValue = Number(value || 0)
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(numericValue)
  } catch {
    return `Rs ${numericValue.toLocaleString('en-IN')}`
  }
}

const formatDateTime = (value) => {
  if (!value) return 'Scheduled soon'
  try {
    return format(new Date(value), 'MMM d, h:mm a')
  } catch {
    return String(value)
  }
}

const isSameDay = (dateA, dateB) =>
  dateA.getFullYear() === dateB.getFullYear() &&
  dateA.getMonth() === dateB.getMonth() &&
  dateA.getDate() === dateB.getDate()

const buildRevenueTrend = (closedVsTarget = {}) => {
  const months = Array.isArray(closedVsTarget.months) ? closedVsTarget.months : []
  const closed = Array.isArray(closedVsTarget.closed) ? closedVsTarget.closed : []
  const target = Array.isArray(closedVsTarget.target) ? closedVsTarget.target : []
  const length = Math.max(months.length, closed.length, target.length, 6)
  return Array.from({ length }, (_, index) => ({
    name: months[index] || `M${index + 1}`,
    closed: Number(closed[index] || 0),
    target: Number(target[index] || 0),
  })).slice(-12)
}

const buildStageGraph = (stages = []) => (
  stages.length
    ? stages.slice(0, 8).map((stage) => ({
      name: stage.stage || 'Stage',
      count: Number(stage.count || 0),
      value: Number(stage.value || 0),
    }))
    : [{ name: 'No data', count: 0, value: 0 }]
)

const compactCurrency = (value, currency = 'INR') => {
  const numericValue = Number(value || 0)
  const divisor = numericValue >= 10000000 ? 10000000 : numericValue >= 100000 ? 100000 : 1000
  const suffix = divisor === 10000000 ? 'Cr' : divisor === 100000 ? 'L' : 'K'
  if (numericValue < 1000) return formatCurrency(numericValue, currency)
  return `${formatCurrency(numericValue / divisor, currency)}${suffix}`
}

export default function CRMDashboardPage() {
  const { user } = useAuthStore()
  const userRole = normalizeRole(user?.role)
  const dashboardQuery = useQuery('crm-dashboard', crmApi.getDashboard)
  const activityQuery = useQuery('crm-activity-timeline', () => activityAPI.getTimeline({ days: 14, limit: 20 }))
  const meetingsQuery = useQuery('crm-upcoming-meetings', () => meetingsApi.list({ limit: 20 }))

  const dashboard = dashboardQuery.data || {}
  const activities = Array.isArray(activityQuery.data?.activities) ? activityQuery.data.activities : []
  const meetings = Array.isArray(meetingsQuery.data?.meetings) ? meetingsQuery.data.meetings : []

  const currency = dashboard?.sales?.meta?.currency || 'INR'
  const stats = dashboard?.sales?.summary || {}
  const analytics = dashboard?.analytics || {}
  const revenue = analytics?.revenue || {}
  const kpis = analytics?.kpis || {}
  const leaderboards = Array.isArray(analytics?.leaderboards) ? analytics.leaderboards : []
  const pipelineAnalytics = analytics?.pipeline || {}
  const clientRevenue = Array.isArray(analytics?.analytics?.revenue_by_client) ? analytics.analytics.revenue_by_client : []
  const stageConversion = Array.isArray(kpis?.stage_conversion) ? kpis.stage_conversion : []
  const closedVsTarget = dashboard?.sales?.closed_vs_target || {}
  const revenueTrend = buildRevenueTrend(closedVsTarget)
  const stageGraph = buildStageGraph(Array.isArray(pipelineAnalytics.deals_by_stage) ? pipelineAnalytics.deals_by_stage : [])

  const today = new Date()
  const todayActivities = activities.filter((item) => {
    if (!item?.timestamp) return false
    const timestamp = new Date(item.timestamp)
    return !Number.isNaN(timestamp.getTime()) && isSameDay(timestamp, today)
  })

  const upcomingMeetings = meetings
    .filter((meeting) => {
      if (!meeting?.meeting_date) return false
      const meetingDate = new Date(meeting.meeting_date)
      return !Number.isNaN(meetingDate.getTime()) && meetingDate >= today
    })
    .sort((left, right) => new Date(left.meeting_date) - new Date(right.meeting_date))
    .slice(0, 5)

  const stageBreakdown = dashboard?.sales?.pipeline?.stage_breakdown || []
  const loading = dashboardQuery.isLoading || activityQuery.isLoading || meetingsQuery.isLoading
  const workflowShortcuts = BUSINESS_WORKFLOW_STEPS.filter((step) => (
    (!step.roles || step.roles.includes(userRole)) &&
    canAccessOwner(step, user, isSuperAdminRole(userRole))
  ))

  return (
    <CRMPage>
      <WorkflowGuide
        title="Open the next sales action"
        description="This CRM dashboard is the control point for the next lead, the next meeting, and the next piece of revenue."
        nextStep="Review the pipeline, then open the lead or activity that needs attention."
        primaryAction={{ label: 'View Pipeline', href: '/crm/pipeline' }}
        secondaryAction={{ label: 'Open Leads', href: '/crm/leads' }}
        bullets={[
          { label: 'Where am I?', value: 'CRM dashboard and pipeline overview.' },
          { label: 'What next?', value: 'Pick the lead or deal that needs movement.' },
          { label: 'After this?', value: 'Jump into the lead workspace or CRM reports.' },
        ]}
      />
      <CRMSection
        title="Workflow Shortcuts"
        description="One-click movement through the business flow. These are shortcuts into existing CRM, project, task, and finance pages."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {workflowShortcuts.map((step, index) => {
            const Icon = workflowIcons[step.key] || CheckCircle2
            return (
              <Link
                key={step.key}
                to={step.href}
                className="group flex min-h-16 items-center justify-between rounded-lg border border-surface-border/80 bg-white px-3 py-3 text-left transition hover:border-primary-300 hover:bg-primary-50/70 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-primary-700 dark:hover:bg-primary-950/30"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700 transition group-hover:bg-primary-100 group-hover:text-primary-700 dark:bg-gray-900 dark:text-gray-200 dark:group-hover:bg-primary-900/50 dark:group-hover:text-primary-200">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{step.label}</span>
                    <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">Step {index + 1}</span>
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-primary-600" />
              </Link>
            )
          })}
        </div>
      </CRMSection>
      <CRMSection
        title="Overview"
        description="Sales-derived signal for the CRM workspace foundation."
        actions={
          <>
            <Link className="btn btn-secondary" to="/crm/contacts">
              Open Contacts
            </Link>
            <Link className="btn btn-primary" to="/crm/pipeline">
              View Pipeline
            </Link>
          </>
        }
      >
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="rounded-2xl border border-surface-border/80 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/60">
                <Skeleton className="h-5 w-10" />
                <Skeleton className="mt-3 h-8 w-32" />
                <Skeleton className="mt-3 h-4 w-40" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <CRMStatCard
              icon={Users}
              label="Leads"
              value={stats.prospect_count ?? 0}
              helper="Live count from the sales domain."
              tone="blue"
            />
            <CRMStatCard
              icon={TrendingUp}
              label="Pipeline Value"
              value={formatCurrency(stats.pipeline_value ?? 0, currency)}
              helper="Active lead value only."
              tone="emerald"
            />
            <CRMStatCard
              icon={CalendarDays}
              label="This Month"
              value={formatCurrency(stats.this_month ?? 0, currency)}
              helper="Closed business this month."
              tone="amber"
            />
            <CRMStatCard
              icon={Clock3}
              label="Last Month"
              value={formatCurrency(stats.last_month ?? 0, currency)}
              helper="Closed business last month."
              tone="slate"
            />
          </div>
        )}
      </CRMSection>

      <CRMSection title="Sales Analytics" description="Revenue, KPI and pipeline intelligence from CRM deals and proposals.">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="rounded-2xl border border-surface-border/80 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/60">
                <Skeleton className="h-5 w-10" />
                <Skeleton className="mt-3 h-8 w-32" />
                <Skeleton className="mt-3 h-4 w-40" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
              <div className="rounded-2xl border border-surface-border/80 bg-white/90 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/80">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Closed vs Target</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Monthly revenue movement from live CRM data.</p>
                  </div>
                  <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-950/60 dark:text-primary-200">
                    12 months
                  </span>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueTrend} margin={{ left: -18, right: 10, top: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="crmClosedFill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#2563eb" stopOpacity={0.22} />
                          <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="crmTargetFill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.18} />
                          <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.16} />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(value) => compactCurrency(value, currency)} />
                      <ChartTooltip valueFormatter={(value) => formatCurrency(value, currency)} />
                      <Area type="monotone" dataKey="target" name="Target" stroke="#14b8a6" strokeWidth={2.5} fill="url(#crmTargetFill)" activeDot={{ r: 5, fill: '#14b8a6' }} />
                      <Area type="monotone" dataKey="closed" name="Closed" stroke="#2563eb" strokeWidth={3} fill="url(#crmClosedFill)" activeDot={{ r: 6, fill: '#2563eb' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-surface-border/80 bg-white/90 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/80">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pipeline Stage Value</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Deal count and value by active stage.</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200">
                    {stageGraph.length} stages
                  </span>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stageGraph} barCategoryGap="30%" margin={{ left: -18, right: 8, top: 8, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.16} />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <YAxis yAxisId="left" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(value) => compactCurrency(value, currency)} />
                      <ChartTooltip valueFormatter={(value, key) => key === 'value' ? formatCurrency(value, currency) : value} />
                      <Bar yAxisId="left" dataKey="count" name="Deals" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={36} />
                      <Bar yAxisId="right" dataKey="value" name="Value" fill="#38bdf8" radius={[6, 6, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <CRMStatCard icon={TrendingUp} label="Total Revenue" value={formatCurrency(revenue.total_revenue ?? 0, currency)} tone="blue" />
              <CRMStatCard icon={TrendingUp} label="Monthly Revenue" value={formatCurrency(revenue.monthly_revenue ?? 0, currency)} tone="emerald" />
              <CRMStatCard icon={TrendingUp} label="Forecast Revenue" value={formatCurrency(revenue.forecast_revenue ?? 0, currency)} tone="amber" />
              <CRMStatCard icon={TrendingUp} label="Weighted Pipeline" value={formatCurrency(revenue.weighted_pipeline_value ?? 0, currency)} tone="slate" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <CRMStatCard icon={LineChart} label="Total Deals" value={String(kpis.total_deals ?? 0)} tone="blue" />
              <CRMStatCard icon={LineChart} label="Won Deals" value={String(kpis.won_deals ?? 0)} tone="emerald" />
              <CRMStatCard icon={LineChart} label="Win Rate" value={`${kpis.win_rate ?? 0}%`} tone="amber" />
              <CRMStatCard icon={LineChart} label="Avg Deal Size" value={formatCurrency(kpis.average_deal_size ?? 0, currency)} tone="slate" />
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <CRMSection title="Pipeline Analytics" description="Value, stuck deals, and closing pressure.">
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-300">Pipeline Value: {formatCurrency(pipelineAnalytics.pipeline_value ?? 0, currency)}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">Stuck Deals: {pipelineAnalytics.stuck_deals ?? 0}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">Expected Close This Month: {pipelineAnalytics.expected_close_this_month ?? 0}</p>
                  <div className="space-y-2">
                    {(Array.isArray(pipelineAnalytics.deals_by_stage) ? pipelineAnalytics.deals_by_stage : []).map((stage) => (
                      <div key={stage.stage} className="flex items-center justify-between rounded-xl border border-surface-border/80 p-3">
                        <span className="text-sm font-medium">{stage.stage}</span>
                        <span className="text-xs text-gray-500">{stage.count} · {formatCurrency(stage.value || 0, currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CRMSection>
              <CRMSection title="Leaderboards" description="Salesperson performance from closed deals.">
                <div className="space-y-2">
                  {leaderboards.length ? leaderboards.map((row) => (
                    <article key={row.salesperson} className="rounded-xl border border-surface-border/80 p-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.salesperson}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Revenue {formatCurrency(row.revenue || 0, currency)} · Wins {row.deals_closed || 0} · Win Rate {row.win_rate || 0}%
                      </p>
                    </article>
                  )) : (
                    <CRMEmptyState icon={LineChart} title="No leaderboard data" description="Closed deals will populate this list." />
                  )}
                </div>
              </CRMSection>
            </div>
            <CRMSection title="Revenue by Client" description="Closed revenue by client.">
              <div className="space-y-2">
                {clientRevenue.length ? clientRevenue.map((row) => (
                  <div key={row.client} className="flex items-center justify-between rounded-xl border border-surface-border/80 p-3">
                    <span className="text-sm">{row.client}</span>
                    <span className="text-xs text-gray-500">{formatCurrency(row.revenue || 0, currency)}</span>
                  </div>
                )) : (
                  <CRMEmptyState icon={Users} title="No client revenue yet" description="Won deals will appear here." />
                )}
              </div>
            </CRMSection>
            <CRMSection title="Stage Conversion" description="Conversion percentage between pipeline stages.">
              <div className="space-y-2">
                {stageConversion.length ? stageConversion.map((item) => (
                  <div key={`${item.from}-${item.to}`} className="flex items-center justify-between rounded-xl border border-surface-border/80 p-3">
                    <span className="text-sm">{item.from} → {item.to}</span>
                    <span className="text-xs text-gray-500">{item.conversion_percent}%</span>
                  </div>
                )) : (
                  <CRMEmptyState icon={LineChart} title="No conversion data yet" description="Stage movement data will appear as deals progress." />
                )}
              </div>
            </CRMSection>
          </div>
        )}
      </CRMSection>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <CRMSection title="Pipeline Summary" description="Stage mix derived from existing sales data.">
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="rounded-2xl border border-surface-border/80 p-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-3 h-8 w-16" />
                  <Skeleton className="mt-2 h-4 w-28" />
                </div>
              ))}
            </div>
          ) : stageBreakdown.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {stageBreakdown.map((stage) => (
                <article
                  key={stage.stage}
                  className="rounded-2xl border border-surface-border/80 bg-gradient-to-br from-slate-50 to-white p-4 dark:border-gray-800 dark:from-gray-900 dark:to-gray-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Stage</p>
                      <h3 className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">
                        {stage.stage}
                      </h3>
                    </div>
                    <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-950/60 dark:text-primary-200">
                      {stage.count}
                    </span>
                  </div>
                  <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                    Value: {formatCurrency(stage.value || 0, currency)}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <CRMEmptyState
              icon={TrendingUp}
              title="No pipeline activity yet"
              description="Add leads to populate the CRM pipeline summary."
            />
          )}
        </CRMSection>

        <CRMSection title="Quick Actions" description="Fast paths into the workspace while later phases are built.">
          <div className="grid gap-3">
            <Link className="btn btn-primary justify-between" to="/crm/contacts">
              <span>Open Contacts</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link className="btn btn-secondary justify-between" to="/crm/activities">
              <span>Review Activities</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link className="btn btn-secondary justify-between" to="/crm/calendar">
              <span>Check Calendar</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link className="btn btn-secondary justify-between" to="/sales/contacts">
              <span>Legacy Sales Contacts</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </CRMSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <CRMSection title="Today's Activities" description="Current-day activity from the shared timeline.">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="rounded-2xl border border-surface-border/80 p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-2 h-4 w-24" />
                </div>
              ))}
            </div>
          ) : todayActivities.length ? (
            <div className="space-y-3">
              {todayActivities.map((activity) => (
                <article
                  key={`${activity.entity_type}-${activity.id}`}
                  className="rounded-2xl border border-surface-border/80 p-4 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-2xl bg-primary-50 p-2 text-primary-600 dark:bg-primary-950/60 dark:text-primary-300">
                      <Activity className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {activity.title}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {activity.user_name || 'System'} | {formatDateTime(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <CRMEmptyState
              icon={Activity}
              title="No activity today"
              description="The existing activity timeline has nothing new for today."
            />
          )}
        </CRMSection>

        <CRMSection title="Upcoming Meetings" description="Data from the existing meetings API.">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="rounded-2xl border border-surface-border/80 p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-2 h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : upcomingMeetings.length ? (
            <div className="space-y-3">
              {upcomingMeetings.map((meeting) => (
                <article
                  key={meeting.id}
                  className="rounded-2xl border border-surface-border/80 p-4 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60"
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {meeting.title}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {formatDateTime(meeting.meeting_date)}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <CRMEmptyState
              icon={CalendarDays}
              title="No upcoming meetings"
              description="Use the existing meetings module to schedule the next client touchpoint."
            />
          )}
        </CRMSection>
      </div>
    </CRMPage>
  )
}
