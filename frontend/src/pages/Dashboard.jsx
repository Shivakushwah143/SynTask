import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowRight, CalendarDays, CheckSquare, FolderKanban, Sparkles, TrendingUp } from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { useAuthStore } from '../store/authStore'
import { dashboardAPI } from '../api/dashboard'
import { reportsAPI } from '../api/reports'
import { tasksAPI } from '../api/tasks'
import { ticketsAPI } from '../api/tickets'
import { meetingsApi } from '../api/meetings'
import { projectsApi } from '../api/projects'
import toast from 'react-hot-toast'
import AIBriefingCenter from '../components/AIBriefingCenter'
import { Badge, Button, EmptyState, PageHeader, SkeletonCard, SkeletonTable, Table } from '../components/ui'
import { ROLE, hasCompanyAdminAccess, normalizeRole } from '../utils/roles'
import { attendanceAPI } from '../api/attendance'
import { ChartTooltip } from '../components/charts/ChartTooltip'
import { ChartCard } from '../components/charts/ChartCard'
import IncomeExpenseBarChart from '../components/charts/IncomeExpenseBarChart'
import DonutLegendChart from '../components/charts/DonutLegendChart'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const Dashboard = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [recentTasks, setRecentTasks] = useState([])
  const [recentTickets, setRecentTickets] = useState([])
  const [upcomingMeetings, setUpcomingMeetings] = useState([])
  const [projects, setProjects] = useState([])
  const [exporting, setExporting] = useState(false)
  const [attendanceToday, setAttendanceToday] = useState(null)
  const [attendanceStats, setAttendanceStats] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [recent, setRecent] = useState(null)
  const [activity, setActivity] = useState([])
  const [revenueMode, setRevenueMode] = useState('Accrual')

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        setLoading(true)
        const statsData = await dashboardAPI.getStats().catch(() => null)
        const [tasksData, meetingsData, projectsData] = await Promise.all([
          tasksAPI.listTasks({ limit: 8 }),
          meetingsApi.list({ limit: 6 }),
          projectsApi.getProjects({ limit: 8 }),
        ])
        const [metricsData, recentData, activityData] = await Promise.all([
          dashboardAPI.getMetrics().catch(() => null),
          dashboardAPI.getRecent().catch(() => null),
          dashboardAPI.getActivity().catch(() => null),
        ])
        const dashboardRole = normalizeRole(statsData?.role || user?.role)

        let ticketsData = { tickets: [] }
        if (dashboardRole === ROLE.EMPLOYEE) {
          ticketsData = await ticketsAPI.listTickets({ limit: 8 })
        }

        if (!active) return
        setStats(statsData || { role: dashboardRole || 'employee' })
        setMetrics(metricsData)
        setRecent(recentData)
        setActivity(activityData?.activity || [])
        setRecentTasks(tasksData.tasks || [])
        setRecentTickets(ticketsData.tickets || [])
        setUpcomingMeetings((meetingsData?.data?.meetings || meetingsData?.meetings || []).slice(0, 6))
        setProjects((projectsData?.data?.projects || projectsData?.projects || []).slice(0, 8))

        if (dashboardRole === ROLE.EMPLOYEE) {
          try {
            const attTodayRes = await attendanceAPI.getTodayAttendance()
            if (attTodayRes && attTodayRes.data) {
              setAttendanceToday(attTodayRes.data)
            }
          } catch (e) {
            console.error(e)
          }
        } else {
          try {
            const attStatsRes = await attendanceAPI.getDashboardStats()
            if (attStatsRes && attStatsRes.data) {
              setAttendanceStats(attStatsRes.data)
            }
          } catch (e) {
            console.error(e)
          }
        }
      } catch (error) {
        console.error('Error loading dashboard:', error)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const todayLabel = useMemo(() => format(new Date(), 'EEEE, MMM d').toUpperCase(), [])

  const handleExport = async () => {
    try {
      setExporting(true)
      await reportsAPI.exportTasks('csv')
      toast.success('Tasks report exported successfully')
    } catch (error) {
      toast.error('Failed to export report')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Loading workspace overview..." />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <SkeletonCard key={item} lines={3} />)}
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <SkeletonCard lines={6} />
          <SkeletonCard lines={6} />
        </div>
        <SkeletonTable rows={5} cols={4} />
      </div>
    )
  }

  const role = normalizeRole(stats?.role || user?.role)
  const canSeeSalesWidgets = [ROLE.ADMIN, ROLE.MANAGER, ROLE.LEAD, ROLE.SUPER_ADMIN].includes(role)
  const taskSource = role === ROLE.EMPLOYEE ? recentTickets : recentTasks
  const priorityTasks = [...recentTasks].filter((task) => ['critical', 'high'].includes((task.priority || '').toLowerCase())).slice(0, 5)
  const openTasksCount = Math.max(taskSource.length - priorityTasks.length, 0)
  const dueTodayCount = metrics?.tasks_due_today ?? 0

  const dashboardCards = canSeeSalesWidgets
    ? [
        { label: 'Total Leads', value: metrics?.total_leads ?? 0 },
        { label: 'New Leads', value: metrics?.new_leads ?? 0 },
        { label: 'Qualified Leads', value: metrics?.qualified_leads ?? 0 },
        { label: 'Active Deals', value: metrics?.active_deals ?? 0 },
        { label: 'Revenue', value: metrics?.revenue ?? 0 },
        { label: 'Won Deals', value: metrics?.won_deals ?? 0 },
        { label: 'Lost Deals', value: metrics?.lost_deals ?? 0 },
        { label: 'Projects', value: metrics?.projects ?? projects.length },
        { label: 'Upcoming Meetings', value: metrics?.upcoming_meetings ?? upcomingMeetings.length },
        { label: 'Tasks Due Today', value: dueTodayCount },
      ]
    : []

  // ---- Chart datasets (replace the old static / zero-filled placeholders) ----

  // Pipeline funnel -> donut with legend + percentages, styled like "Top Expenses"
  const funnelData = canSeeSalesWidgets
    ? [
        { name: 'New Leads', value: metrics?.new_leads ?? 0 },
        { name: 'Qualified', value: metrics?.qualified_leads ?? 0 },
        { name: 'Active Deals', value: metrics?.active_deals ?? 0 },
        { name: 'Won', value: metrics?.won_deals ?? 0 },
        { name: 'Lost', value: metrics?.lost_deals ?? 0 },
      ]
    : []

  // Revenue trend -> monthly bars, current month carries the live revenue figure
  const currentMonthIndex = new Date().getMonth()
  const revenueTrend = canSeeSalesWidgets
    ? MONTH_LABELS.slice(0, currentMonthIndex + 1).map((label, i) => ({
        label,
        primary: i === currentMonthIndex ? metrics?.revenue ?? 0 : 0,
        secondary: i === currentMonthIndex ? metrics?.won_deals ?? 0 : 0,
      }))
    : []

  // Lead sources -> donut with legend + percentages
  const leadSources = canSeeSalesWidgets
    ? [
        { name: 'Organic', value: metrics?.lead_sources?.organic ?? 0 },
        { name: 'Referral', value: metrics?.lead_sources?.referral ?? 0 },
        { name: 'Outbound', value: metrics?.lead_sources?.outbound ?? 0 },
        { name: 'Paid', value: metrics?.lead_sources?.paid ?? 0 },
      ]
    : []

  const conversionData = canSeeSalesWidgets
    ? [
        { name: 'Lead', value: metrics?.total_leads ?? 0 },
        { name: 'Qualified', value: metrics?.qualified_leads ?? 0 },
        { name: 'Won', value: metrics?.won_deals ?? 0 },
      ]
    : []

  // Task overview -> donut instead of plain numbers
  const taskOverviewData = [
    { name: 'Due Today', value: dueTodayCount },
    { name: 'High Priority', value: priorityTasks.length },
    { name: 'Open', value: openTasksCount },
  ]

  const monthlyPerformance = canSeeSalesWidgets
    ? [
        { name: 'Leads', value: metrics?.new_leads ?? 0 },
        { name: 'Deals', value: metrics?.active_deals ?? 0 },
        { name: 'Projects', value: metrics?.projects ?? projects.length },
      ]
    : []

  // Team attendance snapshot -> donut instead of a plain number strip
  const attendanceBreakdown = attendanceStats
    ? [
        { name: 'Working Now', value: attendanceStats.working_now ?? 0 },
        { name: 'On Break', value: attendanceStats.on_break ?? 0 },
        { name: 'Offline', value: attendanceStats.offline ?? 0 },
      ]
    : []

  const healthColumns = [
    { key: 'name', header: 'Project' },
    { key: 'status', header: 'Status', render: (row) => <Badge label={row.status || 'active'} colorKey={row.status || 'active'} /> },
    { key: 'task_count', header: 'Tasks' },
    { key: 'delivery_date', header: 'Delivery', render: (row) => row.delivery_date ? format(new Date(row.delivery_date), 'MMM d') : '—' },
  ]

  const formatDuration = (totalSeconds) => {
    if (!totalSeconds) return '00:00'
    const hrs = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    return `${hrs}h ${mins}m`
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Command center for work, meetings, and AI briefings."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate('/projects')}>
              <FolderKanban className="h-4 w-4" />
              Projects
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate('/tasks')}>
              <CheckSquare className="h-4 w-4" />
              Tasks
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate('/calendar')}>
              <CalendarDays className="h-4 w-4" />
              Calendar
            </Button>
          </div>
        )}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Today</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-gray-100">{todayLabel}</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Quick access to work, meetings, and AI guidance.</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">High-priority tasks</p>
            <Sparkles className="h-4 w-4 text-primary-600" />
          </div>
          <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-gray-100">{priorityTasks.length}</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Critical and high-priority work in progress.</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Attendance focus</p>
            <TrendingUp className="h-4 w-4 text-primary-600" />
          </div>
          <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-gray-100">
            {role === ROLE.EMPLOYEE ? (attendanceToday?.status || 'Pending') : (attendanceStats?.present_today ?? 0)}
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {role === ROLE.EMPLOYEE ? 'Your latest attendance status.' : 'People present today.'}
          </p>
        </div>
      </section>

      {/* {canSeeSalesWidgets ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {dashboardCards.map((card) => (
            <div key={card.label} className="card p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-gray-100">{card.value}</p>
            </div>
          ))}
        </section>
      ) : null} */}

      {canSeeSalesWidgets ? (
        <section className="grid gap-6 xl:grid-cols-2">
          <IncomeExpenseBarChart
            title="Revenue and Deals"
            data={revenueTrend}
            primaryLabel="Revenue"
            secondaryLabel="Won Deals"
            primaryTotal={`₹${(metrics?.revenue ?? 0).toLocaleString('en-IN')}`}
            secondaryTotal={metrics?.won_deals ?? 0}
            toggleOptions={['Accrual', 'Cash']}
            activeToggle={revenueMode}
            onToggle={setRevenueMode}
            footnote="Revenue and deal values shown for the current fiscal year."
          />
          <DonutLegendChart title="Pipeline Funnel" data={funnelData} emptyLabel="No pipeline activity yet" />
          <DonutLegendChart title="Lead Sources" data={leadSources} emptyLabel="No lead source data yet" />
          <ChartCard title="Conversion Rate">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={conversionData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <ChartTooltip />
                  <Line type="monotone" dataKey="value" stroke="#FF8A4C" strokeWidth={3} dot={{ r: 4, fill: '#FF8A4C' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </section>
      ) : (
        <section className="card p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Role-based view</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Sales charts are hidden for this role. Operational widgets remain available below.</p>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-2">
        <DonutLegendChart title="Tasks Overview" data={taskOverviewData} emptyLabel="Nothing on your plate right now" />
        {canSeeSalesWidgets ? (
          <ChartCard title="Monthly Performance">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyPerformance} barCategoryGap="35%">
                  <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <ChartTooltip />
                  <Bar dataKey="value" fill="#2FB47C" radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        ) : (
          <ChartCard title="Monthly Performance">
            <p className="text-sm text-gray-500 dark:text-gray-400">This chart is available to sales-oriented roles only.</p>
          </ChartCard>
        )}
      </section>

      {/* Employee Attendance Widget */}
      {role === ROLE.EMPLOYEE && attendanceToday ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 bg-emerald-50/20 dark:bg-emerald-950/10 p-4 rounded-2xl border border-emerald-500/20">
          <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Attendance Status</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-base font-bold text-gray-800 dark:text-gray-250">{attendanceToday.status}</span>
              <Badge label={attendanceToday.status} colorKey={attendanceToday.status} />
            </div>
          </div>
          <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Working Hours Today</p>
            <p className="mt-2 text-2xl font-bold font-mono text-gray-800 dark:text-gray-250">
              {formatDuration(attendanceToday.total_working_hours)}
            </p>
          </div>
          <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Camera Status</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Permission</span>
              <Badge
                label={attendanceToday.camera_permission_status || 'Denied'}
                colorKey={attendanceToday.camera_permission_status === 'Connected' || attendanceToday.camera_permission_status === 'Granted' ? 'completed' : 'rejected'}
              />
            </div>
          </div>
          <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Screen Share</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</span>
              <Badge
                label={attendanceToday.screen_sharing_status || 'Denied'}
                colorKey={attendanceToday.screen_sharing_status === 'Sharing' || attendanceToday.screen_sharing_status === 'Granted' ? 'completed' : 'rejected'}
              />
            </div>
          </div>
        </section>
      ) : null}

      {/* Managers Attendance Dashboard */}
      {role !== ROLE.EMPLOYEE && attendanceStats ? (
        <section className="bg-primary-50/20 dark:bg-primary-950/10 p-5 rounded-2xl border border-primary-500/20 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-primary-800 dark:text-primary-300 uppercase tracking-wider flex items-center">
              <span className="relative flex h-2 w-2 mr-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-450 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
              </span>
              Workplace Attendance & Monitoring
            </h3>
            <Button variant="ghost" size="sm" onClick={() => navigate('/live-monitor')} className="text-primary-700 dark:text-primary-300">
              Live Monitor Board <ArrowRight className="h-4 w-4 ml-1 inline" />
            </Button>
          </div>
          <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
            <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-850 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase">Total Employees</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-150">{attendanceStats.total_employees}</p>
              <p className="mt-1 text-xs text-gray-400">{attendanceStats.present_today} present today</p>
            </div>
            <DonutLegendChart title="Live Status Breakdown" data={attendanceBreakdown} emptyLabel="No activity yet today" />
          </div>
        </section>
      ) : null}

      <AIBriefingCenter user={user} stats={stats} recentTasks={recentTasks} recentTickets={recentTickets} />

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Today&apos;s work</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">High-signal items that need attention now.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate(role === ROLE.EMPLOYEE ? '/tickets' : '/tasks')}>
              View all
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {taskSource.length ? taskSource.slice(0, 6).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(role === ROLE.EMPLOYEE ? '/tickets' : '/tasks')}
                className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{item.title}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {role === ROLE.EMPLOYEE ? `Created ${item.created_at ? format(new Date(item.created_at), 'MMM d') : 'recently'}` : item.due_date ? `Due ${format(new Date(item.due_date), 'MMM d')}` : 'No due date'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge label={item.status?.replace(/_/g, ' ') || 'open'} colorKey={item.status || 'open'} />
                  {item.priority ? <Badge label={item.priority} colorKey={item.priority} /> : null}
                </div>
              </button>
            )) : (
              <EmptyState title="No work in view" description="No tasks or requests need your attention right now." />
            )}
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Upcoming meetings</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Scheduled coordination and client calls.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/meetings')}>
              Open
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {upcomingMeetings.length ? upcomingMeetings.map((meeting) => (
              <div key={meeting.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{meeting.title}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {meeting.meeting_date ? format(new Date(meeting.meeting_date), 'MMM d, h:mm a') : 'Date not set'}
                </p>
                {meeting.status ? <div className="mt-2"><Badge label={meeting.status} colorKey={meeting.status} /></div> : null}
              </div>
            )) : <EmptyState title="No meetings" description="Create the next meeting from the meetings workspace." />}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Project health</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Current projects in the workspace.</p>
            </div>
            {hasCompanyAdminAccess(role) ? (
              <Button variant="secondary" size="sm" onClick={handleExport} loading={exporting}>
                Export
              </Button>
            ) : null}
          </div>
          {projects.length ? <Table columns={healthColumns} data={projects} /> : <EmptyState title="No projects" description="Projects will appear here once they are created." />}
        </div>
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Recent activity</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Latest changes across your workspace.</p>
          <div className="mt-4 space-y-3">
            {(role === ROLE.EMPLOYEE ? recentTickets : recentTasks).slice(0, 5).map((item) => (
              <div key={item.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.title}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {item.updated_at ? format(new Date(item.updated_at), 'MMM d, h:mm a') : item.created_at ? format(new Date(item.created_at), 'MMM d, h:mm a') : 'Recently'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Recent Leads / Deals / Projects</h2>
          <div className="mt-4 space-y-3">
            {(recent?.projects || []).slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.name}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.created_at ? format(new Date(item.created_at), 'MMM d, h:mm a') : 'Recently'}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Notifications</h2>
          <div className="mt-4 space-y-3">
            {activity.slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.title}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.message}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

export default Dashboard
