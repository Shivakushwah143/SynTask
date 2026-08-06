import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, addDays } from 'date-fns'
import { 
  ArrowRight, 
  Building2, 
  CalendarDays, 
  CheckSquare, 
  FolderKanban, 
  Sparkles, 
  TrendingUp,
  LayoutDashboard,
  Users,
  DollarSign,
  Clock,
  Calendar,
  Zap,
  Award,
  Target,
  Activity,
  BarChart3,
  PieChart,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock as ClockIcon,
  User,
  Briefcase,
  FileText,
  Mail,
  Phone,
  MapPin,
  Star,
  Crown,
  Gem,
  Rocket,
  Infinity,
  Database,
  Layers,
  ChevronDown,
  ChevronRight,
  Settings,
  HelpCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Plus,
  Minus,
  Copy,
  Download,
  Printer,
  Filter,
  Search,
  Menu,
  X
} from 'lucide-react'
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
import { crmApi } from '../api/crm'
import { reportsAPI } from '../api/reports'
import { tasksAPI } from '../api/tasks'
import { ticketsAPI } from '../api/tickets'
import { meetingsApi } from '../api/meetings'
import { projectsApi } from '../api/projects'
import { calendarApi } from '../api/calendar'
import { contentCalendarApi } from '../api/contentCalendar'
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
const IncomeExpenseBarChart = lazy(() => import('../components/charts/IncomeExpenseBarChart'))
const DonutLegendChart = lazy(() => import('../components/charts/DonutLegendChart'))
import { DASHBOARD_PROJECT_STATUSES, TASK_PRIORITY_COLORS, buildProjectHealthData, buildTaskDuePriorityData } from './dashboardData'
import { DashboardSectionVisibilityPanel } from './DashboardSectionVisibilityPanelView.jsx'
import { timeService } from '@/services/timeService'

