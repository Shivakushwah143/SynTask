import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  LogIn,
  LogOut,
  PencilLine,
  RotateCcw,
  Trash2,
  UserPlus,
  Users,
  Activity,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { format } from 'date-fns'
import { timelineAPI } from '../api/timeline'
import { usersAPI } from '../api/users'
import { useAuthStore } from '../store/authStore'
import { hasCompanyAdminAccess, isLeadRole, isManagerRole } from '../utils/roles'

const EVENT_OPTIONS = [
  ['task_assigned', 'Task Assigned'],
  ['task_started', 'Task Started'],
  ['task_completed', 'Task Completed'],
  ['task_updated', 'Task Updated'],
  ['task_reopened', 'Task Reopened'],
  ['task_deleted', 'Task Deleted'],
  ['attendance_check_in', 'Attendance Check-In'],
  ['attendance_check_out', 'Attendance Check-Out'],
  ['meeting_created', 'Meeting Created'],
  ['meeting_joined', 'Meeting Joined'],
  ['meeting_completed', 'Meeting Completed'],
  ['leave_requested', 'Leave Requested'],
  ['leave_approved', 'Leave Approved'],
  ['leave_rejected', 'Leave Rejected'],
  ['leave_cancelled', 'Leave Cancelled'],
  ['leave_started', 'Leave Started'],
  ['leave_ended', 'Leave Ended'],
  ['wfh_approved', 'WFH Approved'],
  ['wfh_started', 'WFH Started'],
  ['wfh_ended', 'WFH Ended'],
]

const MODULE_OPTIONS = [
  ['task', 'Tasks'],
  ['attendance', 'Attendance'],
  ['meeting', 'Meetings'],
  ['leave', 'Leave'],
]

