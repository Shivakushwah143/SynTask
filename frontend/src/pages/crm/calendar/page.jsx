import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Filter, Repeat, Search, LayoutGrid, List, Calendar, Activity, Users, Briefcase, Mail, Phone, Star } from 'lucide-react'
import { addDays, addMonths, addWeeks, format, isSameDay, isSameMonth, isSameWeek, parseISO, startOfDay, isValid } from 'date-fns'
import { activityAPI } from '../../../api/activity'
import { meetingsApi } from '../../../api/meetings'
import { tasksAPI } from '../../../api/tasks'
import { usersAPI } from '../../../api/users'
import { CRMEmptyState, CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'
import { Badge, Button, Skeleton } from '../../../components/ui'
import { timeService } from '@/services/timeService'

const CALENDAR_QUERY_KEY = 'crm-calendar'
const VIEW_OPTIONS = ['month', 'week', 'day', 'agenda']

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

export const getCalendarCursorDate = (date, view, direction) => {
  if (view === 'month') return addMonths(date, direction)
  if (view === 'week' || view === 'agenda') return addWeeks(date, direction)
  return addDays(date, direction)
}

export const getCalendarCursorLabel = (date, view) => {
  if (view === 'month') return format(date, 'MMMM yyyy')
  if (view === 'week' || view === 'agenda') return `Week of ${format(date, 'MMM d, yyyy')}`
  return format(date, 'MMM d, yyyy')
}

const isMongoObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ''))

export const resolveCalendarOwnerLabel = (owner, usersById = new Map()) => {
  const value = String(owner || '').trim()
  if (!value) return ''
  const direct = usersById.get(value)
  if (direct) return direct
  return isMongoObjectId(value) ? '' : value
}

