import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Filter, Repeat, Search } from 'lucide-react'
import { addDays, addMonths, addWeeks, format, isSameDay, isSameMonth, isSameWeek, parseISO, startOfDay, isValid } from 'date-fns'
import { activityAPI } from '../../../api/activity'
import { meetingsApi } from '../../../api/meetings'
import { tasksAPI } from '../../../api/tasks'
import { usersAPI } from '../../../api/users'
import { CRMEmptyState, CRMPage, CRMPageTitle, CRMSection } from '../../../components/crm'
import { Badge, Button, Skeleton } from '../../../components/ui'

const CALENDAR_QUERY_KEY = 'crm-calendar'
const VIEW_OPTIONS = ['month', 'week', 'day', 'agenda']

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
  const [cursorDate, setCursorDate] = useState(() => new Date())

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
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
  }, [activityType, activitiesQuery.data, meetingsQuery.data, owner, search, tasksQuery.data, usersById])

  const today = startOfDay(new Date())
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
      return date ? date > new Date() : false
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

  return (
    <CRMPage>
      <CRMPageTitle
        eyebrow="CRM Calendar"
        title="Calendar"
        description="Meetings, tasks, and CRM activity in one read-only workspace."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-9 items-center rounded-full border border-surface-border/80 bg-white px-3 text-sm font-semibold text-text-primary shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100">
              {cursorLabel}
            </span>
            <Button type="button" variant="secondary" size="sm" onClick={() => setCursorDate(new Date())}>
              Today
            </Button>
            <Button type="button" variant="secondary" size="sm" aria-label={`Previous ${view}`} onClick={() => setCursorDate((date) => getCalendarCursorDate(date, view, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button type="button" variant="secondary" size="sm" aria-label={`Next ${view}`} onClick={() => setCursorDate((date) => getCalendarCursorDate(date, view, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      />

      <CRMSection title="Calendar controls" description="Filter the unified calendar feed without changing the source data.">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input className="input pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search meetings, tasks, activity" aria-label="Search calendar" />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Activity type</span>
            <select className="input" value={activityType} onChange={(event) => setActivityType(event.target.value)} aria-label="Filter by activity type">
              <option value="">All types</option>
              {Object.entries(ACTIVITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Owner</span>
            <select className="input" value={owner} onChange={(event) => setOwner(event.target.value)} aria-label="Filter by owner">
              <option value="">All owners</option>
              {ownerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setOwner(''); setActivityType('') }}>
              Clear filters
            </Button>
            <div className="flex rounded-full border border-surface-border/80 bg-white p-1 dark:border-gray-800 dark:bg-gray-900">
              {VIEW_OPTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setView(item)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium capitalize ${view === item ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-200' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CRMSection>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric title="Today" value={todayEvents.length} />
        <Metric title="Upcoming" value={upcomingEvents.length} />
        <Metric title="Visible" value={visibleEvents.length} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <CRMSection title="Calendar" description={`Unified ${view} view of CRM work.`}>
          {(meetingsQuery.isLoading || tasksQuery.isLoading || activitiesQuery.isLoading) ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24 w-full rounded-3xl" />)}
            </div>
          ) : visibleEvents.length ? (
            view === 'agenda' ? (
              <div className="space-y-3">
                {groupedByDay.map((group) => (
                  <div key={group.date} className="space-y-3">
                    <div className="sticky top-0 rounded-2xl bg-slate-50 px-4 py-2 text-sm font-semibold text-gray-700 dark:bg-gray-950 dark:text-gray-200">
                      {format(parseISO(group.date), 'EEEE, MMM d')}
                    </div>
                    {group.items.map((event) => <CalendarEventCard key={event.id} event={event} navigate={navigate} />)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-3">
                {visibleEvents.map((event) => <CalendarEventCard key={event.id} event={event} navigate={navigate} />)}
              </div>
            )
          ) : (
            <CRMEmptyState
              icon={CalendarDays}
              title="No calendar items"
              description="Meetings, tasks, and activities will appear here when they exist."
            />
          )}
        </CRMSection>

        <div className="space-y-6">
          <CRMSection title="Today" description="Items scheduled for the current day.">
            {todayEvents.length ? (
              <div className="space-y-3">
                {todayEvents.slice(0, 6).map((event) => <CalendarEventCard key={event.id} event={event} navigate={navigate} compact />)}
              </div>
            ) : (
              <CRMEmptyState icon={Clock3} title="Nothing today" description="There are no scheduled CRM items for today." />
            )}
          </CRMSection>

          <CRMSection title="Upcoming" description="Next items on the calendar.">
            {upcomingEvents.length ? (
              <div className="space-y-3">
                {upcomingEvents.map((event) => <CalendarEventCard key={event.id} event={event} navigate={navigate} compact />)}
              </div>
            ) : (
              <CRMEmptyState icon={Repeat} title="No upcoming items" description="Upcoming CRM items will show here once scheduled." />
            )}
          </CRMSection>
        </div>
      </section>

      <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-2">
          <Filter className="h-3.5 w-3.5" />
          Uses existing meetings, tasks, and CRM activity APIs. No external calendar sync.
        </span>
      </div>
    </CRMPage>
  )
}

function Metric({ title, value }) {
  return (
    <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">{title}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{value}</p>
    </article>
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
    <article className={`rounded-3xl border border-surface-border/80 bg-white ${compact ? 'p-3' : 'p-4'} shadow-sm dark:border-gray-800 dark:bg-gray-900`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1 h-3.5 w-3.5 rounded-full ${color}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{event.title}</h3>
            <Badge label={label} colorKey="draft" />
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{event.description || 'No description'}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Badge label={format(eventDate, 'MMM d, p')} colorKey="draft" />
            {event.ownerLabel ? <Badge label={`Owner ${event.ownerLabel}`} colorKey="draft" /> : null}
          </div>
        </div>
        {target ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => navigate(target)}>
            Open
          </Button>
        ) : null}
      </div>
    </article>
  )
}
