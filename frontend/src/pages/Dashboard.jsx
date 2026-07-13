import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowDown, ArrowRight, ArrowUp, CalendarDays, CheckSquare, ChevronRight, FolderKanban, GripVertical, Search, SlidersHorizontal, Sparkles, TrendingUp } from 'lucide-react'
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
import { eodAPI } from '../api/eod'
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
const DASHBOARD_SECTION_ORDER_KEY = 'syntask-dashboard-section-order'

const readStoredSectionVisibility = () => {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DASHBOARD_SECTION_VISIBILITY_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const readStoredSectionOrder = () => {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DASHBOARD_SECTION_ORDER_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
  } catch {
    return []
  }
}

const getDefaultSectionPanelCollapsed = () => {
  if (typeof window === 'undefined') return true
  return !window.matchMedia('(min-width: 1280px)').matches
}

const normalizeSectionOrder = (sections, storedOrder) => {
  const sectionIds = sections.map((section) => section.id)
  const validStoredIds = storedOrder.filter((id) => sectionIds.includes(id))
  const missingIds = sectionIds.filter((id) => !validStoredIds.includes(id))
  return [...validStoredIds, ...missingIds]
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
  const [eodToday, setEodToday] = useState(null)
  const [attendanceStats, setAttendanceStats] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [taskHealth, setTaskHealth] = useState(null)
  const [taskExtensions, setTaskExtensions] = useState(null)
  const [teamCompletion, setTeamCompletion] = useState(null)
  const [revenueMode, setRevenueMode] = useState('Accrual')
  const [sectionVisibility, setSectionVisibility] = useState(readStoredSectionVisibility)
  const [sectionOrder, setSectionOrder] = useState(readStoredSectionOrder)
  const [sectionPanelCollapsed, setSectionPanelCollapsed] = useState(getDefaultSectionPanelCollapsed)
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
        const [metricsData] = await Promise.all([
          dashboardAPI.getMetrics().catch(() => null),
        ])
        const dashboardRole = normalizeRole(statsData?.role || user?.role)
        const [healthData, extensionData, teamData] = await Promise.all([
          dashboardRole === ROLE.EMPLOYEE ? tasksAPI.getMyTaskHealth().catch(() => null) : tasksAPI.getTaskHealthSummary().catch(() => null),
          tasksAPI.getExtensionRequestSummary().catch(() => null),
          dashboardRole !== ROLE.EMPLOYEE ? tasksAPI.getTeamCompletionSummary().catch(() => null) : Promise.resolve(null),
        ])

        let ticketsData = { tickets: [] }
        if (dashboardRole === ROLE.EMPLOYEE) {
          ticketsData = await ticketsAPI.listTickets({ limit: 8 })
        }

        if (!active) return
        setStats(statsData || { role: dashboardRole || 'employee' })
        setMetrics(metricsData)
        setRecentTasks(tasksData.tasks || [])
        setRecentTickets(ticketsData.tickets || [])
        setUpcomingMeetings((meetingsData?.data?.meetings || meetingsData?.meetings || []).slice(0, 6))
        setProjects((projectsData?.data?.projects || projectsData?.projects || []).slice(0, 8))
        setTaskHealth(healthData)
        setTaskExtensions(extensionData)
        setTeamCompletion(teamData)

        if (dashboardRole === ROLE.EMPLOYEE) {
          try {
            const attTodayRes = await attendanceAPI.getTodayAttendance()
            if (attTodayRes && attTodayRes.data) {
              setAttendanceToday(attTodayRes.data)
            }
            const eodTodayRes = await eodAPI.today()
            setEodToday(eodTodayRes)
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
  }, [user?.role])

  useEffect(() => {
    try {
      window.localStorage.setItem(DASHBOARD_SECTION_VISIBILITY_KEY, JSON.stringify(sectionVisibility))
    } catch {
      // Ignore storage failures, such as private browsing restrictions.
    }
  }, [sectionVisibility])

  useEffect(() => {
    try {
      window.localStorage.setItem(DASHBOARD_SECTION_ORDER_KEY, JSON.stringify(sectionOrder))
    } catch {
      // Ignore storage failures, such as private browsing restrictions.
    }
  }, [sectionOrder])

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
  const taskSource = recentTasks
  const priorityTasks = [...recentTasks].filter((task) => ['critical', 'high'].includes((task.priority || '').toLowerCase())).slice(0, 5)
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
  const reportMetricCards = [
    { label: 'Active Tasks', value: recentTasks.length, route: '/tasks' },
    { label: 'Projects', value: projects.length, route: '/projects' },
    { label: 'Meetings', value: upcomingMeetings.length, route: '/meetings' },
    { label: role === ROLE.EMPLOYEE ? 'Requests' : 'Priority Items', value: role === ROLE.EMPLOYEE ? recentTickets.length : priorityTasks.length, route: role === ROLE.EMPLOYEE ? '/tickets' : '/tasks' },
  ]
  const reportGraphData = [
    { name: 'Tasks', value: recentTasks.length, route: '/tasks' },
    { name: 'Projects', value: projects.length, route: '/projects' },
    { name: 'Meetings', value: upcomingMeetings.length, route: '/meetings' },
    { name: 'High Priority', value: priorityTasks.length, route: '/tasks' },
  ]
  const eodStatusLabel = eodToday?.status === 'submitted' ? 'Submitted' : eodToday?.status === 'leave' ? 'Leave' : 'Not Submitted'
  const healthSummary = role === ROLE.EMPLOYEE ? taskHealth : taskHealth?.summary
  const extensionSummary = taskExtensions?.summary || {}
  const highestPendingEmployee = (teamCompletion?.employees || []).reduce((top, item) => {
    if (!top || (item.pending_tasks || 0) > (top.pending_tasks || 0)) return item
    return top
  }, null)

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
    { id: 'task-health', name: 'Task Health' },
    { id: 'sales-pipeline', name: 'Revenue & Pipeline' },
    { id: 'sales-performance', name: 'Sales Performance' },
    { id: 'reports', name: 'Reports' },
    { id: 'employee-attendance', name: 'My Attendance', available: role === ROLE.EMPLOYEE && Boolean(attendanceToday) },
    { id: 'workplace-attendance', name: 'Workplace Attendance', available: role !== ROLE.EMPLOYEE && Boolean(attendanceStats) },
    { id: 'ai-briefing', name: 'AI Briefing Center' },
    { id: 'work-meetings', name: 'Work & Meetings' },
    { id: 'project-health', name: 'Project Health' },
    { id: 'recent-activity', name: 'Recent Activity' },
  ].filter((section) => section.available !== false)

  const orderedDashboardSections = normalizeSectionOrder(dashboardSections, sectionOrder)
    .map((id) => dashboardSections.find((section) => section.id === id))
    .filter(Boolean)
  const visibleSectionCount = dashboardSections.filter((section) => sectionVisibility[section.id] !== false).length
  const getSectionOrder = (sectionId) => {
    const index = orderedDashboardSections.findIndex((section) => section.id === sectionId)
    return index === -1 ? 100 : index + 10
  }
  const toggleDashboardSection = (sectionId) => {
    setSectionVisibility((current) => ({ ...current, [sectionId]: current[sectionId] === false }))
  }
  const moveDashboardSection = (sectionId, targetId) => {
    if (!sectionId || !targetId || sectionId === targetId) return
    setSectionOrder((current) => {
      const next = normalizeSectionOrder(dashboardSections, current)
      const fromIndex = next.indexOf(sectionId)
      const toIndex = next.indexOf(targetId)
      if (fromIndex === -1 || toIndex === -1) return next
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }
  const nudgeDashboardSection = (sectionId, direction) => {
    setSectionOrder((current) => {
      const next = normalizeSectionOrder(dashboardSections, current)
      const index = next.indexOf(sectionId)
      const targetIndex = index + direction
      if (index === -1 || targetIndex < 0 || targetIndex >= next.length) return next
      const [moved] = next.splice(index, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
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
      <div key={sectionId} style={{ order: getSectionOrder(sectionId) }} className="transition-all duration-300 ease-out">
        {content}
      </div>
    )
  }

  return (
    <div className="relative flex flex-col gap-6 pb-24 pr-0 xl:pb-0 xl:pr-16">
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
        sections={orderedDashboardSections}
        visibility={sectionVisibility}
        visibleCount={visibleSectionCount}
        collapsed={sectionPanelCollapsed}
        search={sectionSearch}
        onSearchChange={setSectionSearch}
        onToggleCollapsed={() => setSectionPanelCollapsed((collapsed) => !collapsed)}
        onCollapse={() => setSectionPanelCollapsed(true)}
        onToggleSection={toggleDashboardSection}
        onMoveSection={moveDashboardSection}
        onNudgeSection={nudgeDashboardSection}
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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">Today</p>
          <p className="mt-3 text-2xl font-semibold text-text-primary dark:text-text-primary">{todayLabel}</p>
          <p className="mt-2 text-sm text-text-secondary dark:text-text-secondary">Quick access to work, meetings, and AI guidance.</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-secondary dark:text-text-secondary">High-priority tasks</p>
            <Sparkles className="h-4 w-4 text-primary-600" />
          </div>
          <p className="mt-3 text-3xl font-semibold text-text-primary dark:text-text-primary">{priorityTasks.length}</p>
          <p className="mt-2 text-sm text-text-secondary dark:text-text-secondary">Critical and high-priority work in progress.</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-secondary dark:text-text-secondary">Attendance focus</p>
            <TrendingUp className="h-4 w-4 text-primary-600" />
          </div>
          <p className="mt-3 text-3xl font-semibold text-text-primary dark:text-text-primary">
            {role === ROLE.EMPLOYEE ? (attendanceToday?.status || 'Pending') : (attendanceStats?.present_today ?? 0)}
          </p>
          <p className="mt-2 text-sm text-text-secondary dark:text-text-secondary">
            {role === ROLE.EMPLOYEE ? 'Your latest attendance status.' : 'People present today.'}
          </p>
        </div>
        {role === ROLE.EMPLOYEE ? (
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-secondary dark:text-text-secondary">Today&apos;s EOD</p>
            <Badge label={eodStatusLabel} colorKey={eodToday?.status === 'submitted' ? 'submitted' : eodToday?.status === 'leave' ? 'pending' : 'draft'} />
          </div>
          <p className="mt-3 text-2xl font-semibold text-text-primary dark:text-text-primary">{eodStatusLabel}</p>
          <Button className="mt-4" size="sm" variant={eodToday?.status === 'submitted' ? 'secondary' : 'primary'} onClick={() => navigate('/eod')}>
            {eodToday?.status === 'submitted' ? "Edit Today's EOD" : "Submit Today's EOD"}
          </Button>
        </div>
        ) : null}
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

      {renderDashboardSection('task-health', (
      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-text-primary dark:text-text-primary">Task Health</h2>
            <p className="text-sm text-text-muted dark:text-text-secondary">
              {role === ROLE.EMPLOYEE ? 'Your assigned task status and extension requests.' : 'Team deadline pressure and extension workflow.'}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate('/tasks')}>
            Open Tasks
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {role === ROLE.EMPLOYEE ? (
            <>
              <TaskHealthCard label="Assigned" value={healthSummary?.total_assigned_tasks ?? 0} />
              <TaskHealthCard label="Completed" value={healthSummary?.completed_tasks ?? 0} />
              <TaskHealthCard label="Pending" value={healthSummary?.pending_tasks ?? 0} />
              <TaskHealthCard label="Overdue" value={healthSummary?.overdue_tasks ?? 0} tone="danger" />
              <TaskHealthCard label="Extension Requests" value={extensionSummary.pending ?? healthSummary?.extension_requests?.pending ?? 0} />
            </>
          ) : (
            <>
              <TaskHealthCard label="Team Overdue Tasks" value={healthSummary?.overdue ?? 0} tone="danger" />
              <TaskHealthCard label="Pending Extension Requests" value={extensionSummary.pending ?? 0} />
              <TaskHealthCard label="Tasks Due Today" value={healthSummary?.due_today ?? 0} />
              <TaskHealthCard label="Highest Pending Work" value={highestPendingEmployee?.pending_tasks ?? 0} helper={highestPendingEmployee?.employee_name || 'No employee load'} />
              <TaskHealthCard label="Completed Tasks" value={(teamCompletion?.employees || []).reduce((sum, item) => sum + (item.completed_tasks || 0), 0)} />
            </>
          )}
        </div>
      </section>
      ))}

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
          <h2 className="text-base font-semibold text-text-primary dark:text-text-primary">Role-based view</h2>
          <p className="mt-2 text-sm text-text-secondary dark:text-text-secondary">Sales charts are hidden for this role. Operational widgets remain available below.</p>
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
            <p className="text-sm text-text-secondary dark:text-text-secondary">This chart is available to sales-oriented roles only.</p>
          </ChartCard>
        )}
      </section>
      ))}

      {renderDashboardSection('reports', (
      <section className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {reportMetricCards.map((metric) => (
            <button
              key={metric.label}
              type="button"
              onClick={() => navigate(metric.route)}
              className="card p-5 text-left transition hover:border-primary-300 hover:bg-primary-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/35 dark:hover:border-primary-700 dark:hover:bg-primary-950/20"
              aria-label={`Open ${metric.label} report`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{metric.label}</p>
              <p className="mt-3 text-3xl font-semibold text-text-primary dark:text-text-primary">{metric.value}</p>
              <p className="mt-2 text-sm text-text-secondary dark:text-text-secondary">Open detailed report</p>
            </button>
          ))}
        </div>
        <section className="grid gap-6 xl:grid-cols-2">
          <ChartCard title="Report Metrics" period="Current View">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportGraphData} barCategoryGap="32%" onClick={(state) => navigateFromChart(state?.activePayload?.[0], '/reports')}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <ChartTooltip />
                  <Bar dataKey="value" name="Items" fill="#FF8A4C" radius={[6, 6, 0, 0]} maxBarSize={44} className="cursor-pointer" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
          <ChartCard title="Report Trend" period="Current View">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reportGraphData} onClick={(state) => navigateFromChart(state?.activePayload?.[0], '/reports')}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <ChartTooltip />
                  <Line type="monotone" dataKey="value" name="Items" stroke="#2FB47C" strokeWidth={3} dot={{ r: 5, fill: '#2FB47C', cursor: 'pointer' }} activeDot={{ r: 7 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </section>
      </section>
      ))}

      {/* Employee Attendance Widget */}
      {renderDashboardSection('employee-attendance', (
      role === ROLE.EMPLOYEE && attendanceToday ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 bg-emerald-50/20 dark:bg-emerald-950/10 p-4 rounded-2xl border border-emerald-500/20">
          <div className="card p-4 bg-surface dark:bg-black/85 border border-border shadow-sm">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Attendance Status</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-base font-bold text-text-primary dark:text-text-primary">{attendanceToday.status}</span>
              <Badge label={attendanceToday.status} colorKey={attendanceToday.status} />
            </div>
          </div>
          <div className="card p-4 bg-surface dark:bg-black/85 border border-border shadow-sm">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Working Hours Today</p>
            <p className="mt-2 text-2xl font-bold font-mono text-text-primary dark:text-text-primary">
              {formatDuration(attendanceToday.total_working_hours)}
            </p>
          </div>
          <div className="card p-4 bg-surface dark:bg-black/85 border border-border shadow-sm">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Camera Status</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary dark:text-text-secondary">Permission</span>
              <Badge
                label={attendanceToday.camera_permission_status || 'Denied'}
                colorKey={attendanceToday.camera_permission_status === 'Connected' || attendanceToday.camera_permission_status === 'Granted' ? 'completed' : 'rejected'}
              />
            </div>
          </div>
          <div className="card p-4 bg-surface dark:bg-black/85 border border-border shadow-sm">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Screen Share</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary dark:text-text-secondary">Status</span>
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
                    className="rounded-xl border border-border bg-surface-muted p-4 text-left transition hover:border-primary-300 hover:bg-primary-50/50 dark:border-border dark:bg-black/80 dark:hover:border-primary-700 dark:hover:bg-primary-950/30"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{label}</p>
                    <p className="mt-3 text-3xl font-semibold text-text-primary dark:text-text-primary">{value}</p>
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
            <div className="flex h-72 items-center justify-center text-sm text-text-muted">No dated tasks in the next week</div>
          )}
            <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-4 text-xs text-text-muted dark:border-border dark:text-text-secondary">
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
              <h2 className="text-base font-semibold text-text-primary dark:text-text-primary">Today&apos;s work</h2>
              <p className="text-sm text-text-muted dark:text-text-secondary">High-signal items that need attention now.</p>
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
                className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-muted dark:border-border dark:bg-black/80 dark:hover:bg-white/5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary dark:text-text-primary">{item.title}</p>
                  <p className="truncate text-xs text-text-muted dark:text-text-secondary">
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
              <h2 className="text-base font-semibold text-text-primary dark:text-text-primary">Upcoming meetings</h2>
              <p className="text-sm text-text-muted dark:text-text-secondary">Scheduled coordination and client calls.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/meetings')}>
              Open
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {upcomingMeetings.length ? upcomingMeetings.map((meeting) => (
              <div key={meeting.id} className="rounded-xl border border-border bg-surface px-4 py-3 dark:border-border dark:bg-black/80">
                <p className="text-sm font-medium text-text-primary dark:text-text-primary">{meeting.title}</p>
                <p className="mt-1 text-xs text-text-muted dark:text-text-secondary">
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
              <h2 className="text-base font-semibold text-text-primary dark:text-text-primary">Project health</h2>
              <p className="text-sm text-text-muted dark:text-text-secondary">Current projects in the workspace.</p>
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
            <div className="flex h-72 items-center justify-center text-sm text-text-muted">No projects to chart yet</div>
          )}
        </ChartCard>
      </section>
      ))}

      {renderDashboardSection('recent-activity', (
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="card p-5">
          <h2 className="text-base font-semibold text-text-primary dark:text-text-primary">Recent activity</h2>
          <p className="mt-1 text-sm text-text-muted dark:text-text-secondary">Latest changes across your workspace.</p>
          <div className="mt-4 space-y-3">
            {(role === ROLE.EMPLOYEE ? recentTickets : recentTasks).slice(0, 5).map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-surface px-4 py-3 dark:border-border dark:bg-black/80">
                <p className="text-sm font-medium text-text-primary dark:text-text-primary">{item.title}</p>
                <p className="mt-1 text-xs text-text-muted dark:text-text-secondary">
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

export function DashboardSectionVisibilityPanel({
  sections,
  visibility,
  visibleCount,
  collapsed,
  search,
  onSearchChange,
  onToggleCollapsed,
  onCollapse,
  onToggleSection,
  onMoveSection,
  onNudgeSection,
  onSelectAll,
  onClearAll,
}) {
  const panelRef = useRef(null)
  const [draggingId, setDraggingId] = useState(null)
  const filteredSections = sections.filter((section) => section.name.toLowerCase().includes(search.trim().toLowerCase()))

  useEffect(() => {
    if (collapsed) return undefined

    const handlePointerDown = (event) => {
      if (panelRef.current?.contains(event.target)) return
      onCollapse?.()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [collapsed, onCollapse])

  useEffect(() => {
    if (collapsed) return undefined

    const handleScroll = (event) => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || event.target?.scrollY || 0
      if (scrollY > 24) onCollapse?.()
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [collapsed, onCollapse])

  return (
    <aside
      ref={panelRef}
      className={`fixed bottom-4 right-3 z-30 transition-all duration-300 ease-out xl:bottom-auto xl:top-24 ${
        collapsed ? 'w-12' : 'w-[min(calc(100vw-1.5rem),19rem)] xl:w-72'
      }`}
      aria-label="Dashboard section visibility controls"
    >
      <div className="overflow-hidden rounded-2xl border border-surface-border/80 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-[var(--color-app-border)] dark:bg-[rgb(29_24_19_/_0.96)]">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Show dashboard sections' : 'Hide dashboard sections'}
          className={`flex w-full items-center justify-center gap-2 p-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 dark:text-[var(--color-app-text)] dark:hover:bg-[var(--color-app-surface-muted)] ${
            collapsed ? 'h-12' : 'border-b border-surface-border dark:border-[var(--color-app-border)]'
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
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-muted)]">
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
              <button type="button" onClick={onClearAll} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-500 transition hover:bg-gray-100 dark:text-[var(--color-app-text-muted)] dark:hover:bg-[var(--color-app-surface-muted)]">
                Deselect All
              </button>
            </div>

            <div className="max-h-[42vh] space-y-1 overflow-y-auto pr-1 xl:max-h-[62vh]">
              {filteredSections.map((section, index) => {
                const checked = visibility[section.id] !== false
                return (
                  <div
                    key={section.id}
                    draggable
                    onDragStart={(event) => {
                      setDraggingId(section.id)
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', section.id)
                    }}
                    onDragOver={(event) => {
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      const sourceId = event.dataTransfer.getData('text/plain') || draggingId
                      onMoveSection?.(sourceId, section.id)
                      setDraggingId(null)
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    className={`flex items-center gap-2 rounded-xl px-2 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-[var(--color-app-text-secondary)] dark:hover:bg-[var(--color-app-surface-muted)] ${
                      draggingId === section.id ? 'bg-primary-50/80 ring-1 ring-primary-200 dark:bg-primary-950/30 dark:ring-primary-800' : ''
                    }`}
                  >
                    <GripVertical className="h-4 w-4 flex-none cursor-grab text-gray-400 active:cursor-grabbing dark:text-[var(--color-app-text-muted)]" aria-hidden="true" />
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
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
                    <div className="flex flex-none items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onNudgeSection?.(section.id, -1)}
                        disabled={index === 0}
                        className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-[var(--color-app-surface-muted)] dark:hover:text-[var(--color-app-text)]"
                        aria-label={`Move ${section.name} up`}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onNudgeSection?.(section.id, 1)}
                        disabled={index === filteredSections.length - 1}
                        className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-[var(--color-app-surface-muted)] dark:hover:text-[var(--color-app-text)]"
                        aria-label={`Move ${section.name} down`}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
              {!filteredSections.length ? (
                <p className="px-2 py-5 text-center text-sm text-gray-500 dark:text-[var(--color-app-text-muted)]">No sections found.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  )
}

function TaskHealthCard({ label, value, helper, tone = 'default' }) {
  return (
    <article className={`rounded-2xl border p-4 ${tone === 'danger' ? 'border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/20' : 'border-border bg-surface dark:border-border dark:bg-black/70'}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted dark:text-text-secondary">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-text-primary dark:text-text-primary">{value}</p>
      {helper ? <p className="mt-2 text-xs text-text-muted dark:text-text-secondary">{helper}</p> : null}
    </article>
  )
}

export default Dashboard
