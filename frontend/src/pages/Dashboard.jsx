import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
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
import toast from 'react-hot-toast'
// AI Briefing Center is a large, below-the-fold widget — code-split it so its
// dependencies (framer-motion, AI icons, charts) load after first paint.
const AIBriefingCenter = lazy(() => import('../components/AIBriefingCenter'))
const WorkflowJourney = lazy(() => import('../components/workflow/WorkflowJourney'))
import { Badge, Table } from '../components/ui'
import { ROLE, hasCompanyAdminAccess, normalizeRole } from '../utils/roles'
import { attendanceAPI } from '../api/attendance'
import { useAttendanceStore } from '../store/attendanceStore'
import { eodAPI } from '../api/eod'
import { ChartTooltip } from '../components/charts/ChartTooltip'
import { WorkflowGuide } from '../components/workflow/WorkflowGuide'
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

const formatFollowUpPhone = (lead) => {
  const countryCode = (lead?.country_code || '').trim()
  const phone = lead?.phone || ''
  return phone ? `${countryCode ? `${countryCode} ` : ''}${phone}` : ''
}

const followUpDateTone = (value, now) => {
  const date = timeService.instant(value)
  if (!value || Number.isNaN(date.getTime())) return 'upcoming'
  if (date < now) return 'overdue'
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  return dateStart === todayStart ? 'today' : 'upcoming'
}

// ============================================================
// MAIN COMPONENT
// ============================================================
// Slice keys tracked per dashboard refresh. A section renders once every slice
// it depends on has settled, so one slow endpoint never blocks the rest.
const DASHBOARD_READY_KEYS = ['stats', 'tasks', 'meetings', 'projects', 'metrics', 'crm', 'followUps', 'health', 'extensions', 'dashboardHealth', 'tickets', 'attendance', 'eod', 'production', 'calendar']

// Compact per-section loading placeholder shown while a section's own data is
// still in flight (replaces the old full-page loader that gated the shell).
const SectionSkeleton = ({ lines = 3 }) => (
  <section className="animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div className="mb-4 h-4 w-44 rounded bg-gray-200 dark:bg-gray-700" />
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className={`h-3 rounded bg-gray-100 dark:bg-gray-700/60 ${index % 2 ? 'w-4/5' : 'w-full'}`} />
      ))}
    </div>
  </section>
)