const EVENT_META = {
  task_assigned: { icon: UserPlus, tone: 'bg-blue-100 text-blue-700 dark:bg-blue-950/35 dark:text-blue-200' },
  task_started: { icon: Clock3, tone: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/35 dark:text-yellow-200' },
  task_completed: { icon: CheckCircle2, tone: 'bg-green-100 text-green-700 dark:bg-green-950/35 dark:text-green-200' },
  task_updated: { icon: PencilLine, tone: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/35 dark:text-indigo-200' },
  task_reopened: { icon: RotateCcw, tone: 'bg-orange-100 text-orange-700 dark:bg-orange-950/35 dark:text-orange-200' },
  task_deleted: { icon: Trash2, tone: 'bg-red-100 text-red-700 dark:bg-red-950/35 dark:text-red-200' },
  attendance_check_in: { icon: LogIn, tone: 'bg-green-100 text-green-700 dark:bg-green-950/35 dark:text-green-200' },
  attendance_check_out: { icon: LogOut, tone: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200' },
  meeting_created: { icon: CalendarClock, tone: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/35 dark:text-indigo-200' },
  meeting_joined: { icon: CalendarClock, tone: 'bg-blue-100 text-blue-700 dark:bg-blue-950/35 dark:text-blue-200' },
  meeting_completed: { icon: CheckCircle2, tone: 'bg-green-100 text-green-700 dark:bg-green-950/35 dark:text-green-200' },
  leave_requested: { icon: CalendarClock, tone: 'bg-blue-100 text-blue-700 dark:bg-blue-950/35 dark:text-blue-200' },
  leave_approved: { icon: CheckCircle2, tone: 'bg-green-100 text-green-700 dark:bg-green-950/35 dark:text-green-200' },
  leave_rejected: { icon: Trash2, tone: 'bg-red-100 text-red-700 dark:bg-red-950/35 dark:text-red-200' },
  leave_cancelled: { icon: RotateCcw, tone: 'bg-orange-100 text-orange-700 dark:bg-orange-950/35 dark:text-orange-200' },
  leave_started: { icon: LogIn, tone: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/35 dark:text-indigo-200' },
  leave_ended: { icon: LogOut, tone: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200' },
  wfh_approved: { icon: CheckCircle2, tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-200' },
  wfh_started: { icon: LogIn, tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-200' },
  wfh_ended: { icon: LogOut, tone: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200' },
}

// Stat Card Component
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
    <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  )
}

const Timeline = () => {
  const { user } = useAuthStore()
  const canChooseEmployee = hasCompanyAdminAccess(user?.role) || isLeadRole(user?.role) || isManagerRole(user?.role)
  const [selectedUserId, setSelectedUserId] = useState(user?.id || '')
  const [teamMembers, setTeamMembers] = useState([])
  const [filters, setFilters] = useState({ event_type: '', related_module: '', start_date: '', end_date: '' })
  const [events, setEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [skip, setSkip] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)

  const selectedUserName = useMemo(() => {
    const selected = teamMembers.find((item) => String(item.id) === String(selectedUserId))
    if (!selected) return `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'My timeline'
    return `${selected.first_name || ''} ${selected.last_name || ''}`.trim() || selected.email
  }, [selectedUserId, teamMembers, user])

  const fetchTimeline = useCallback(async (nextSkip = 0, append = false) => {
    if (!selectedUserId) return
    try {
      setLoading(true)
      const params = {
        skip: nextSkip,
        limit: 25,
        ...(filters.event_type ? { event_type: filters.event_type } : {}),
        ...(filters.related_module ? { related_module: filters.related_module } : {}),
        ...(filters.start_date ? { start_date: new Date(filters.start_date).toISOString() } : {}),
        ...(filters.end_date ? { end_date: new Date(`${filters.end_date}T23:59:59`).toISOString() } : {}),
      }
      const data = await timelineAPI.getEmployeeTimeline(selectedUserId, params)
      setEvents((current) => (append ? [...current, ...(data.events || [])] : data.events || []))
      setTotal(data.total || 0)
      setSkip(nextSkip)
    } catch (error) {
      console.error('Error loading timeline:', error)
      if (!append) setEvents([])
    } finally {
      setLoading(false)
    }
  }, [filters, selectedUserId])

  useEffect(() => {
    setSelectedUserId(user?.id || '')
  }, [user?.id])

  useEffect(() => {
    if (!canChooseEmployee) return
    const loadUsers = async () => {
      try {
        const data = hasCompanyAdminAccess(user?.role) || isManagerRole(user?.role)
          ? await usersAPI.listUsers(null, null, null, 0, 100)
          : await usersAPI.getMyTeam()
        const users = data.users || data.team_members || data.employees || []
        const self = user ? [{ id: user.id, first_name: user.first_name, last_name: user.last_name, email: user.email }] : []
        setTeamMembers([...self, ...users.filter((item) => String(item.id) !== String(user?.id))])
      } catch (error) {
        console.error('Error loading timeline users:', error)
      }
    }
    loadUsers()
  }, [canChooseEmployee, user])

  useEffect(() => {
    fetchTimeline(0, false)
  }, [fetchTimeline])

  // Calculate stats
  const uniqueModules = new Set(events.map(e => e.related_module)).size
  const uniqueEventTypes = new Set(events.map(e => e.event_type)).size
  const recentEvents = events.filter(e => {
    const date = new Date(e.timestamp)
    const now = new Date()
    const diff = (now - date) / (1000 * 60 * 60 * 24)
    return diff <= 7
  }).length

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">Timeline</h1>
              <p className="mt-1 text-indigo-100">Chronological employee activity feed</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {canChooseEmployee ? (
              <div className="relative">
                <select
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  className="rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/50"
                >
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id} className="text-gray-900">
                      {`${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <button
              onClick={() => fetchTimeline(0, false)}
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Events"
          value={total}
          icon={Activity}
          color="indigo"
          subtitle="All activities"
        />
        <StatCard
          label="Recent (7d)"
          value={recentEvents}
          icon={Clock3}
          color="emerald"
          subtitle="Last 7 days"
        />
        <StatCard
          label="Modules"
          value={uniqueModules}
          icon={Users}
          color="blue"
          subtitle="Active modules"
        />
        <StatCard
          label="Event Types"
          value={uniqueEventTypes}
          icon={Filter}
          color="amber"
          subtitle="Unique events"
        />
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
            <span className="font-semibold text-gray-700 dark:text-gray-300">Filters</span>
            {(filters.event_type || filters.related_module || filters.start_date || filters.end_date) && (
              <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                Active
              </span>
            )}
          </div>
          {showFilters ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </button>

        {showFilters && (
          <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 dark:border-gray-700 md:grid-cols-4">
            <select
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              value={filters.event_type}
              onChange={(event) => setFilters((current) => ({ ...current, event_type: event.target.value }))}
            >
              <option value="">All event types</option>
              {EVENT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              value={filters.related_module}
              onChange={(event) => setFilters((current) => ({ ...current, related_module: event.target.value }))}
            >
              <option value="">All modules</option>
              {MODULE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              type="date"
              value={filters.start_date}
              onChange={(event) => setFilters((current) => ({ ...current, start_date: event.target.value }))}
              placeholder="Start date"
            />
            <input
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              type="date"
              value={filters.end_date}
              onChange={(event) => setFilters((current) => ({ ...current, end_date: event.target.value }))}
              placeholder="End date"
            />
          </div>
        )}
      </div>

      {/* Timeline Events */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                <Activity className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">{selectedUserName}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{total} timeline events</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                Completed
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-400"></span>
                Started
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                Updated
              </span>
            </div>
          </div>
        </div>

        <div className="p-4">
          {loading && !events.length ? (
            <div className="flex h-48 items-center justify-center">
              <div className="text-center">
                <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-gray-500 dark:text-gray-400">Loading timeline...</p>
              </div>
            </div>
          ) : events.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                <Activity className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">No timeline events found</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Try adjusting your filters or date range.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {events.map((event) => <TimelineItem key={event.id} event={event} />)}
            </div>
          )}

          {events.length < total && (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                onClick={() => fetchTimeline(skip + 25, true)}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-gray-600 border-t-transparent rounded-full"></div>
                    Loading...
                  </>
                ) : (
                  'Load more'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const TimelineItem = ({ event }) => {
  const meta = EVENT_META[event.event_type] || { icon: Clock3, tone: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200' }
  const Icon = meta.icon
  const timestamp = new Date(event.timestamp)

  const getModuleColor = (module) => {
    const colors = {
      task: 'border-l-4 border-blue-500',
      attendance: 'border-l-4 border-green-500',
      meeting: 'border-l-4 border-purple-500',
      leave: 'border-l-4 border-amber-500',
    }
    return colors[module] || 'border-l-4 border-gray-400'
  }

  return (
    <div className={`relative pl-6 py-4 border-b border-gray-100 last:border-0 dark:border-gray-700 ${getModuleColor(event.related_module)}`}>
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 mt-1">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${meta.tone} shadow-sm`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-semibold text-gray-900 dark:text-white">{event.title}</p>
            <time className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
              {format(timestamp, 'h:mm a')}
            </time>
          </div>
          {event.description && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{event.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" />
              {format(timestamp, 'MMM d, yyyy')}
            </span>
            {event.related_module && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                {event.related_module}
              </span>
            )}
            {event.event_type && (
              <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                {EVENT_OPTIONS.find(([value]) => value === event.event_type)?.[1] || event.event_type}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Timeline