const formatUserName = (user) => `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.name || user?.email || ''

const ACTIVITY_COLORS = {
  meeting: 'bg-blue-500',
  task: 'bg-amber-500',
  email: 'bg-sky-500',
  call: 'bg-emerald-500',
  reminder: 'bg-violet-500',
  follow_up: 'bg-fuchsia-500',
  note: 'bg-slate-500',
  file: 'bg-cyan-500',
  pipeline_change: 'bg-rose-500',
  default: 'bg-gray-500',
}

const ACTIVITY_LABELS = {
  meeting: 'Meeting',
  task: 'Task',
  email: 'Email',
  call: 'Call',
  reminder: 'Reminder',
  follow_up: 'Follow-up',
  note: 'Note',
  file: 'File',
  pipeline_change: 'Pipeline change',
}

const parseCalendarTimestamp = (value) => {
  if (!value) return null
  const date = value instanceof Date ? value : parseISO(String(value))
  return isValid(date) ? date : null
}

const readCollection = (data, keys) => {
  if (Array.isArray(data)) return data
  if (!data || typeof data !== 'object') return []
  for (const key of keys) {
    const value = data[key]
    if (Array.isArray(value)) return value
  }
  return []
}

export default function CRMCalendarPage() {
  const navigate = useNavigate()
  const [view, setView] = useState('month')
  const [owner, setOwner] = useState('')
  const [activityType, setActivityType] = useState('')
  const [search, setSearch] = useState('')
  const [cursorDate, setCursorDate] = useState(() => timeService.now())

  const meetingsQuery = useQuery([CALENDAR_QUERY_KEY, 'meetings'], () => meetingsApi.list({ limit: 100 }), { staleTime: 60 * 1000 })
  const tasksQuery = useQuery([CALENDAR_QUERY_KEY, 'tasks'], () => tasksAPI.listTasks({ limit: 200 }), { staleTime: 60 * 1000 })
  const activitiesQuery = useQuery([CALENDAR_QUERY_KEY, 'activities'], () => activityAPI.getTimeline({ days: 90, limit: 500 }), { staleTime: 60 * 1000 })
  const usersQuery = useQuery([CALENDAR_QUERY_KEY, 'users'], () => usersAPI.getAssignableUsers(), { staleTime: 5 * 60 * 1000 })

  const usersById = useMemo(() => {
    const users = readCollection(usersQuery.data, ['users', 'items', 'data'])
    return new Map(users.map((user) => [String(user.id || user._id), formatUserName(user)]).filter(([, name]) => name))
  }, [usersQuery.data])

  const events = useMemo(() => {
    const merged = []
    const meetings = readCollection(meetingsQuery.data?.data || meetingsQuery.data, ['meetings', 'items', 'data'])
    const tasks = readCollection(tasksQuery.data, ['tasks', 'items', 'data'])
    const activities = readCollection(activitiesQuery.data, ['activities', 'items', 'data'])

    meetings.forEach((meeting) => {
      const timestamp = meeting.meeting_date || meeting.created_at
      merged.push({
        id: `meeting-${meeting.id}`,
        type: 'meeting',
        title: meeting.title || 'Meeting',
        timestamp,
        owner: meeting.host?.id || meeting.host_id || '',
        ownerLabel: meeting.host?.name || formatUserName(meeting.host) || '',
        leadId: meeting.lead_id || meeting.entity_id || null,
        companyId: meeting.company_id || null,
        contactId: meeting.contact_id || null,
        description: meeting.description || 'Scheduled meeting',
        meta: meeting,
      })
    })

    tasks.forEach((task) => {
      merged.push({
        id: `task-${task.id}`,
        type: 'task',
        title: task.title || 'Task',
        timestamp: task.due_date || task.created_at,
        owner: task.assigned_to || task.created_by || '',
        ownerLabel: task.assigned_to_name || task.created_by_name || task.owner_name || '',
        leadId: task.lead_id || null,
        companyId: task.company_id || null,
        contactId: task.contact_id || null,
        description: task.description || 'Task item',
        meta: task,
      })
    })

    activities.forEach((activity) => {
      merged.push({
        id: `activity-${activity.id}`,
        type: activity.activity_type || 'default',
        title: activity.title || 'Activity',
        timestamp: activity.timestamp || activity.updated_at || activity.created_at,
        owner: activity.owner_id || activity.created_by || '',
        ownerLabel: activity.owner_name || activity.created_by_name || '',
        leadId: activity.entity_type === 'lead' ? activity.entity_id : activity.metadata?.lead_id || null,
        companyId: activity.entity_type === 'company' ? activity.entity_id : activity.metadata?.company_id || null,
        contactId: activity.entity_type === 'contact' ? activity.entity_id : activity.metadata?.contact_id || null,
        description: activity.description || '',
        meta: activity,
      })
    })

    return merged
      .filter((item) => parseCalendarTimestamp(item.timestamp))
      .filter((item) => !activityType || item.type === activityType)
      .map((item) => ({
        ...item,
        ownerLabel: item.ownerLabel || resolveCalendarOwnerLabel(item.owner, usersById),
      }))
      .filter((item) => !owner || String(item.owner || '').includes(owner) || String(item.ownerLabel || '').toLowerCase().includes(owner.toLowerCase()))
      .filter((item) => {
        const q = search.trim().toLowerCase()
        if (!q) return true
        return [item.title, item.description, item.ownerLabel, item.type].some((value) => String(value || '').toLowerCase().includes(q))
      })
      .sort((a, b) => timeService.instant(a.timestamp) - timeService.instant(b.timestamp))
  }, [activityType, activitiesQuery.data, meetingsQuery.data, owner, search, tasksQuery.data, usersById])

  const today = startOfDay(timeService.now())
  const visibleEvents = useMemo(() => {
    if (view === 'agenda') return events
    if (view === 'day') return events.filter((event) => {
      const date = parseCalendarTimestamp(event.timestamp)
      return date ? isSameDay(date, cursorDate) : false
    })
    if (view === 'week') return events.filter((event) => {
      const date = parseCalendarTimestamp(event.timestamp)
      return date ? isSameWeek(date, cursorDate, { weekStartsOn: 1 }) : false
    })
    return events.filter((event) => {
      const date = parseCalendarTimestamp(event.timestamp)
      return date ? isSameMonth(date, cursorDate) : false
    })
  }, [cursorDate, events, view])

  const todayEvents = events.filter((event) => {
    const date = parseCalendarTimestamp(event.timestamp)
    return date ? isSameDay(date, today) : false
  })
  const upcomingEvents = events
    .filter((event) => {
      const date = parseCalendarTimestamp(event.timestamp)
      return date ? date > timeService.now() : false
    })
    .slice(0, 8)

  const ownerOptions = useMemo(() => {
    const ids = new Set()
    events.forEach((event) => {
      if (event.ownerLabel) ids.add(String(event.ownerLabel))
    })
    return Array.from(ids).map((value) => ({ value, label: value }))
  }, [events])

  const groupedByDay = useMemo(() => {
    const map = new Map()
    visibleEvents.forEach((event) => {
      const date = parseCalendarTimestamp(event.timestamp)
      if (!date) return
      const key = format(date, 'yyyy-MM-dd')
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(event)
    })
    return Array.from(map.entries()).map(([date, items]) => ({ date, items }))
  }, [visibleEvents])
  const cursorLabel = getCalendarCursorLabel(cursorDate, view)

  // Calculate stats
  const totalEvents = events.length
  const meetingsCount = events.filter(e => e.type === 'meeting').length
  const tasksCount = events.filter(e => e.type === 'task').length
  const activitiesCount = events.filter(e => e.type !== 'meeting' && e.type !== 'task').length

  return (
    <CRMPage>
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 p-6 text-white shadow-xl md:p-8 mb-6">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
                <CalendarDays className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-indigo-200">CRM</p>
                <h1 className="text-2xl font-bold md:text-3xl">Calendar</h1>
                <p className="mt-1 text-indigo-100">Meetings, tasks, and CRM activity in one read-only workspace.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex min-h-9 items-center rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
                {cursorLabel}
              </span>
              <button
                type="button"
                onClick={() => setCursorDate(new Date())}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                Today
              </button>
              <button
                type="button"
                aria-label={`Previous ${view}`}
                onClick={() => setCursorDate((date) => getCalendarCursorDate(date, view, -1))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`Next ${view}`}
                onClick={() => setCursorDate((date) => getCalendarCursorDate(date, view, 1))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="Total Events"
          value={totalEvents}
          icon={Calendar}
          color="indigo"
          subtitle="All calendar items"
        />
        <StatCard
          label="Meetings"
          value={meetingsCount}
          icon={Users}
          color="blue"
          subtitle="Scheduled meetings"
        />
        <StatCard
          label="Tasks"
          value={tasksCount}
          icon={Briefcase}
          color="amber"
          subtitle="Task items"
        />
        <StatCard
          label="Activities"
          value={activitiesCount}
          icon={Activity}
          color="emerald"
          subtitle="CRM activities"
        />
      </div>

      {/* Filters Section */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 mb-6">
        <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
              <Filter className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">Calendar Controls</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Filter the unified calendar feed without changing the source data.</p>
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))]">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Search</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input 
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white" 
                  value={search} 
                  onChange={(event) => setSearch(event.target.value)} 
                  placeholder="Search meetings, tasks, activity..." 
                  aria-label="Search calendar" 
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Activity Type</span>
              <select 
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white" 
                value={activityType} 
                onChange={(event) => setActivityType(event.target.value)} 
                aria-label="Filter by activity type"
              >
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All types</option>
                {Object.entries(ACTIVITY_LABELS).map(([value, label]) => <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Owner</span>
              <select 
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white" 
                value={owner} 
                onChange={(event) => setOwner(event.target.value)} 
                aria-label="Filter by owner"
              >
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All owners</option>
                {ownerOptions.map((option) => <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={() => { setSearch(''); setOwner(''); setActivityType('') }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Clear filters
              </button>
              <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-600 dark:bg-gray-700">
                {VIEW_OPTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setView(item)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition ${
                      view === item 
                        ? 'bg-white text-indigo-700 shadow-sm dark:bg-gray-600 dark:text-white' 
                        : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Calendar Events */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 bg-gradient-to-r from-blue-50/50 to-white p-4 dark:border-gray-700 dark:from-blue-950/20 dark:to-gray-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                <LayoutGrid className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Calendar</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Unified {view} view of CRM work</p>
              </div>
            </div>
          </div>

          <div className="p-4">
            {(meetingsQuery.isLoading || tasksQuery.isLoading || activitiesQuery.isLoading) ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24 w-full rounded-xl" />)}
              </div>
            ) : visibleEvents.length ? (
              view === 'agenda' ? (
                <div className="space-y-4">
                  {groupedByDay.map((group) => (
                    <div key={group.date} className="space-y-3">
                      <div className="sticky top-0 rounded-xl bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        {format(parseISO(group.date), 'EEEE, MMM d')}
                      </div>
                      {group.items.map((event) => <CalendarEventCard key={event.id} event={event} navigate={navigate} />)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-3">
                  {visibleEvents.slice(0, 20).map((event) => <CalendarEventCard key={event.id} event={event} navigate={navigate} />)}
                  {visibleEvents.length > 20 && (
                    <div className="text-center text-sm text-gray-500 dark:text-gray-400">
                      Showing 20 of {visibleEvents.length} events
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                  <CalendarDays className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white">No calendar items</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Meetings, tasks, and activities will appear here when they exist.</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Today & Upcoming */}
        <div className="space-y-6">
          {/* Today Section */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 bg-gradient-to-r from-emerald-50/50 to-white p-4 dark:border-gray-700 dark:from-emerald-950/20 dark:to-gray-800">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/30">
                  <Clock3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 dark:text-white">Today</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Items scheduled for today</p>
                </div>
              </div>
            </div>
            <div className="p-4">
              {todayEvents.length ? (
                <div className="space-y-3">
                  {todayEvents.slice(0, 6).map((event) => <CalendarEventCard key={event.id} event={event} navigate={navigate} compact />)}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
                    <Clock3 className="h-6 w-6 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Nothing today</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">No scheduled CRM items for today</p>
                </div>
              )}
            </div>
          </div>

          {/* Upcoming Section */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 bg-gradient-to-r from-amber-50/50 to-white p-4 dark:border-gray-700 dark:from-amber-950/20 dark:to-gray-800">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
                  <Repeat className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 dark:text-white">Upcoming</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Next items on the calendar</p>
                </div>
              </div>
            </div>
            <div className="p-4">
              {upcomingEvents.length ? (
                <div className="space-y-3">
                  {upcomingEvents.map((event) => <CalendarEventCard key={event.id} event={event} navigate={navigate} compact />)}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
                    <Repeat className="h-6 w-6 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No upcoming items</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Upcoming CRM items will show here once scheduled</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </CRMPage>
  )
}

function CalendarEventCard({ event, navigate, compact = false }) {
  const eventDate = parseCalendarTimestamp(event.timestamp)
  const color = ACTIVITY_COLORS[event.type] || ACTIVITY_COLORS.default
  const label = ACTIVITY_LABELS[event.type] || event.type || 'Activity'
  const target = event.leadId ? `/crm/leads/${event.leadId}` : event.companyId ? `/crm/companies/${event.companyId}` : event.contactId ? `/crm/contacts/${event.contactId}` : null

  if (!eventDate) {
    return null
  }

  return (
    <div className={`rounded-xl border border-gray-200 bg-white transition-all hover:border-indigo-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-1 h-3 w-3 rounded-full ${color} shadow-sm`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`font-semibold text-gray-900 dark:text-white ${compact ? 'text-sm' : 'text-base'}`}>{event.title}</h3>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              event.type === 'meeting' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
              event.type === 'task' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
              'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              {label}
            </span>
          </div>
          {!compact && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{event.description || 'No description'}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {format(eventDate, 'MMM d, p')}
            </span>
            {event.ownerLabel && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {event.ownerLabel}
              </span>
            )}
          </div>
        </div>
        {target && !compact && (
          <Button type="button" variant="secondary" size="sm" onClick={() => navigate(target)} className="gap-1.5">
            Open
          </Button>
        )}
      </div>
    </div>
  )
}
