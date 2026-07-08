import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowRight, CalendarDays, CheckSquare, FolderKanban, MessageSquareText, Sparkles, TrendingUp } from 'lucide-react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
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

        // Load attendance metrics
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

  const todayLabel = useMemo(
    () => format(new Date(), 'EEEE, MMM d').toUpperCase(),
    [],
  )

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
  const taskSource = recentTasks
  const priorityTasks = [...recentTasks].filter((task) => ['critical', 'high'].includes((task.priority || '').toLowerCase())).slice(0, 5)
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
        { label: 'Tasks Due Today', value: metrics?.tasks_due_today ?? 0 },
      ]
    : [
        { label: 'Projects', value: projects.length },
        { label: 'Upcoming Meetings', value: upcomingMeetings.length },
        { label: 'Tasks Due Today', value: metrics?.tasks_due_today ?? taskSource.length },
        { label: 'High Priority Tasks', value: priorityTasks.length },
      ]
  const funnelData = canSeeSalesWidgets
    ? [
        { name: 'New Leads', value: metrics?.new_leads ?? 0, color: '#3b82f6' },
        { name: 'Qualified', value: metrics?.qualified_leads ?? 0, color: '#22c55e' },
        { name: 'Active Deals', value: metrics?.active_deals ?? 0, color: '#f59e0b' },
        { name: 'Won', value: metrics?.won_deals ?? 0, color: '#10b981' },
        { name: 'Lost', value: metrics?.lost_deals ?? 0, color: '#ef4444' },
      ]
    : []
  const revenueTrend = canSeeSalesWidgets
    ? [
        { month: 'Jan', revenue: 0 },
        { month: 'Feb', revenue: 0 },
        { month: 'Mar', revenue: 0 },
        { month: 'Apr', revenue: 0 },
        { month: 'May', revenue: 0 },
        { month: 'Jun', revenue: metrics?.revenue ?? 0 },
      ]
    : []
  const leadSources = canSeeSalesWidgets
    ? [
        { name: 'Organic', value: 0 },
        { name: 'Referral', value: 0 },
        { name: 'Outbound', value: 0 },
        { name: 'Paid', value: 0 },
      ]
    : []
  const conversionData = canSeeSalesWidgets
    ? [
        { name: 'Lead', value: metrics?.total_leads ?? 0 },
        { name: 'Qualified', value: metrics?.qualified_leads ?? 0 },
        { name: 'Won', value: metrics?.won_deals ?? 0 },
      ]
    : []
  const taskOverview = [
    { name: 'Due Today', value: metrics?.tasks_due_today ?? 0 },
    { name: 'High Priority', value: priorityTasks.length },
    { name: 'Open', value: taskSource.length },
  ]
  const monthlyPerformance = canSeeSalesWidgets
    ? [
        { name: 'Leads', value: metrics?.new_leads ?? 0 },
        { name: 'Deals', value: metrics?.active_deals ?? 0 },
        { name: 'Projects', value: metrics?.projects ?? projects.length },
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
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Upcoming meetings</p>
            <MessageSquareText className="h-4 w-4 text-primary-600" />
          </div>
          <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-gray-100">{upcomingMeetings.length}</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Meetings scheduled ahead.</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Project health</p>
            <TrendingUp className="h-4 w-4 text-primary-600" />
          </div>
          <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-gray-100">{projects.length}</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Projects currently in view.</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {dashboardCards.map((card) => (
          <div key={card.label} className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{card.label}</p>
            <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {typeof card.value === 'number' ? card.value : card.value}
            </p>
          </div>
        ))}
      </section>

      {canSeeSalesWidgets ? (
        <section className="grid gap-6 xl:grid-cols-2">
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Pipeline Funnel</h2>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={funnelData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
                    {funnelData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                  <ChartTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Revenue Trend</h2>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueTrend}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.12} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="url(#revenueFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Lead Sources</h2>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leadSources}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.12} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Conversion Rate</h2>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={conversionData}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.12} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip />
                  <Line type="monotone" dataKey="value" stroke="#f97316" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      ) : (
        <section className="card p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Role-based view</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Sales charts are hidden for this role. Operational widgets remain available below.</p>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Tasks Overview</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={taskOverview}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.12} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip />
                <Bar dataKey="value" fill="#14b8a6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        {canSeeSalesWidgets ? (
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Monthly Performance</h2>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyPerformance}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.12} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip />
                  <Line type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Monthly Performance</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">This chart is available to sales-oriented roles only.</p>
          </div>
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

      {/* Managers Attendance Dashboard Stats */}
      {role !== ROLE.EMPLOYEE && attendanceStats ? (
        <section className="bg-primary-50/20 dark:bg-primary-950/10 p-5 rounded-2xl border border-primary-500/20 space-y-3">
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-850 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase">Total Employees</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-150">{attendanceStats.total_employees}</p>
            </div>
            <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-850 shadow-sm">
              <p className="text-xs font-semibold text-gray-500">Present Today</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-150">{attendanceStats.present_today}</p>
            </div>
            <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-850 shadow-sm">
              <p className="text-xs font-semibold text-gray-500">Working Now</p>
              <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{attendanceStats.working_now}</p>
            </div>
            <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-850 shadow-sm">
              <p className="text-xs font-semibold text-gray-500">On Break</p>
              <p className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">{attendanceStats.on_break}</p>
            </div>
            <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-850 shadow-sm">
              <p className="text-xs font-semibold text-gray-500">Offline</p>
              <p className="mt-2 text-2xl font-bold text-gray-400">{attendanceStats.offline}</p>
            </div>
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
