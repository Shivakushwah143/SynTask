import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowRight, CalendarDays, CheckSquare, ChevronRight, FolderKanban, Search, SlidersHorizontal, Sparkles, TrendingUp } from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
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
import { WorkflowGuide } from '../components/workflow/WorkflowGuide'
import WorkflowJourney from '../components/workflow/WorkflowJourney'
import { ChartCard } from '../components/charts/ChartCard'
import IncomeExpenseBarChart from '../components/charts/IncomeExpenseBarChart'
import DonutLegendChart from '../components/charts/DonutLegendChart'
import { DASHBOARD_PROJECT_STATUSES, TASK_PRIORITY_COLORS, buildProjectHealthData, buildTaskDuePriorityData } from './dashboardData'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const PROJECT_STATUS_COLORS = { active: '#4285F4', planning: '#7C6FE0', completed: '#2FB47C', on_hold: '#FFB020' }
const DASHBOARD_SECTION_VISIBILITY_KEY = 'syntask-dashboard-section-visibility'

const readStoredSectionVisibility = () => {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DASHBOARD_SECTION_VISIBILITY_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

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
  const [sectionVisibility, setSectionVisibility] = useState(readStoredSectionVisibility)
  const [sectionPanelCollapsed, setSectionPanelCollapsed] = useState(false)
  const [sectionSearch, setSectionSearch] = useState('')

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

  useEffect(() => {
    try {
      window.localStorage.setItem(DASHBOARD_SECTION_VISIBILITY_KEY, JSON.stringify(sectionVisibility))
    } catch {
      // Ignore storage failures, such as private browsing restrictions.
    }
  }, [sectionVisibility])

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
  const dueTodayCount = metrics?.tasks_due_today ?? 0

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

  const conversionData = canSeeSalesWidgets
    ? [
        { name: 'Lead', value: metrics?.total_leads ?? 0, route: '/crm/leads' },
        { name: 'Qualified', value: metrics?.qualified_leads ?? 0, route: '/crm/pipeline' },
        { name: 'Won', value: metrics?.won_deals ?? 0, route: '/crm/pipeline' },
      ]
    : []

  const monthlyPerformance = canSeeSalesWidgets
    ? [
        { name: 'Leads', value: metrics?.new_leads ?? 0, route: '/crm/leads' },
        { name: 'Deals', value: metrics?.active_deals ?? 0, route: '/crm/pipeline' },
        { name: 'Projects', value: metrics?.projects ?? projects.length, route: '/projects' },
      ]
    : []

  // Team attendance snapshot -> donut instead of a plain number strip
  const attendanceBreakdown = attendanceStats
    ? [
        { name: 'Working Now', value: attendanceStats.working_now ?? 0, route: '/live-monitor' },
        { name: 'On Break', value: attendanceStats.on_break ?? 0, route: '/live-monitor' },
        { name: 'Offline', value: attendanceStats.offline ?? 0, route: '/live-monitor' },
      ]
    : []

  const taskDuePriorityData = buildTaskDuePriorityData(recentTasks)
  const projectHealthChartData = buildProjectHealthData(projects)

  const navigateFromChart = (entry, fallback) => {
    const route = entry?.payload?.route || entry?.route || fallback
    if (route) navigate(route)
  }

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

  const dashboardSections = [
    { id: 'workflow-guide', name: 'Workflow Guide' },
    { id: 'workflow-journey', name: 'Workflow Journey' },
    { id: 'snapshot-cards', name: 'Snapshot Cards' },
    { id: 'sales-pipeline', name: 'Revenue & Pipeline' },
    { id: 'sales-performance', name: 'Sales Performance' },
    { id: 'employee-attendance', name: 'My Attendance', available: role === ROLE.EMPLOYEE && Boolean(attendanceToday) },
    { id: 'workplace-attendance', name: 'Workplace Attendance', available: role !== ROLE.EMPLOYEE && Boolean(attendanceStats) },
    { id: 'ai-briefing', name: 'AI Briefing Center' },
    { id: 'work-meetings', name: 'Work & Meetings' },
    { id: 'project-health', name: 'Project Health' },
    { id: 'recent-activity', name: 'Recent Activity' },
  ].filter((section) => section.available !== false)

  const visibleSectionCount = dashboardSections.filter((section) => sectionVisibility[section.id] !== false).length
  const toggleDashboardSection = (sectionId) => {
    setSectionVisibility((current) => ({ ...current, [sectionId]: current[sectionId] === false }))
  }
  const setAllDashboardSections = (visible) => {
    setSectionVisibility((current) => {
      const next = { ...current }
      dashboardSections.forEach((section) => {
        next[section.id] = visible
      })
      return next
    })
  }
  const renderDashboardSection = (sectionId, content) => {
    if (sectionVisibility[sectionId] === false) return null
    return (
      <div key={sectionId} className="transition-all duration-300 ease-out">
        {content}
      </div>
    )
  }

  return (
    <div className="relative space-y-6 pr-0 xl:pr-16">
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

      <DashboardSectionVisibilityPanel
        sections={dashboardSections}
        visibility={sectionVisibility}
        visibleCount={visibleSectionCount}
        collapsed={sectionPanelCollapsed}
        search={sectionSearch}
        onSearchChange={setSectionSearch}
        onToggleCollapsed={() => setSectionPanelCollapsed((collapsed) => !collapsed)}
        onToggleSection={toggleDashboardSection}
        onSelectAll={() => setAllDashboardSections(true)}
        onClearAll={() => setAllDashboardSections(false)}
      />

      {renderDashboardSection('workflow-guide', (
      <WorkflowGuide
        title={role === ROLE.MANAGER ? 'Review team load, then assign the next task' : role === ROLE.LEAD ? 'Clear today’s team work, then move the pipeline forward' : 'Focus on the highest-risk work first'}
        description={role === ROLE.MANAGER
          ? 'Use this screen to see workload balance, overdue work, and the next lead or task that should be assigned.'
          : role === ROLE.LEAD
            ? 'Use this screen to keep execution current so the team stays aligned on the next business action.'
            : 'Use this screen to keep the workspace moving without hunting through disconnected views.'}
        nextStep={role === ROLE.MANAGER
          ? 'Open tasks or CRM pipeline to assign the next owner.'
          : role === ROLE.LEAD
            ? 'Review today’s work and clear blockers before they age.'
            : 'Open the most urgent task, project, or meeting now.'}
        primaryAction={role === ROLE.MANAGER
          ? { label: 'Open Tasks', href: '/tasks' }
          : role === ROLE.LEAD
            ? { label: 'Open Team', href: '/my-team' }
            : { label: 'Open Dashboard', href: '/dashboard' }}
        secondaryAction={role === ROLE.MANAGER
          ? { label: 'Open CRM Pipeline', href: '/crm/pipeline' }
          : { label: 'Open Calendar', href: '/calendar' }}
        bullets={[
          { label: 'Where am I?', value: 'The main operational workspace.' },
          { label: 'What next?', value: role === ROLE.MANAGER ? 'Assign or reassign the next item.' : 'Resolve the current blocker.' },
          { label: 'After this?', value: 'Move into the relevant workspace with one click.' },
        ]} 
        className="mb-6"
      />
      ))}

      {renderDashboardSection('workflow-journey', (
      <WorkflowJourney
        className="mb-6"
        description="This is the complete operating path in SynTask, from sign-in through revenue, delivery, reporting, and renewal."
      />
      ))}

      {renderDashboardSection('snapshot-cards', (
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
      ))}

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

      {renderDashboardSection('sales-pipeline', (
      canSeeSalesWidgets ? (
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
            onBarClick={() => navigate('/crm/pipeline')}
          />
          <DonutLegendChart title="Pipeline Funnel" data={funnelData.map((item) => ({ ...item, route: item.name === 'New Leads' ? '/crm/leads' : '/crm/pipeline' }))} emptyLabel="No pipeline activity yet" onItemClick={(item) => navigateFromChart(item, '/crm/pipeline')} />
        </section>
      ) : (
        <section className="card p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Role-based view</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Sales charts are hidden for this role. Operational widgets remain available below.</p>
        </section>
      )
      ))}

      {renderDashboardSection('sales-performance', (
      <section className="grid gap-6 xl:grid-cols-2">
        {canSeeSalesWidgets ? (
          <>
            <ChartCard title="Conversion Rate">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={conversionData} onClick={(state) => navigateFromChart(state?.activePayload?.[0], '/crm/pipeline')}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <ChartTooltip />
                    <Line type="monotone" dataKey="value" stroke="#FF8A4C" strokeWidth={3} dot={{ r: 5, fill: '#FF8A4C', cursor: 'pointer' }} activeDot={{ r: 7, onClick: (_, item) => navigateFromChart(item, '/crm/pipeline') }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
            <ChartCard title="Monthly Performance">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyPerformance} barCategoryGap="35%" onClick={(state) => navigateFromChart(state?.activePayload?.[0], '/projects')}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <ChartTooltip />
                    <Bar dataKey="value" fill="#2FB47C" radius={[6, 6, 0, 0]} maxBarSize={40} className="cursor-pointer" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </>
        ) : (
          <ChartCard title="Monthly Performance">
            <p className="text-sm text-gray-500 dark:text-gray-400">This chart is available to sales-oriented roles only.</p>
          </ChartCard>
        )}
      </section>
      ))}

      {/* Employee Attendance Widget */}
      {renderDashboardSection('employee-attendance', (
      role === ROLE.EMPLOYEE && attendanceToday ? (
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
      ) : null
      ))}

      {/* Managers Attendance Dashboard */}
      {renderDashboardSection('workplace-attendance', (
      role !== ROLE.EMPLOYEE && attendanceStats ? (
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
            <DonutLegendChart title="Live Status Breakdown" data={attendanceBreakdown} emptyLabel="No activity yet today" onItemClick={(item) => navigateFromChart(item, '/live-monitor')} />
            <ChartCard title="Attendance Signal" period="Today">
              <div className="grid h-full min-h-72 content-center gap-3 sm:grid-cols-3">
                {[
                  ['Present', attendanceStats.present_today ?? 0],
                  ['Working', attendanceStats.working_now ?? 0],
                  ['On break', attendanceStats.on_break ?? 0],
                ].map(([label, value]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => navigate('/live-monitor')}
                    title={`${label}: ${value}`}
                    aria-label={`${label}: ${value}`}
                    className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-left transition hover:border-primary-300 hover:bg-primary-50/50 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-primary-700 dark:hover:bg-primary-950/30"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</p>
                    <p className="mt-3 text-3xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
                  </button>
                ))}
              </div>
            </ChartCard>
          </div>
        </section>
      ) : null
      ))}

      {renderDashboardSection('ai-briefing', (
      <AIBriefingCenter user={user} stats={stats} recentTasks={recentTasks} recentTickets={recentTickets} />
      ))}

      {renderDashboardSection('work-meetings', (
      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="space-y-6">
          <ChartCard title="Task Due Dates by Priority" period="Next 7 Days">
            {taskDuePriorityData.length ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={taskDuePriorityData} barCategoryGap="24%" margin={{ top: 10, right: 12, left: 0, bottom: 18 }} onClick={(state) => navigateFromChart(state?.activePayload?.[0], '/tasks')}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis
                      dataKey="shortName"
                      interval={0}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={6}
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      label={{ value: 'Days remaining', angle: -90, position: 'insideLeft', style: { fill: '#9ca3af', fontSize: 11 } }}
                    />
                    <ChartTooltip labelFormatter={(_, point) => point.name} valueFormatter={(value, key) => key === 'daysRemaining' ? `${value} day${value === 1 ? '' : 's'}` : value} />
                    <Bar dataKey="daysRemaining" name="Days Remaining" radius={[6, 6, 0, 0]} maxBarSize={44} className="cursor-pointer">
                      {taskDuePriorityData.map((entry) => (
                        <Cell key={entry.id || entry.name} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-72 items-center justify-center text-sm text-gray-400">No dated tasks in the next week</div>
            )}
            <div className="mt-4 flex flex-wrap gap-3 border-t border-gray-100 pt-4 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
              {Object.entries(TASK_PRIORITY_COLORS).map(([priority, color]) => (
                <span key={priority} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                  {priority.replace(/\b\w/g, (letter) => letter.toUpperCase())}
                </span>
              ))}
            </div>
          </ChartCard>
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
      ))}

      {renderDashboardSection('project-health', (
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
        <ChartCard title="Project Health Graph" period="Current Projects">
          {projectHealthChartData.length ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectHealthChartData} layout="vertical" margin={{ left: 10, right: 20 }} onClick={(state) => navigateFromChart(state?.activePayload?.[0], '/projects')}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis type="category" dataKey="name" width={96} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <ChartTooltip />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  {DASHBOARD_PROJECT_STATUSES.map((status) => (
                    <Bar key={status} dataKey={status} name={status.replace(/_/g, ' ')} stackId="status" fill={PROJECT_STATUS_COLORS[status]} radius={[0, 5, 5, 0]} className="cursor-pointer" />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-72 items-center justify-center text-sm text-gray-400">No projects to chart yet</div>
          )}
        </ChartCard>
      </section>
      ))}

      {renderDashboardSection('recent-activity', (
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
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
      ))}

      {/* <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Operating Signals Before You Ask</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Recent project movement and active notifications in one scan.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
              Projects
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {(recent?.projects || []).slice(0, 4).map((item) => (
              <button key={item.id} type="button" onClick={() => navigate(item.id ? `/projects/${item.id}/board` : '/projects')} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.name}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.created_at ? format(new Date(item.created_at), 'MMM d, h:mm a') : 'Recently'}</p>
              </button>
            ))}
            {!(recent?.projects || []).length ? <EmptyState title="No operating signals" description="Project movement will appear here as work changes." /> : null}
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
      </section> */}
    </div>
  )
}

function DashboardSectionVisibilityPanel({
  sections,
  visibility,
  visibleCount,
  collapsed,
  search,
  onSearchChange,
  onToggleCollapsed,
  onToggleSection,
  onSelectAll,
  onClearAll,
}) {
  const filteredSections = sections.filter((section) => section.name.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <aside
      className={`fixed bottom-4 right-3 z-30 transition-all duration-300 ease-out xl:bottom-auto xl:top-24 ${
        collapsed ? 'w-12' : 'w-[min(calc(100vw-1.5rem),19rem)] xl:w-72'
      }`}
      aria-label="Dashboard section visibility controls"
    >
      <div className="overflow-hidden rounded-2xl border border-surface-border/80 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/95">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={`flex w-full items-center justify-center gap-2 p-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-900 ${
            collapsed ? 'h-12' : 'border-b border-surface-border dark:border-gray-800'
          }`}
          aria-expanded={!collapsed}
          title={collapsed ? 'Show dashboard sections' : 'Hide dashboard sections'}
        >
          {collapsed ? (
            <SlidersHorizontal className="h-5 w-5 text-primary-600" />
          ) : (
            <>
              <SlidersHorizontal className="h-4 w-4 text-primary-600" />
              <span className="min-w-0 flex-1 text-left">Dashboard Sections</span>
              <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-700 dark:bg-primary-950 dark:text-primary-200">
                {visibleCount}/{sections.length}
              </span>
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </button>

        {!collapsed ? (
          <div className="space-y-3 p-3">
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Find section"
                className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
                aria-label="Search dashboard sections"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={onSelectAll} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-50 dark:text-primary-200 dark:hover:bg-primary-950">
                Select All
              </button>
              <button type="button" onClick={onClearAll} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900">
                Clear All
              </button>
            </div>

            <div className="max-h-[42vh] space-y-1 overflow-y-auto pr-1 xl:max-h-[62vh]">
              {filteredSections.map((section) => {
                const checked = visibility[section.id] !== false
                return (
                  <label
                    key={section.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900"
                  >
                    <span className="relative inline-flex h-5 w-9 flex-none items-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleSection(section.id)}
                        className="peer sr-only"
                      />
                      <span className="absolute inset-0 rounded-full bg-gray-200 transition peer-checked:bg-primary-600 dark:bg-gray-800" />
                      <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{section.name}</span>
                  </label>
                )
              })}
              {!filteredSections.length ? (
                <p className="px-2 py-5 text-center text-sm text-gray-500 dark:text-gray-400">No sections found.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  )
}

export default Dashboard
