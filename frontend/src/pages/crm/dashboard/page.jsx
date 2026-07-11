import { useQuery } from 'react-query'
import { Activity, ArrowRight, CalendarDays, Clock3, LineChart, TrendingUp, Users } from 'lucide-react'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import { activityAPI } from '../../../api/activity'
import { crmApi } from '../../../api/crm'
import { meetingsApi } from '../../../api/meetings'
import { CRMEmptyState, CRMPage, CRMSection, CRMStatCard } from '../../../components/crm'
import { Skeleton } from '../../../components/ui'
import { WorkflowGuide } from '../../../components/workflow/WorkflowGuide'

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

export default function CRMDashboardPage() {
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