// ============================================================
// STAT CARD COMPONENT
// ============================================================
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
    teal: 'from-teal-500 to-cyan-500',
  }

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg transition-transform group-hover:scale-110`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  )
}

// ============================================================
// SECTION HEADER COMPONENT
// ============================================================
const SectionHeader = ({ icon: Icon, title, description, action }) => (
  <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
          <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
      {action}
    </div>
  </div>
)

// ============================================================
// TASK HEALTH CARD
// ============================================================
const TaskHealthCard = ({ label, value, helper, tone = 'default' }) => {
  const colors = {
    default: 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50',
    danger: 'border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/20',
    warning: 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/20',
    success: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/20',
  }

  return (
    <div className={`rounded-lg border p-2.5 ${colors[tone]}`}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{value}</p>
      {helper && <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">{helper}</p>}
    </div>
  )
}

// ============================================================
// CONSTANTS
// ============================================================
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const PROJECT_STATUS_COLORS = {
  created: '#94A3B8',
  planning: '#7C6FE0',
  active: '#4285F4',
  kickoff: '#06B6D4',
  execution: '#2563EB',
  review: '#F59E0B',
  completed: '#2FB47C',
  reporting: '#14B8A6',
  on_hold: '#FFB020',
  archived: '#64748B',
}
const DASHBOARD_SECTION_VISIBILITY_KEY = 'syntask-dashboard-section-visibility'
const DASHBOARD_SECTION_ORDER_KEY = 'syntask-dashboard-section-order'

// ============================================================
// HELPER FUNCTIONS
// ============================================================
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

// Session storage cache helpers for stale‑while‑revalidate
const DASHBOARD_CACHE_KEY = 'syntask-dashboard-cache'
const readDashboardCache = () => {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
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

const formatDuration = (totalSeconds) => {
  if (!totalSeconds) return '00:00'
  const hrs = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  return `${hrs}h ${mins}m`
}

// ============================================================
// MAIN COMPONENT
// ============================================================
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
  const [crmDashboard, setCrmDashboard] = useState(null)
  const [taskHealth, setTaskHealth] = useState(null)
  const [taskExtensions, setTaskExtensions] = useState(null)
  const [teamCompletion, setTeamCompletion] = useState(null)
  const [productionDashboard, setProductionDashboard] = useState(null)
  const [revenueMode, setRevenueMode] = useState('Accrual')
  const [todayEvents, setTodayEvents] = useState([])
  const [upcomingDeadlines, setUpcomingDeadlines] = useState([])
  const [upcomingMeetingsList, setUpcomingMeetingsList] = useState([])
  const [workspaceEvents, setWorkspaceEvents] = useState([])
  const [, setTodayContent] = useState([])
  const [, setOverdueTasksList] = useState([])
  const [, setCalendarLoading] = useState(false)
  const [sectionVisibility, setSectionVisibility] = useState(readStoredSectionVisibility)
  const [sectionOrder, setSectionOrder] = useState(readStoredSectionOrder)
  const [sectionPanelCollapsed, setSectionPanelCollapsed] = useState(getDefaultSectionPanelCollapsed)
  const [sectionSearch, setSectionSearch] = useState('')

  // Load cached dashboard data on mount (stale‑while‑revalidate)
  useEffect(() => {
    const cached = readDashboardCache()
    if (cached) {
      setStats(cached.stats)
      setMetrics(cached.metrics)
      setCrmDashboard(cached.crmDashboard)
      setRecentTasks(cached.recentTasks)
      setRecentTickets(cached.recentTickets)
      setUpcomingMeetings(cached.upcomingMeetings)
      setProjects(cached.projects)
      setTaskHealth(cached.taskHealth)
      setTaskExtensions(cached.taskExtensions)
      setTeamCompletion(cached.teamCompletion)
      setProductionDashboard(cached.productionDashboard)
      setAttendanceToday(cached.attendanceToday)
      setEodToday(cached.eodToday)
      setAttendanceStats(cached.attendanceStats)
      setRevenueMode(cached.revenueMode ?? 'Accrual')
      setLoading(false)
    }
  }, [])

  const refreshDashboard = useCallback(async (isMounted = () => true) => {
    try {
      setLoading(true)
      // Fire all primary API calls concurrently using Promise.allSettled
      const primaryPromises = {
        stats: dashboardAPI.getStats().catch(() => null),
        tasks: tasksAPI.listTasks({ limit: 8 }).catch(() => null),
        meetings: meetingsApi.list({ limit: 6, upcoming: true }).catch(() => null),
        projects: projectsApi.getProjects({ limit: 8 }).catch(() => null),
        metrics: dashboardAPI.getMetrics().catch(() => null),
      }
      const primaryResults = await Promise.allSettled(Object.values(primaryPromises))
      const [statsData, tasksData, meetingsData, projectsData, metricsData] = primaryResults.map((r) => (r.status === 'fulfilled' ? r.value : null))

      const dashboardRole = normalizeRole(statsData?.role || user?.role)
      const shouldLoadCrmDashboard = [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.MANAGER, ROLE.LEAD, ROLE.SUPER_ADMIN].includes(dashboardRole)

      // Conditional and additional parallel calls
      const crmDashboardPromise = shouldLoadCrmDashboard
        ? crmApi.getDashboard().then((r) => r?.data || null).catch(() => null)
        : Promise.resolve(null)
      const healthPromise =
        dashboardRole === ROLE.EMPLOYEE
          ? tasksAPI.getMyTaskHealth().catch(() => null)
          : tasksAPI.getTaskHealthSummary().catch(() => null)
      const extensionPromise = tasksAPI.getExtensionRequestSummary().catch(() => null)
      const teamPromise =
        dashboardRole !== ROLE.EMPLOYEE ? tasksAPI.getTeamCompletionSummary().catch(() => null) : Promise.resolve(null)
      const ticketsPromise =
        dashboardRole === ROLE.EMPLOYEE ? ticketsAPI.listTickets({ limit: 8 }).catch(() => null) : Promise.resolve({ tickets: [] })
      const attendancePromise =
        dashboardRole === ROLE.EMPLOYEE ? attendanceAPI.getTodayAttendance().catch(() => null) : attendanceAPI.getDashboardStats().catch(() => null)
      const eodPromise = dashboardRole === ROLE.EMPLOYEE ? eodAPI.today().catch(() => null) : Promise.resolve(null)
      const productionDashboardPromise =
        [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.MANAGER, ROLE.SUPER_ADMIN].includes(dashboardRole)
          ? tasksAPI.getProductionDashboard().catch(() => null)
          : Promise.resolve(null)

      const [crmDashboardData, healthData, extensionData, teamData, ticketsData, attendanceRes, eodTodayRes, productionDashboardData] = await Promise.all([
        crmDashboardPromise,
        healthPromise,
        extensionPromise,
        teamPromise,
        ticketsPromise,
        attendancePromise,
        eodPromise,
        productionDashboardPromise,
      ])

      if (!isMounted()) return

      // Update state
      setStats(statsData || { role: dashboardRole || 'employee' })
      setMetrics(metricsData)
      setCrmDashboard(crmDashboardData)
      setRecentTasks(tasksData?.tasks || [])
      setRecentTickets(ticketsData?.tickets || [])
      setUpcomingMeetings((meetingsData?.data?.meetings || meetingsData?.meetings || []).slice(0, 6))
      setProjects((projectsData?.data?.projects || projectsData?.projects || []).slice(0, 8))
      setTaskHealth(healthData)
      setTaskExtensions(extensionData)
      setTeamCompletion(teamData)
      setProductionDashboard(productionDashboardData)

      if (dashboardRole === ROLE.EMPLOYEE) {
        if (attendanceRes && attendanceRes.data) setAttendanceToday(attendanceRes.data)
        setEodToday(eodTodayRes)
      } else {
        if (attendanceRes && attendanceRes.data) setAttendanceStats(attendanceRes.data)
      }

      // Stale‑while‑revalidate: cache the fetched dashboard data in sessionStorage
      try {
        const cachePayload = {
          stats: statsData,
          metrics: metricsData,
          crmDashboard: crmDashboardData,
          recentTasks: tasksData?.tasks || [],
          recentTickets: ticketsData?.tickets || [],
          upcomingMeetings: (meetingsData?.data?.meetings || meetingsData?.meetings || []).slice(0, 6),
          projects: (projectsData?.data?.projects || projectsData?.projects || []).slice(0, 8),
          taskHealth: healthData,
          taskExtensions: extensionData,
          teamCompletion: teamData,
          attendanceToday: attendanceRes?.data || null,
          eodToday: eodTodayRes,
          attendanceStats: attendanceRes?.data || null,
          revenueMode,
        }
        sessionStorage.setItem('syntask-dashboard-cache', JSON.stringify(cachePayload))
      } catch (e) {
        // ignore storage errors
      }
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      if (isMounted()) setLoading(false)
    }
  }, [user?.role, revenueMode])

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!active) return;
      await refreshDashboard(() => active);
    };
    run();

    // Event listeners for instant updates after user actions (tasks, projects, CRM).
    // NOTE: 10s interval polling was removed as the PRIMARY CAUSE of the infinite
    // API loop. Event-driven sync is sufficient: components dispatch these events
    // after successful create/update/delete operations.
    // The cascade that previously made this dangerous (NotificationBell dispatching
    // on every poll) has been eliminated.
    const handleLiveSync = () => {
      if (active) refreshDashboard(() => active);
    };
    window.addEventListener('syntask:tasks-updated', handleLiveSync);
    window.addEventListener('syntask:projects-updated', handleLiveSync);
    window.addEventListener('syntask:data-updated', handleLiveSync);

    return () => {
      active = false;
      window.removeEventListener('syntask:tasks-updated', handleLiveSync);
      window.removeEventListener('syntask:projects-updated', handleLiveSync);
      window.removeEventListener('syntask:data-updated', handleLiveSync);
    };
  }, [refreshDashboard]);

  // Fetch workspace and content calendar data for dashboard widgets
  useEffect(() => {
    let active = true;
    const fetchCalendarData = async () => {
      setCalendarLoading(true);
      try {
        const today = timeService.now();
        const startStr = format(today, 'yyyy-MM-dd');
        const endStr = format(addDays(today, 30), 'yyyy-MM-dd');
        const { data: workspaceResp } = await calendarApi.getEvents({
          start_date: startStr,
          end_date: endStr,
          view_type: 'my_calendar',
        });
        const { data: contentResp } = await contentCalendarApi.getCalendar({
          start_date: startStr,
          end_date: endStr,
        });
        if (!active) return;
        const workspaceEvents = workspaceResp?.events || [];
        const contentEvents = contentResp?.events || [];
        if (active) setWorkspaceEvents(workspaceEvents)
        const todayStr = format(today, 'yyyy-MM-dd');

        setTodayEvents(workspaceEvents.filter((e) => e.start === todayStr));
        setTodayContent(contentEvents.filter((e) => e.start === todayStr));

        const upcomingDead = workspaceEvents.filter((e) => {
          if (e.type !== 'task_due' || !e.start) return false;
          const dueDate = timeService.instant(e.start);
          return dueDate > today && dueDate <= addDays(today, 3) && e.status !== 'completed';
        });
        setUpcomingDeadlines(upcomingDead);

        const upcomingMeet = workspaceEvents.filter((e) => {
          if (e.type !== 'meeting' || !e.start) return false;
          const meetDate = timeService.instant(e.start);
          return meetDate >= today;
        });
        setUpcomingMeetingsList(upcomingMeet);

        const overdue = workspaceEvents.filter((e) => {
          if (e.type !== 'task_due' || !e.start) return false;
          const dueDate = timeService.instant(e.start);
          return dueDate < today && e.status !== 'completed';
        });
        setOverdueTasksList(overdue);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load calendar data');
      } finally {
        if (active) setCalendarLoading(false);
      }
    };
    fetchCalendarData();
    return () => {
      active = false;
    };
  }, [refreshDashboard]);

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

  const todayLabel = useMemo(() => timeService.formatPattern(timeService.now(), 'EEEE, MMM d').toUpperCase(), [])

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
      <div className="space-y-4 p-4 md:p-5">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-violet-600 to-fuchsia-600 px-4 py-3 text-white shadow-lg">
          <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-1.5 backdrop-blur-sm">
                <LayoutDashboard className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-base font-bold leading-tight md:text-lg">Dashboard</h1>
                <p className="text-[11px] text-indigo-100">Loading workspace overview...</p>
              </div>
            </div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <SkeletonCard key={item} lines={3} />)}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <SkeletonCard lines={6} />
          <SkeletonCard lines={6} />
        </div>
        <SkeletonTable rows={5} cols={4} />
      </div>
    )
  }

  const role = normalizeRole(stats?.role || user?.role)
  const canSeeSalesWidgets = [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.MANAGER, ROLE.LEAD, ROLE.SUPER_ADMIN].includes(role)
  const taskSource = recentTasks
  const priorityTasks = [...recentTasks].filter((task) => ['critical', 'high'].includes((task.priority || '').toLowerCase())).slice(0, 5)
  const salesSummary = crmDashboard?.sales || {}
  const salesAnalytics = crmDashboard?.analytics || {}
  const revenueTimeline = Array.isArray(salesSummary?.closed_vs_target?.months) ? salesSummary.closed_vs_target.months : []
  const closedSeries = Array.isArray(salesSummary?.closed_vs_target?.closed) ? salesSummary.closed_vs_target.closed : []
  const targetSeries = Array.isArray(salesSummary?.closed_vs_target?.target) ? salesSummary.closed_vs_target.target : []
  
  const funnelData = canSeeSalesWidgets
    ? (Array.isArray(salesSummary?.pipeline?.stage_breakdown) && salesSummary.pipeline.stage_breakdown.length
      ? salesSummary.pipeline.stage_breakdown.map((item) => ({
          name: item.stage,
          value: item.count ?? 0,
          route: item.stage === 'Lead' ? '/crm/leads' : '/crm/pipeline',
        }))
      : [
          { name: 'New Leads', value: metrics?.new_leads ?? 0, route: '/crm/leads' },
          { name: 'Qualified', value: metrics?.qualified_leads ?? 0, route: '/crm/pipeline' },
          { name: 'Active Deals', value: metrics?.active_deals ?? 0, route: '/crm/pipeline' },
          { name: 'Won', value: metrics?.won_deals ?? 0, route: '/crm/pipeline' },
          { name: 'Lost', value: metrics?.lost_deals ?? 0, route: '/crm/pipeline' },
        ])
    : []

  const revenueTrendData = revenueTimeline.length
    ? revenueTimeline.map((label, index) => ({
        label,
        primary: revenueMode === 'Accrual' ? Number(closedSeries[index] || 0) : Number(targetSeries[index] || 0),
        secondary: revenueMode === 'Accrual' ? Number(targetSeries[index] || 0) : Number(closedSeries[index] || 0),
      }))
    : MONTH_LABELS.slice(0, timeService.now().getMonth() + 1).map((label, index) => ({
        label,
        primary: index === timeService.now().getMonth() ? Number(metrics?.revenue || 0) : 0,
        secondary: index === timeService.now().getMonth() ? Number(metrics?.won_deals || 0) : 0,
      }))

  const revenueTrend = canSeeSalesWidgets ? revenueTrendData : []
  const conversionData = canSeeSalesWidgets
    ? (Array.isArray(salesAnalytics?.kpis?.stage_conversion) && salesAnalytics.kpis.stage_conversion.length
        ? salesAnalytics.kpis.stage_conversion.map((item) => ({
            name: `${item.from} → ${item.to}`,
            value: item.conversion_percent ?? 0,
            route: '/crm/pipeline',
          }))
        : [
            { name: 'Lead', value: metrics?.total_leads ?? 0, route: '/crm/leads' },
            { name: 'Qualified', value: metrics?.qualified_leads ?? 0, route: '/crm/pipeline' },
            { name: 'Won', value: metrics?.won_deals ?? 0, route: '/crm/pipeline' },
          ])
    : []

  const monthlyPerformance = canSeeSalesWidgets
    ? revenueTrendData.map((item) => ({
        name: item.label,
        value: item.primary,
        route: '/crm/dashboard',
      }))
    : []

  const attendanceBreakdown = attendanceStats
    ? [
        { name: 'Working Now', value: attendanceStats.working_now ?? 0, route: '/live-monitor' },
        { name: 'On Break', value: attendanceStats.on_break ?? 0, route: '/live-monitor' },
        { name: 'Offline', value: attendanceStats.offline ?? 0, route: '/live-monitor' },
      ]
    : []

  const taskDuePriorityData = metrics?.task_due_priority_chart?.length ? metrics.task_due_priority_chart : buildTaskDuePriorityData(recentTasks)
  const projectHealthChartData = metrics?.project_status_chart?.length ? metrics.project_status_chart : buildProjectHealthData(projects)
  const reportTotals = metrics?.report_totals || {}
  const reportMetricCards = [
    { label: 'Total Tasks', value: reportTotals.tasks ?? recentTasks.length, route: '/tasks', color: 'indigo' },
    { label: 'Projects', value: reportTotals.projects ?? projects.length, route: '/projects', color: 'blue' },
    { label: 'Meetings', value: reportTotals.meetings ?? upcomingMeetings.length, route: '/meetings', color: 'emerald' },
    { label: role === ROLE.EMPLOYEE ? 'Requests' : 'Priority Items', value: role === ROLE.EMPLOYEE ? recentTickets.length : (reportTotals.high_priority ?? priorityTasks.length), route: role === ROLE.EMPLOYEE ? '/tickets' : '/tasks', color: 'amber' },
  ]
  const reportGraphData = metrics?.report_graph?.length ? metrics.report_graph : [
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
  const handleCardKeyNavigation = (event, route) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    navigate(route)
  }

  const healthColumns = [
    { key: 'name', header: 'Project' },
    { key: 'status', header: 'Status', render: (row) => <Badge label={row.status || 'active'} colorKey={row.status || 'active'} /> },
    { key: 'task_count', header: 'Tasks' },
    { key: 'delivery_date', header: 'Delivery', render: (row) => row.delivery_date ? timeService.formatPattern(row.delivery_date, 'MMM d') : '—' },
  ]

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
    { id: 'production-tracking', name: 'Production Tracking', available: [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.MANAGER, ROLE.SUPER_ADMIN].includes(role) && Boolean(productionDashboard) },
    { id: 'recent-activity', name: 'Recent Activity' },
    { id: 'calendar-overview', name: 'Calendar Overview' },
    { id: 'lead-follow-ups', name: 'Lead Follow-ups' },
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
    <div className="space-y-4 p-4 md:p-5 relative">
      {/* ============================================================ */}
      {/* HERO SECTION - Gradient with Glassmorphism */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-violet-600 to-fuchsia-600 px-4 py-3 text-white shadow-lg">
        {/* Decorative blur circles */}
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-white/5 blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-1.5 backdrop-blur-sm">
                <LayoutDashboard className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-base font-bold leading-tight md:text-lg">Dashboard</h1>
                <p className="text-[11px] text-indigo-100">
                  Command center for work, meetings, and AI briefings.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {role === ROLE.SUPER_ADMIN && (
                <button 
                  onClick={() => navigate('/companies')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  Create Company
                </button>
              )}
              <button 
                onClick={() => navigate('/projects')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <FolderKanban className="h-3.5 w-3.5" />
                Projects
              </button>
              <button 
                onClick={() => navigate('/tasks')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                Tasks
              </button>
              <button 
                onClick={() => navigate('/calendar')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Calendar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION VISIBILITY PANEL */}
      {/* ============================================================ */}
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

      {/* ============================================================ */}
      {/* WORKFLOW GUIDE */}
      {/* ============================================================ */}
      {renderDashboardSection('workflow-guide', (
        <WorkflowGuide
          title={role === ROLE.MANAGER ? 'Review team load, then assign the next task' : role === ROLE.LEAD ? 'Clear today\'s team work, then move the pipeline forward' : 'Focus on the highest-risk work first'}
          description={role === ROLE.MANAGER
            ? 'Use this screen to see workload balance, overdue work, and the next lead or task that should be assigned.'
            : role === ROLE.LEAD
              ? 'Use this screen to keep execution current so the team stays aligned on the next business action.'
              : 'Use this screen to keep the workspace moving without hunting through disconnected views.'}
          nextStep={role === ROLE.MANAGER
            ? 'Open tasks or CRM pipeline to assign the next owner.'
            : role === ROLE.LEAD
              ? 'Review today\'s work and clear blockers before they age.'
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

      {/* ============================================================ */}
      {/* WORKFLOW JOURNEY */}
      {/* ============================================================ */}
      {renderDashboardSection('workflow-journey', (
        <WorkflowJourney
          className="mb-6"
          description="This is the complete operating path in SynTask, from sign-in through revenue, delivery, reporting, and renewal."
        />
      ))}

      {/* ============================================================ */}
      {/* SNAPSHOT CARDS */}
      {/* ============================================================ */}
      {renderDashboardSection('snapshot-cards', (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="group rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Today</p>
            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{todayLabel}</p>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">Quick access to work, meetings, and AI guidance.</p>
          </div>
          <div className="group rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Today's Events</p>
            <div className="mt-1 space-y-1">
              {todayEvents.slice(0, 3).map((e) => (
                <p key={e.id} className="text-xs truncate text-gray-700 dark:text-gray-300">{e.title} ({e.type})</p>
              ))}
              {todayEvents.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500">No events today</p>
              )}
            </div>
          </div>
          <div className="group rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Upcoming Deadlines</p>
            <div className="mt-1 space-y-1">
              {upcomingDeadlines.slice(0, 3).map((e) => (
                <p key={e.id} className="text-xs truncate text-gray-700 dark:text-gray-300">{e.title} - {e.start}</p>
              ))}
              {upcomingDeadlines.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500">No deadlines soon</p>
              )}
            </div>
          </div>
          <div className="group rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Upcoming Meetings</p>
            <div className="mt-1 space-y-1">
              {upcomingMeetingsList.slice(0, 3).map((e) => (
                <p key={e.id} className="text-xs truncate text-gray-700 dark:text-gray-300">{e.title} - {e.start}</p>
              ))}
              {upcomingMeetingsList.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500">No meetings scheduled</p>
              )}
            </div>
          </div>
          <div className="group rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">High-Priority Tasks</p>
              <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{priorityTasks.length}</p>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">Critical and high-priority work in progress.</p>
          </div>
          <div className="group rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Attendance Focus</p>
              <TrendingUp className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
              {role === ROLE.EMPLOYEE ? (attendanceToday?.status || 'Pending') : (attendanceStats?.present_today ?? 0)}
            </p>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
              {role === ROLE.EMPLOYEE ? 'Your latest attendance status.' : 'People present today.'}
            </p>
          </div>
          {role === ROLE.EMPLOYEE && (
            <div className="group rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Today's EOD</p>
                <Badge label={eodStatusLabel} colorKey={eodToday?.status === 'submitted' ? 'active' : eodToday?.status === 'leave' ? 'pending' : 'draft'} />
              </div>
              <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{eodStatusLabel}</p>
              <button 
                className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700"
                onClick={() => navigate('/eod')}
              >
                {eodToday?.status === 'submitted' ? "Edit Today's EOD" : "Submit Today's EOD"}
              </button>
            </div>
          )}
        </section>
      ))}

      {/* ============================================================ */}
      {/* TASK HEALTH */}
      {/* ============================================================ */}
      {renderDashboardSection('task-health', (
        <section
          role="button"
          tabIndex={0}
          aria-label="Open Task Health in Tasks"
          onClick={() => navigate('/tasks')}
          onKeyDown={(event) => handleCardKeyNavigation(event, '/tasks')}
          className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 cursor-pointer dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Task Health</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {role === ROLE.EMPLOYEE ? 'Your assigned task status and extension requests.' : 'Team deadline pressure and extension workflow.'}
              </p>
            </div>
            <button 
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              onClick={(event) => {
                event.stopPropagation()
                navigate('/tasks')
              }}
            >
              Open Tasks
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {role === ROLE.EMPLOYEE ? (
              <>
                <TaskHealthCard label="Assigned" value={healthSummary?.total_assigned_tasks ?? 0} />
                <TaskHealthCard label="Completed" value={healthSummary?.completed_tasks ?? 0} tone="success" />
                <TaskHealthCard label="Pending" value={healthSummary?.pending_tasks ?? 0} tone="warning" />
                <TaskHealthCard label="Overdue" value={healthSummary?.overdue_tasks ?? 0} tone="danger" />
                <TaskHealthCard label="Extension Requests" value={extensionSummary.pending ?? healthSummary?.extension_requests?.pending ?? 0} tone="warning" />
              </>
            ) : (
              <>
                <TaskHealthCard label="Team Overdue Tasks" value={healthSummary?.overdue ?? 0} tone="danger" />
                <TaskHealthCard label="Pending Extension Requests" value={extensionSummary.pending ?? 0} tone="warning" />
                <TaskHealthCard label="Tasks Due Today" value={healthSummary?.due_today ?? 0} tone="success" />
                <TaskHealthCard label="Highest Pending Work" value={highestPendingEmployee?.pending_tasks ?? 0} helper={highestPendingEmployee?.employee_name || 'No employee load'} tone="warning" />
                <TaskHealthCard label="Completed Tasks" value={(teamCompletion?.employees || []).reduce((sum, item) => sum + (item.completed_tasks || 0), 0)} tone="success" />
              </>
            )}
          </div>
        </section>
      ))}

      {/* ============================================================ */}
      {/* REVENUE & PIPELINE */}
      {/* ============================================================ */}
      {renderDashboardSection('sales-pipeline', (
        canSeeSalesWidgets ? (
          <section className="grid gap-6 xl:grid-cols-2">
            <Suspense fallback={<div className="h-72 flex items-center justify-center">Loading chart...</div>}>
              <IncomeExpenseBarChart
                title="Revenue and Deals"
                data={revenueTrend}
                primaryLabel="Closed Revenue"
                secondaryLabel="Pipeline Value"
                primaryTotal={`₹${(metrics?.revenue ?? 0).toLocaleString('en-IN')}`}
                secondaryTotal={`₹${revenueTrend.reduce((sum, item) => sum + (Number(item.secondary) || 0), 0).toLocaleString('en-IN')}`}
                toggleOptions={['Accrual', 'Cash']}
                activeToggle={revenueMode}
                onToggle={setRevenueMode}
                footnote="Closed revenue and pipeline value use CRM lead/deal records for the last 12 months."
                onBarClick={() => navigate('/crm/pipeline')}
              />
            </Suspense>
            <Suspense fallback={<div className="h-72 flex items-center justify-center">Loading chart...</div>}>
              <DonutLegendChart title="Pipeline Funnel" data={funnelData.map((item) => ({ ...item, route: item.route || (item.name === 'New Leads' ? '/crm/leads' : '/crm/pipeline') }))} emptyLabel="No pipeline activity yet" onItemClick={(item) => navigateFromChart(item, '/crm/pipeline')} />
            </Suspense>
          </section>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Role-based view</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Sales charts are hidden for this role. Operational widgets remain available below.</p>
          </div>
        )
      ))}

      {/* ============================================================ */}
      {/* SALES PERFORMANCE */}
      {/* ============================================================ */}
      {renderDashboardSection('sales-performance', (
        <section className="grid gap-6 xl:grid-cols-2">
          {canSeeSalesWidgets ? (
            <>
              <ChartCard title="Stage Conversion">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={conversionData} onClick={(state) => navigateFromChart(state?.activePayload?.[0], '/crm/pipeline')}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.15} />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(value) => `${value}%`} />
                      <ChartTooltip valueFormatter={(value) => `${value}%`} />
                      <Line type="monotone" dataKey="value" name="Conversion" stroke="#FF8A4C" strokeWidth={3} dot={{ r: 5, fill: '#FF8A4C', cursor: 'pointer' }} activeDot={{ r: 7, onClick: (_, item) => navigateFromChart(item, '/crm/pipeline') }} />
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
                      <ChartTooltip valueFormatter={(value, key, item) => key === 'value' && item?.payload?.total !== undefined ? `${value} current / ${item.payload.total} total` : value} />
                      <Bar dataKey="value" name="Current" fill="#2FB47C" radius={[6, 6, 0, 0]} maxBarSize={40} className="cursor-pointer" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </>
          ) : (
            <ChartCard title="Monthly Performance">
              <div className="flex h-72 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                This chart is available to sales-oriented roles only.
              </div>
            </ChartCard>
          )}
        </section>
      ))}

      {/* ============================================================ */}
      {/* REPORTS */}
      {/* ============================================================ */}
      {renderDashboardSection('reports', (
        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {reportMetricCards.map((metric) => (
              <button
                key={metric.label}
                type="button"
                onClick={() => navigate(metric.route)}
                className="group rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm transition-all hover:shadow-md hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700"
                aria-label={`Open ${metric.label} report`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{metric.label}</p>
                  <div className={`rounded-lg bg-gradient-to-r ${metric.color === 'indigo' ? 'from-indigo-500 to-purple-500' : metric.color === 'blue' ? 'from-blue-500 to-cyan-500' : metric.color === 'emerald' ? 'from-emerald-500 to-teal-500' : 'from-amber-500 to-orange-500'} p-1.5 text-white shadow-lg`}>
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </div>
                <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{metric.value}</p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Open detailed report</p>
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

      {/* ============================================================ */}
      {/* EMPLOYEE ATTENDANCE */}
      {/* ============================================================ */}
      {renderDashboardSection('employee-attendance', (
        role === ROLE.EMPLOYEE && attendanceToday ? (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Attendance Status</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-base font-bold text-gray-900 dark:text-white">{attendanceToday.status}</span>
                <Badge label={attendanceToday.status} colorKey={attendanceToday.status} />
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Working Hours Today</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white font-mono">
                {formatDuration(attendanceToday.total_working_hours)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Camera Status</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Permission</span>
                <Badge
                  label={attendanceToday.camera_permission_status || 'Denied'}
                  colorKey={attendanceToday.camera_permission_status === 'Connected' || attendanceToday.camera_permission_status === 'Granted' ? 'active' : 'rejected'}
                />
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Screen Share</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</span>
                <Badge
                  label={attendanceToday.screen_sharing_status || 'Denied'}
                  colorKey={attendanceToday.screen_sharing_status === 'Sharing' || attendanceToday.screen_sharing_status === 'Granted' ? 'active' : 'rejected'}
                />
              </div>
            </div>
          </section>
        ) : null
      ))}

      {/* ============================================================ */}
      {/* WORKPLACE ATTENDANCE */}
      {/* ============================================================ */}
      {renderDashboardSection('workplace-attendance', (
        role !== ROLE.EMPLOYEE && attendanceStats ? (
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-sm dark:border-indigo-900/60 dark:bg-indigo-950/20 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center text-sm font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                <span className="relative mr-2 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500"></span>
                </span>
                Workplace Attendance & Monitoring
              </h3>
              <button 
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 transition hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                onClick={() => navigate('/live-monitor')}
              >
                Live Monitor Board
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
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
                      className="group rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md hover:scale-[1.02] hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700"
                    >
                      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
                      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
                    </button>
                  ))}
                </div>
              </ChartCard>
            </div>
          </section>
        ) : null
      ))}

      {/* ============================================================ */}
      {/* AI BRIEFING CENTER */}
      {/* ============================================================ */}
      {renderDashboardSection('ai-briefing', (
        <AIBriefingCenter user={user} stats={stats} recentTasks={recentTasks} recentTickets={recentTickets} />
      ))}

      {/* ============================================================ */}
      {/* WORK & MEETINGS */}
      {/* ============================================================ */}
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
                        dataKey={taskDuePriorityData?.[0]?.count !== undefined ? 'name' : 'shortName'}
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
                        label={{ value: taskDuePriorityData?.[0]?.count !== undefined ? 'Tasks' : 'Days remaining', angle: -90, position: 'insideLeft', style: { fill: '#9ca3af', fontSize: 11 } }}
                      />
                      <ChartTooltip labelFormatter={(_, point) => point.name} valueFormatter={(value, key) => key === 'daysRemaining' ? `${value} day${value === 1 ? '' : 's'}` : value} />
                      <Bar dataKey={taskDuePriorityData?.[0]?.count !== undefined ? 'count' : 'daysRemaining'} name={taskDuePriorityData?.[0]?.count !== undefined ? 'Tasks' : 'Days Remaining'} radius={[6, 6, 0, 0]} maxBarSize={44} className="cursor-pointer">
                        {taskDuePriorityData.map((entry) => (
                          <Cell key={entry.id || entry.name} fill={entry.fill || TASK_PRIORITY_COLORS[entry.priorityKey] || '#2FB47C'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-72 items-center justify-center text-sm text-gray-500 dark:text-gray-400">No dated tasks in the next week</div>
              )}
              <div className="mt-4 flex flex-wrap gap-3 border-t border-gray-200 pt-4 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                {Object.entries(TASK_PRIORITY_COLORS).map(([priority, color]) => (
                  <span key={priority} className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                    {priority.replace(/\b\w/g, (letter) => letter.toUpperCase())}
                  </span>
                ))}
              </div>
            </ChartCard>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">Today's Work</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">High-signal items that need attention now.</p>
                </div>
                <button 
                  className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                  onClick={() => navigate(role === ROLE.EMPLOYEE ? '/tickets' : '/tasks')}
                >
                  View all
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2">
                {taskSource.length ? taskSource.slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(role === ROLE.EMPLOYEE ? '/tickets' : '/tasks')}
                    className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50/50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/20"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{item.title}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {role === ROLE.EMPLOYEE ? `Created ${item.created_at ? timeService.formatMonthDay(item.created_at) : 'recently'}` : item.due_date ? `Due ${timeService.formatMonthDay(item.due_date)}` : 'No due date'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Badge label={item.status?.replace(/_/g, ' ') || 'open'} colorKey={item.status || 'open'} />
                      {item.priority && <Badge label={item.priority} colorKey={item.priority} />}
                    </div>
                  </button>
                )) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <CheckSquare className="h-10 w-10 text-gray-300 dark:text-gray-600" />
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No work in view</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">No tasks or requests need your attention right now.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Upcoming Meetings</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Scheduled coordination and client calls.</p>
              </div>
              <button 
                className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                onClick={() => navigate('/meetings')}
              >
                Open
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              {upcomingMeetings.length ? upcomingMeetings.map((meeting) => (
                <div key={meeting.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{meeting.title}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {meeting.meeting_date ? timeService.formatShortDateTime(meeting.meeting_date) : 'Date not set'}
                  </p>
                  {meeting.status && <div className="mt-2"><Badge label={meeting.status} colorKey={meeting.status} /></div>}
                </div>
              )) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Calendar className="h-10 w-10 text-gray-300 dark:text-gray-600" />
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No meetings</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Create the next meeting from the meetings workspace.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      ))}

      {/* ============================================================ */}
      {/* LEAD FOLLOW-UPS */}
      {/* ============================================================ */}
      {renderDashboardSection('lead-follow-ups', (
        <section className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700 mb-6">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Lead Follow-ups</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Upcoming scheduled lead follow-ups for the next 30 days.</p>
            </div>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              onClick={() => navigate('/crm/leads')}
            >
              View Leads
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-2">
            {workspaceEvents.filter((e) => e.type === 'follow_up' && e.start).slice(0, 6).map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-md border border-gray-100 p-2">
                <div>
                  <a onClick={() => navigate(e.lead_id ? `/crm/leads/${e.lead_id}` : '/crm/leads')} className="font-medium text-gray-900 dark:text-white hover:underline cursor-pointer">{e.lead_name || e.title}</a>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{e.start} · {e.assignee || 'Unassigned'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {e.phone ? (
                    <a href={`tel:${e.phone}`} className="text-xs text-indigo-600 hover:underline">{e.phone}</a>
                  ) : (
                    <span className="text-xs text-gray-400">No phone</span>
                  )}
                </div>
              </div>
            ))}
            {workspaceEvents.filter((e) => e.type === 'follow_up' && e.start).length === 0 && (
              <p className="text-xs text-gray-400">No upcoming lead follow-ups</p>
            )}
          </div>
        </section>
      ))}

      {/* ============================================================ */}
      {/* PROJECT HEALTH */}
      {/* ============================================================ */}
      {renderDashboardSection('project-health', (
        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Project Health</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Current projects in the workspace.</p>
              </div>
              {hasCompanyAdminAccess(role) && (
                <button 
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  onClick={handleExport} 
                  disabled={exporting}
                >
                  <Download className="h-3.5 w-3.5" />
                  {exporting ? 'Exporting...' : 'Export'}
                </button>
              )}
            </div>
            {projects.length ? <Table columns={healthColumns} data={projects} /> : 
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FolderKanban className="h-10 w-10 text-gray-300 dark:text-gray-600" />
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No projects</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">Projects will appear here once they are created.</p>
              </div>
            }
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
              <div className="flex h-72 items-center justify-center text-sm text-gray-500 dark:text-gray-400">No projects to chart yet</div>
            )}
          </ChartCard>
        </section>
      ))}

      {/* ============================================================ */}
      {/* PRODUCTION TRACKING */}
      {/* ============================================================ */}
      {renderDashboardSection('production-tracking', (
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <SectionHeader
            icon={Target}
            title="Production Tracking"
            description="Team production progress across quantitative tasks"
          />
          <div className="p-5">
            {productionDashboard?.employees?.length ? (
              <div className="space-y-6">
                {/* Team aggregate */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-4 text-center dark:border-purple-900/40 dark:bg-purple-950/20">
                    <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{productionDashboard.team_total_target || 0}</p>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Team Target</p>
                  </div>
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 text-center dark:border-indigo-900/40 dark:bg-indigo-950/20">
                    <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{productionDashboard.team_total_completed || 0}</p>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Team Completed</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-center dark:border-amber-900/40 dark:bg-amber-950/20">
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{productionDashboard.team_completion_percentage || 0}%</p>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Completion</p>
                  </div>
                </div>

                {/* Team progress bar */}
                <div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, productionDashboard.team_completion_percentage || 0)}%` }}
                    />
                  </div>
                </div>

                {/* Per-employee cards */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {productionDashboard.employees.map((emp) => {
                    const pct = emp.completion_percentage || 0
                    return (
                      <div key={emp.employee_id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-900">
                        <div className="mb-2 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{emp.employee_name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{emp.department || 'No department'}</p>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                            🎯 {emp.measurement_label || emp.measurement_type || 'Quant'}
                          </span>
                        </div>
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span className="text-gray-600 dark:text-gray-400">{emp.completed_quantity} / {emp.target_quantity}</span>
                          <span className="font-semibold text-gray-900 dark:text-white">{pct}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        {emp.task_title && (
                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 truncate" title={emp.task_title}>
                            {emp.task_title}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Target className="h-12 w-12 text-gray-300 dark:text-gray-600" />
                <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">No production data yet</p>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  Create quantitative tasks and track progress to see production metrics here.
                </p>
              </div>
            )}
          </div>
        </section>
      ))}

      {/* ============================================================ */}
      {/* RECENT ACTIVITY */}
      {/* ============================================================ */}
      {renderDashboardSection('recent-activity', (
        <section className="grid gap-6 xl:grid-cols-1">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Recent Activity</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Latest changes across your workspace.</p>
            <div className="mt-4 space-y-3">
              {(role === ROLE.EMPLOYEE ? recentTickets : recentTasks).slice(0, 5).map((item) => (
                <div key={item.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{item.title}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {item.updated_at ? timeService.formatShortDateTime(item.updated_at) : item.created_at ? timeService.formatShortDateTime(item.created_at) : 'Recently'}
                  </p>
                </div>
              ))}
              {((role === ROLE.EMPLOYEE ? recentTickets : recentTasks).length === 0) && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Activity className="h-10 w-10 text-gray-300 dark:text-gray-600" />
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No recent activity</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Activity will appear here as work changes.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}

export default Dashboard
