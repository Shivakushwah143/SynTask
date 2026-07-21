import { useQuery } from 'react-query'
import { Activity, ArrowRight, Briefcase, CalendarDays, CalendarRange, CheckCircle2, ClipboardList, Clock3, DollarSign, FileCheck2, GitBranch, HeartHandshake, LineChart, Receipt, TimerReset, TrendingUp, UserCheck, UserRoundSearch, Users, Zap, Target, Award, PieChart as PieChartIcon, BarChart3, Sparkles, Rocket, TrendingDown } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend } from 'recharts'
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
import { formatCurrency } from '../pipeline/utils'

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

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#06b6d4', '#8b5cf6']

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
  const hasDashboardError = dashboardQuery.isError || activityQuery.isError || meetingsQuery.isError
  const workflowShortcuts = BUSINESS_WORKFLOW_STEPS.filter((step) => (
    (!step.roles || step.roles.includes(userRole)) &&
    canAccessOwner(step, user, isSuperAdminRole(userRole))
  ))

  // Calculate some metrics for the overview cards
  const totalLeads = stats.prospect_count ?? 0
  const pipelineValue = stats.pipeline_value ?? 0
  const thisMonthRevenue = stats.this_month ?? 0
  const lastMonthRevenue = stats.last_month ?? 0
  const monthOverMonth = lastMonthRevenue > 0 ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(1) : '0'
  const winRate = kpis.win_rate ?? 0
  const totalDeals = kpis.total_deals ?? 0
  const wonDeals = kpis.won_deals ?? 0
  const avgDealSize = kpis.average_deal_size ?? 0

  return (
    <CRMPage>
      <section className="relative mb-8 overflow-hidden rounded-[28px] border border-primary-200/70 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-[0_18px_60px_rgba(15,23,42,0.06)] md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-100">CRM</p>
            <h1 className="mt-2 text-2xl font-semibold md:text-3xl">CRM Dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-indigo-100">Welcome back, {user?.first_name || 'User'}! Here's your sales performance overview.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/crm/pipeline" className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30">
              <TrendingUp className="h-4 w-4" />
              View Pipeline
            </Link>
            <Link to="/crm/leads" className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20">
              <Users className="h-4 w-4" />
              Manage Leads
            </Link>
          </div>
        </div>
      </section>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <CRMStatCard icon={Users} label="Leads" value={loading ? '...' : totalLeads} helper="Active prospects" tone="blue" />
        <CRMStatCard icon={DollarSign} label="Pipeline Value" value={loading ? '...' : formatCurrency(pipelineValue, currency)} helper="Total pipeline" tone="emerald" />
        <CRMStatCard icon={TrendingUp} label="This Month" value={loading ? '...' : formatCurrency(thisMonthRevenue, currency)} helper={`${Number(monthOverMonth) >= 0 ? '↑' : '↓'} ${Math.abs(Number(monthOverMonth))}% from last month`} tone="blue" />
        <CRMStatCard icon={Target} label="Win Rate" value={loading ? '...' : `${winRate}%`} helper={`${wonDeals} won out of ${totalDeals} deals`} tone="amber" />
        <CRMStatCard icon={Award} label="Avg Deal Size" value={loading ? '...' : formatCurrency(avgDealSize, currency)} helper="Average value" tone="slate" />
        <CRMStatCard icon={ClipboardList} label="Deals" value={loading ? '...' : totalDeals} helper="Total deals" tone="emerald" />
      </div>

      <div className="mb-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {workflowShortcuts.slice(0, 4).map((step, index) => {
            const Icon = workflowIcons[step.key] || CheckCircle2
            const palette = [
              'border-indigo-200 bg-indigo-50/70 text-indigo-600 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-300',
              'border-violet-200 bg-violet-50/70 text-violet-600 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300',
              'border-fuchsia-200 bg-fuchsia-50/70 text-fuchsia-600 dark:border-fuchsia-900/50 dark:bg-fuchsia-950/30 dark:text-fuchsia-300',
              'border-sky-200 bg-sky-50/70 text-sky-600 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300',
            ]
            return (
              <Link
                key={step.key}
                to={step.href}
                className="group relative overflow-hidden rounded-[22px] border border-primary-200/70 bg-white/90 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-[#5a4635] dark:bg-[rgb(29_24_19_/_0.88)]"
              >
                <div className="relative z-10 flex items-start gap-3">
                  <div className={`rounded-2xl border p-2.5 ${palette[index % palette.length]}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{step.label}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Step {index + 1}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 transition group-hover:translate-x-1 group-hover:text-primary-600" />
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Charts Section - 3 columns */}
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Revenue vs Target</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Monthly performance tracking</p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
              12 Months
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueTrend} margin={{ left: -20, right: 10, top: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="crmClosedFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="crmTargetFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.1} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(value) => compactCurrency(value, currency)} />
                <ChartTooltip valueFormatter={(value) => formatCurrency(value, currency)} />
                <Area type="monotone" dataKey="target" name="Target" stroke="#10b981" strokeWidth={2} fill="url(#crmTargetFill)" activeDot={{ r: 4, fill: '#10b981' }} />
                <Area type="monotone" dataKey="closed" name="Closed" stroke="#6366f1" strokeWidth={2.5} fill="url(#crmClosedFill)" activeDot={{ r: 5, fill: '#6366f1' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pipeline Stage Value */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Pipeline Value</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">By stage</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              {stageGraph.length} stages
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageGraph} barCategoryGap="25%" margin={{ left: -20, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.1} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: '#94a3b8' }} tickFormatter={(value) => compactCurrency(value, currency)} />
                <ChartTooltip valueFormatter={(value) => formatCurrency(value, currency)} />
                <Bar dataKey="value" name="Value" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Middle Section - 2 columns */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {/* Revenue by Client */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Top Clients</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Revenue by client</p>
            </div>
            <Users className="h-5 w-5 text-gray-400" />
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : clientRevenue.length ? (
            <div className="space-y-2">
              {clientRevenue.slice(0, 5).map((row, index) => (
                <div key={row.client} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-700/50">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
                      {row.client?.charAt(0) || '?'}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{row.client}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(row.revenue || 0, currency)}</span>
                </div>
              ))}
            </div>
          ) : (
            <CRMEmptyState icon={Users} title="No client revenue yet" description="Won deals will appear here." />
          )}
        </div>

        {/* Stage Conversion */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Stage Conversion</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Conversion between stages</p>
            </div>
            <PieChart className="h-5 w-5 text-gray-400" />
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : stageConversion.length ? (
            <div className="space-y-2">
              {stageConversion.slice(0, 5).map((item, index) => (
                <div key={`${item.from}-${item.to}`} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-700/50">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full bg-${COLORS[index % COLORS.length]}`}></div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{item.from} → {item.to}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600">
                      <div className={`h-full rounded-full bg-${COLORS[index % COLORS.length]}`} style={{ width: `${item.conversion_percent}%` }}></div>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{item.conversion_percent}%</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <CRMEmptyState icon={LineChart} title="No conversion data yet" description="Stage movement data will appear as deals progress." />
          )}
        </div>
      </div>

      {/* Leaderboards and Pipeline Summary */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {/* Leaderboards */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Top Performers</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Sales leaderboard</p>
            </div>
            <Award className="h-5 w-5 text-gray-400" />
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : leaderboards.length ? (
            <div className="space-y-3">
              {leaderboards.slice(0, 4).map((row, index) => (
                <div key={row.salesperson} className="flex items-center justify-between rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${index === 0 ? 'bg-amber-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-orange-600' : 'bg-indigo-600'}`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{row.salesperson}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{row.deals_closed || 0} deals · {row.win_rate || 0}% win rate</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(row.revenue || 0, currency)}</span>
                </div>
              ))}
            </div>
          ) : (
            <CRMEmptyState icon={LineChart} title="No leaderboard data" description="Closed deals will populate this list." />
          )}
        </div>

        {/* Pipeline Summary */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Pipeline Breakdown</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Stage distribution</p>
            </div>
            <BarChart3 className="h-5 w-5 text-gray-400" />
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : stageBreakdown.length ? (
            <div className="space-y-2">
              {stageBreakdown.slice(0, 6).map((stage, index) => (
                <div key={stage.stage} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-700/50">
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full bg-${COLORS[index % COLORS.length]}`}></div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{stage.stage}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{stage.count} deals</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(stage.value || 0, currency)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <CRMEmptyState icon={TrendingUp} title="No pipeline activity yet" description="Add leads to populate the CRM pipeline summary." />
          )}
        </div>
      </div>

      {/* Bottom Section - Activities and Meetings */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's Activities */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Today's Activity</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Recent timeline events</p>
            </div>
            <Activity className="h-5 w-5 text-gray-400" />
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : todayActivities.length ? (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {todayActivities.slice(0, 5).map((activity) => (
                <div key={`${activity.entity_type}-${activity.id}`} className="flex items-start gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                  <div className="mt-1 rounded-lg bg-indigo-100 p-2 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                    <Activity className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{activity.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{activity.user_name || 'System'} · {formatDateTime(activity.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <CRMEmptyState icon={Activity} title="No activity today" description="The existing activity timeline has nothing new for today." />
          )}
        </div>

        {/* Upcoming Meetings */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Upcoming Meetings</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Scheduled appointments</p>
            </div>
            <CalendarDays className="h-5 w-5 text-gray-400" />
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : upcomingMeetings.length ? (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {upcomingMeetings.map((meeting) => (
                <div key={meeting.id} className="flex items-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                  <div className="flex min-w-[50px] flex-col items-center rounded-lg bg-indigo-50 px-3 py-2 dark:bg-indigo-900/30">
                    <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                      {format(new Date(meeting.meeting_date), 'd')}
                    </span>
                    <span className="text-xs text-indigo-500 dark:text-indigo-300">
                      {format(new Date(meeting.meeting_date), 'MMM')}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{meeting.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{format(new Date(meeting.meeting_date), 'h:mm a')}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <CRMEmptyState icon={CalendarDays} title="No upcoming meetings" description="Use the existing meetings module to schedule the next client touchpoint." />
          )}
        </div>
      </div>
    </CRMPage>
  )
}