const Dashboard = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
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
  const [sectionVisibility, setSectionVisibility] = useState(readStoredSectionVisibility)
  const [sectionOrder, setSectionOrder] = useState(readStoredSectionOrder)
  const [sectionPanelCollapsed, setSectionPanelCollapsed] = useState(getDefaultSectionPanelCollapsed)
  const [sectionSearch, setSectionSearch] = useState('')
  const [leadFollowUps, setLeadFollowUps] = useState([])
  // Reuse the attendance store (already fetched by AttendanceStatusBootstrap)
  // to avoid a duplicate /attendance/me/today request for employees. Read via a
  // ref so store updates never recreate refreshDashboard (which would re-run the
  // whole fan-out on every attendance change).
  const attendanceStoreRecord = useAttendanceStore((s) => s.record)
  const attendanceRecordRef = useRef(attendanceStoreRecord)
  attendanceRecordRef.current = attendanceStoreRecord

  // Per-slice readiness: sections render as their data settles (success or
  // failure), never gated behind the slowest endpoint of the whole dashboard.
  const [ready, setReady] = useState({})
  const markReady = useCallback((...keys) => {
    setReady((current) => {
      if (keys.every((key) => current[key])) return current
      const next = { ...current }
      keys.forEach((key) => { next[key] = true })
      return next
    })
  }, [])
  // Lives for the component mount. Effects re-arm it when they run and clear it
  // on cleanup: under React StrictMode the simulated cleanup+re-run happens
  // synchronously, so by the time responses land the flag is true again and
  // results commit — a real unmount leaves it false so stale responses are
  // ignored. This replaces per-effect `active` closures that froze the loader
  // when a StrictMode remount shared the in-flight refresh.
  const isMountedRef = useRef(true)

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
      setLeadFollowUps(cached.leadFollowUps || [])
      // The cached payload hydrates every slice at once — mark all sections
      // ready so nothing waits behind the silent background refresh.
      setReady((current) => {
        const hasAll = DASHBOARD_READY_KEYS.every((key) => current[key])
        if (hasAll) return current
        const next = { ...current }
        DASHBOARD_READY_KEYS.forEach((key) => { next[key] = true })
        return next
      })
    }
  }, [])

  // ── React-Query-style dedup ────────────────────────────────────────────
  // Concurrent full refreshes (mount + live-sync event races, StrictMode
  // double-effects) share ONE in-flight promise instead of doubling the
  // ~16-request fan-out.
  const inFlightRefreshRef = useRef(null)
  // ``revenueMode`` must NOT recreate refreshDashboard — that previously
  // re-ran the whole 16-request fan-out AND the calendar fetch on every
  // mode toggle. Read the latest value through a ref instead.
  const revenueModeRef = useRef(revenueMode)
  revenueModeRef.current = revenueMode

  const refreshDashboard = useCallback(async () => {
    // Dedup: share ONE in-flight refresh when mount + live-sync events (or
    // StrictMode double-effects) race, so the fan-out is never doubled. Results
    // commit through isMountedRef (never a per-effect closure), so the shared
    // run still applies state once the component is the live mount.
    if (inFlightRefreshRef.current) return inFlightRefreshRef.current
    const run = (async () => {
      // Draft of the session-cache snapshot; persisted only after every request
      // in this refresh settles so a partially-filled cache is never written.
      const cacheDraft = { revenueMode: revenueModeRef.current }

      const authRole = normalizeRole(user?.role || ROLE.EMPLOYEE)
      const isEmployee = authRole === ROLE.EMPLOYEE
      const isSuperAdmin = authRole === ROLE.SUPER_ADMIN
      const salesRoles = [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.MANAGER, ROLE.LEAD, ROLE.SUPER_ADMIN]
      const canLoadCrm = salesRoles.includes(authRole)
      const productionRoles = [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.MANAGER, ROLE.SUPER_ADMIN]
      const wave = []

      // Fire one slice and commit its result (and readiness) as soon as it
      // settles — never wait for the slowest request before rendering.
      const settle = (key, request, apply) => {
        const promise = Promise.resolve(request)
          .then((value) => {
            if (isMountedRef.current) {
              if (apply) apply(value)
              markReady(key)
            }
            return value
          })
          .catch(() => {
            if (isMountedRef.current) markReady(key)
            return null
          })
        wave.push(promise)
        return promise
      }

      // Role is known from the session, so /dashboard/stats is only requested
      // for super admins (it returns null for every other role) and every slice
      // below starts immediately — one wave, no sequential dependencies.
      if (isSuperAdmin) {
        settle('stats', dashboardAPI.getStats(), (value) => { setStats(value); cacheDraft.stats = value })
      } else {
        setStats({ role: authRole })
        cacheDraft.stats = { role: authRole }
        markReady('stats')
      }

      settle('metrics', dashboardAPI.getMetrics(), (value) => { setMetrics(value); cacheDraft.metrics = value })
      settle('tasks', tasksAPI.listTasks({ limit: 8 }), (value) => {
        const tasks = value?.tasks || []
        setRecentTasks(tasks)
        cacheDraft.recentTasks = tasks
      })
      settle('meetings', meetingsApi.list({ limit: 6, upcoming: true }), (value) => {
        const meetings = (value?.data?.meetings || value?.meetings || []).slice(0, 6)
        setUpcomingMeetings(meetings)
        cacheDraft.upcomingMeetings = meetings
      })
      settle('projects', projectsApi.getProjects({ limit: 8 }), (value) => {
        const projects = (value?.data?.projects || value?.projects || []).slice(0, 8)
        setProjects(projects)
        cacheDraft.projects = projects
      })

      if (canLoadCrm) {
        settle('crm', crmApi.getDashboard(), (value) => {
          const data = value?.data || value || null
          setCrmDashboard(data)
          cacheDraft.crmDashboard = data
        })
        settle('followUps', crmApi.getDashboardFollowUps(), (value) => {
          const leads = value?.data?.prospects || value?.prospects || []
          setLeadFollowUps(leads)
          cacheDraft.leadFollowUps = leads
        })
      } else {
        setCrmDashboard(null)
        setLeadFollowUps([])
        cacheDraft.crmDashboard = null
        cacheDraft.leadFollowUps = []
        markReady('crm', 'followUps')
      }

      if (isEmployee) {
        settle('health', tasksAPI.getMyTaskHealth(), (value) => { setTaskHealth(value); cacheDraft.taskHealth = value })
        settle('extensions', tasksAPI.getExtensionRequestSummary(), (value) => { setTaskExtensions(value); cacheDraft.taskExtensions = value })
      } else {
        // The combined /tasks/health/dashboard payload replaces the previous
        // health-summary + team-completion + extension triple request, which
        // scanned the same task dataset three times per dashboard load.
        settle('dashboardHealth', tasksAPI.getDashboardTaskHealth(), (value) => {
          const health = value?.summary ? { summary: value.summary } : null
          setTaskHealth(health)
          cacheDraft.taskHealth = health
          const team = value?.team_completion || null
          setTeamCompletion(team)
          cacheDraft.teamCompletion = team
          const extensions = value?.extension_summary ? { summary: value.extension_summary } : null
          setTaskExtensions(extensions)
          cacheDraft.taskExtensions = extensions
        })
      }

      if (isEmployee) {
        settle('tickets', ticketsAPI.listTickets({ limit: 8 }), (value) => {
          const tickets = value?.tickets || []
          setRecentTickets(tickets)
          cacheDraft.recentTickets = tickets
        })
        // Employee attendance comes from the shared attendance store, already
        // fetched by AttendanceStatusBootstrap — never duplicated here.
        settle('eod', eodAPI.today(), (value) => { setEodToday(value); cacheDraft.eodToday = value })
        setAttendanceToday(attendanceRecordRef.current || null)
        cacheDraft.attendanceToday = attendanceRecordRef.current || null
        markReady('attendance')
      } else {
        settle('attendance', attendanceAPI.getDashboardStats(), (value) => {
          const stats = value?.data || null
          setAttendanceStats(stats)
          cacheDraft.attendanceStats = stats
          cacheDraft.attendanceToday = stats
        })
        markReady('eod', 'tickets')
      }

      if (productionRoles.includes(authRole)) {
        settle('production', tasksAPI.getProductionDashboard(), (value) => { setProductionDashboard(value); cacheDraft.productionDashboard = value })
      } else {
        setProductionDashboard(null)
        cacheDraft.productionDashboard = null
        markReady('production')
      }

      await Promise.allSettled(wave)
      if (!isMountedRef.current) return
      // Stale‑while‑revalidate: persist the fully-hydrated snapshot.
      try {
        sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(cacheDraft))
      } catch (e) {
        // ignore storage errors
      }
    })()
    inFlightRefreshRef.current = run
    try {
      await run
    } finally {
      if (inFlightRefreshRef.current === run) inFlightRefreshRef.current = null
    }
    return run
  }, [user?.role, markReady])

  // Scoped refresh helpers: after a task/project mutation the dashboard only
  // re-fetches that slice (1 request) instead of re-firing the full fan-out.
  const updateCachedSlice = useCallback((patch) => {
    try {
      const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY)
      if (!raw) return
      sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({ ...JSON.parse(raw), ...patch }))
    } catch {
      // ignore storage errors
    }
  }, [])

  const refreshTaskSlice = useCallback(async () => {
    try {
      const tasksData = await tasksAPI.listTasks({ limit: 8 }).catch(() => null)
      if (!isMountedRef.current || !tasksData?.tasks) return
      setRecentTasks(tasksData.tasks)
      updateCachedSlice({ recentTasks: tasksData.tasks })
    } catch (error) {
      console.error('Error refreshing task slice:', error)
    }
  }, [updateCachedSlice])

  const refreshProjectSlice = useCallback(async () => {
    try {
      const projectsData = await projectsApi.getProjects({ limit: 8 }).catch(() => null)
      const projects = (projectsData?.data?.projects || projectsData?.projects || []).slice(0, 8)
      if (!isMountedRef.current) return
      setProjects(projects)
      updateCachedSlice({ projects })
    } catch (error) {
      console.error('Error refreshing project slice:', error)
    }
  }, [updateCachedSlice])

  useEffect(() => {
    // Re-arm the mounted flag for this (possibly StrictMode re-run) mount.
    isMountedRef.current = true
    refreshDashboard()

    // Event listeners for instant updates after user actions (tasks, projects, CRM).
    // NOTE: 10s interval polling was removed as the PRIMARY CAUSE of the infinite
    // API loop. Event-driven sync is sufficient: components dispatch these events
    // after successful create/update/delete operations.
    // The cascade that previously made this dangerous (NotificationBell dispatching
    // on every poll) has been eliminated.
    // Scoped sync: task/project mutations refresh only their own 1-request slice
    // instead of re-firing the full fan-out; generic data-updated events (CRM,
    // attendance, ...) still refresh the whole dashboard.
    const handleTasksUpdated = () => { refreshTaskSlice() }
    const handleProjectsUpdated = () => { refreshProjectSlice() }
    const handleDataUpdated = () => { refreshDashboard() }
    window.addEventListener('syntask:tasks-updated', handleTasksUpdated)
    window.addEventListener('syntask:projects-updated', handleProjectsUpdated)
    window.addEventListener('syntask:data-updated', handleDataUpdated)

    return () => {
      isMountedRef.current = false
      window.removeEventListener('syntask:tasks-updated', handleTasksUpdated)
      window.removeEventListener('syntask:projects-updated', handleProjectsUpdated)
      window.removeEventListener('syntask:data-updated', handleDataUpdated)
    }
  }, [refreshDashboard, refreshTaskSlice, refreshProjectSlice])

  // Workspace events drive the Today / Deadlines / Meetings snapshot cards.
  // The companion 30-day content-calendar request was removed: it only fed an
  // unused state value. This fetch is deduplicated so a StrictMode remount
  // issues exactly one request, and it marks the 'calendar' slice ready even on
  // failure so the snapshot section can render its empty state.
  const calendarInFlightRef = useRef(null)
  useEffect(() => {
    isMountedRef.current = true
    if (calendarInFlightRef.current) return
    const run = (async () => {
      try {
        const today = timeService.now();
        const startStr = format(today, 'yyyy-MM-dd');
        const endStr = format(addDays(today, 30), 'yyyy-MM-dd');
        const workspaceResult = await calendarApi.getEvents({
          start_date: startStr,
          end_date: endStr,
          view_type: 'my_calendar',
        });
        const { data: workspaceResp } = workspaceResult;
        if (!isMountedRef.current) return;
        const workspaceEvents = workspaceResp?.events || [];
        setWorkspaceEvents(workspaceEvents)
        const todayStr = format(today, 'yyyy-MM-dd');

        setTodayEvents(workspaceEvents.filter((e) => e.start === todayStr));

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

        markReady('calendar')
      } catch (err) {
        console.error(err);
        if (isMountedRef.current) markReady('calendar')
        toast.error('Failed to load calendar data');
      }
    })()
    calendarInFlightRef.current = run
    const clearRef = () => {
      if (calendarInFlightRef.current === run) calendarInFlightRef.current = null
    }
    run.then(clearRef, clearRef)
    return () => {
      isMountedRef.current = false
    }
    // Calendar events are independent of the dashboard payload — fetch once on
    // mount; never re-fire on role or revenue-mode toggles.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // NOTE: the whole-page loader was removed — the shell (hero + static guides)
  // renders immediately and each data section below shows its own local skeleton
  // until the slices it reads have settled (see renderSection / SectionSkeleton).

  const role = normalizeRole(stats?.role || user?.role)
  const canSeeSalesWidgets = [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.MANAGER, ROLE.LEAD, ROLE.SUPER_ADMIN].includes(role)
  // NOTE: plain computations, not hooks — they run after the loading early-return
  // so memoizing here would violate the Rules of Hooks.
  const followUpItems = role === ROLE.EMPLOYEE
    ? workspaceEvents
        .filter((event) => event.type === 'follow_up' && event.start)
        .map((event) => ({
          id: event.id,
          prospect_name: event.lead_name || event.title,
          company_name: event.company_name || '',
          next_follow_up_at: event.start,
          created_at: null,
          phone: event.phone_display || event.phone || '',
          owner_name: event.assignee || '',
          current_stage: event.status || '',
        }))
        .sort((a, b) => timeService.instantTime(a.next_follow_up_at) - timeService.instantTime(b.next_follow_up_at))
    : [...leadFollowUps]
        .filter((lead) => lead && lead.next_follow_up_at)
        .sort((a, b) => timeService.instantTime(a.next_follow_up_at) - timeService.instantTime(b.next_follow_up_at))

  const followUpNow = timeService.now()
  const followUpCounts = { overdue: 0, dueToday: 0 }
  followUpItems.forEach((item) => {
    const tone = followUpDateTone(item.next_follow_up_at, followUpNow)
    if (tone === 'overdue') followUpCounts.overdue += 1
    else if (tone === 'today') followUpCounts.dueToday += 1
  })
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
    { id: 'lead-follow-ups', name: 'Lead Follow-ups' },
    { id: 'workflow-guide', name: 'Workflow Guide' },
    { id: 'workflow-journey', name: 'Workflow Journey' },
    { id: 'snapshot-cards', name: 'Snapshot Cards' },
    { id: 'task-health', name: 'Task Health' },
    { id: 'sales-pipeline', name: 'Revenue & Pipeline' },
    { id: 'sales-performance', name: 'Sales Performance' },
    { id: 'reports', name: 'Reports' },
    { id: 'employee-attendance', name: 'My Attendance', available: role === ROLE.EMPLOYEE && Boolean(attendanceToday) },
    { id: 'workplace-attendance', name: 'Workplace Attendance', available: role !== ROLE.EMPLOYEE && (ready.attendance ? Boolean(attendanceStats) : true) },
    { id: 'ai-briefing', name: 'AI Briefing Center' },
    { id: 'work-meetings', name: 'Work & Meetings' },
    { id: 'project-health', name: 'Project Health' },
    { id: 'production-tracking', name: 'Production Tracking', available: [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.MANAGER, ROLE.SUPER_ADMIN].includes(role) && (ready.production ? Boolean(productionDashboard) : true) },
    { id: 'recent-activity', name: 'Recent Activity' },
    { id: 'calendar-overview', name: 'Calendar Overview' },
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

  // Progressive rendering: a section shows a compact local skeleton until every
  // slice it reads has settled, so a slow endpoint only delays its own section.
  const sectionReady = (requires) => requires.every((key) => ready[key])
  const renderSection = (sectionId, requires, contentFn) => {
    if (requires.length && !sectionReady(requires)) {
      return renderDashboardSection(sectionId, <SectionSkeleton />)
    }
    return renderDashboardSection(sectionId, contentFn())
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
      {/* LEAD FOLLOW-UPS */}
      {/* ============================================================ */}
      {renderSection('lead-follow-ups', role === ROLE.EMPLOYEE ? ['calendar'] : ['followUps'], () => (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                <Phone className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Lead Follow-ups</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Every lead with a follow-up scheduled — soonest first, with created date and mobile number.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge label={`${followUpItems.length} follow-up${followUpItems.length === 1 ? '' : 's'}`} colorKey={followUpItems.length ? 'active' : 'draft'} />
              {followUpCounts.dueToday > 0 && <Badge label={`${followUpCounts.dueToday} due today`} colorKey="pending" />}
              {followUpCounts.overdue > 0 && <Badge label={`${followUpCounts.overdue} overdue`} colorKey="rejected" />}
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                onClick={() => navigate('/crm/leads')}
              >
                View Leads
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {followUpItems.length ? (
            <div className="max-h-[420px] overflow-auto rounded-lg border border-gray-100 dark:border-gray-700">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Lead</th>
                    <th className="px-3 py-2 font-medium">Follow-up Date</th>
                    <th className="px-3 py-2 font-medium">Created</th>
                    <th className="px-3 py-2 font-medium">Mobile</th>
                    <th className="px-3 py-2 font-medium">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {followUpItems.map((lead) => {
                    const phoneDisplay = formatFollowUpPhone(lead)
                    const phoneHref = phoneDisplay ? `tel:${phoneDisplay.replace(/[^\d+]/g, '')}` : null
                    const tone = followUpDateTone(lead.next_follow_up_at, followUpNow)
                    return (
                      <tr
                        key={lead.id || lead.next_follow_up_at}
                        onClick={() => navigate(lead.id ? `/crm/leads/${lead.id}` : '/crm/leads')}
                        className="cursor-pointer transition-colors hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20"
                      >
                        <td className="px-3 py-2">
                          <p className="truncate font-medium text-gray-900 dark:text-white">{lead.prospect_name || lead.company_name || 'Unnamed lead'}</p>
                          {lead.company_name && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{lead.company_name}</p>}
                        </td>
                        <td className="px-3 py-2">
                          <p className={`font-medium ${tone === 'overdue' ? 'text-rose-600 dark:text-rose-400' : tone === 'today' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
                            {timeService.formatPattern(lead.next_follow_up_at, 'MMM d, yyyy')}
                          </p>
                          {lead.next_action && <p className="max-w-[220px] truncate text-xs text-gray-500 dark:text-gray-400">{lead.next_action}</p>}
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                          {lead.created_at ? timeService.formatPattern(lead.created_at, 'MMM d, yyyy') : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {phoneHref ? (
                            <a href={phoneHref} onClick={(event) => event.stopPropagation()} className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400" title={`Call ${phoneDisplay}`}>
                              <Phone className="h-3 w-3" />
                              {phoneDisplay}
                            </a>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Badge label={lead.current_stage || 'Unstaged'} colorKey={lead.current_stage || 'draft'} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Phone className="h-6 w-6 text-gray-300 dark:text-gray-600" />
              <p className="text-xs text-gray-400 dark:text-gray-500">No leads with follow-ups yet. Set a follow-up on any lead and it will show up here.</p>
            </div>
          )}
        </section>
      ))}

      {/* ============================================================ */}
      {/* WORKFLOW GUIDE */}
      {/* ============================================================ */}
      {renderSection('workflow-guide', [], () => (
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
      {renderSection('workflow-journey', [], () => (
        <WorkflowJourney
          className="mb-6"
          description="This is the complete operating path in SynTask, from sign-in through revenue, delivery, reporting, and renewal."
        />
      ))}

      {/* ============================================================ */}
      {/* SNAPSHOT CARDS */}
      {/* ============================================================ */}
      {renderSection('snapshot-cards', role === ROLE.EMPLOYEE ? ['tasks', 'calendar', 'eod'] : ['tasks', 'calendar', 'attendance'], () => (
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
      {renderSection('task-health', role === ROLE.EMPLOYEE ? ['health', 'extensions'] : ['dashboardHealth'], () => (
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
      {renderSection('sales-pipeline', role === ROLE.EMPLOYEE ? [] : ['crm', 'metrics'], () => (
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
      {renderSection('sales-performance', role === ROLE.EMPLOYEE ? [] : ['crm', 'metrics'], () => (
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
      {renderSection('reports', ['metrics'], () => (
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
      {renderSection('employee-attendance', [], () => (
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
      {renderSection('workplace-attendance', ['attendance'], () => (
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
      {renderSection('ai-briefing', role === ROLE.EMPLOYEE ? ['tasks', 'tickets'] : ['tasks'], () => (
        <Suspense fallback={null}>
          <AIBriefingCenter user={user} stats={stats} recentTasks={recentTasks} recentTickets={recentTickets} />
        </Suspense>
      ))}

      {/* ============================================================ */}
      {/* WORK & MEETINGS */}
      {/* ============================================================ */}
      {renderSection('work-meetings', ['tasks', 'meetings'], () => (
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
                        label={{ value: taskDuePriorityData?.[0]?.count !== undefined ? 'Tasks' : 'Days remaining', angle: -90, position: 'insideLeft', style: { fill: 'var(--color-app-text-muted)', fontSize: 11 } }}
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


      {/* ============================================================ */}
      {/* PROJECT HEALTH */}
      {/* ============================================================ */}
      {renderSection('project-health', ['projects', 'metrics'], () => (
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
      {renderSection('production-tracking', ['production'], () => (
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
      {renderSection('recent-activity', role === ROLE.EMPLOYEE ? ['tickets'] : ['tasks'], () => (
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
