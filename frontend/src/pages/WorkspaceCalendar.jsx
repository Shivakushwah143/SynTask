import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  parseISO,
  isValid
} from 'date-fns'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Search,
  Sparkles,
  Video,
  Flag,
  User,
  ExternalLink,
  Layers,
  X,
  AlertTriangle
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { calendarApi } from '../api/calendar'
import { useAuthStore } from '../store/authStore'
import { Badge, Button, Skeleton } from '../components/ui'
import { ROLE, normalizeRole } from '../utils/roles'
import { asArray } from './phase4Utils'

const TIMELINE_START_HOUR = 8
const TIMELINE_END_HOUR = 20
const HOURS = Array.from({ length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 }, (_, i) => TIMELINE_START_HOUR + i)

export default function WorkspaceCalendar() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const userRole = normalizeRole(user?.role)
  const isEmployee = userRole === ROLE.EMPLOYEE
  
  // States
  const [view, setView] = useState('month') // 'month' | 'week' | 'day'
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [search, setSearch] = useState('')
  const [viewType, setViewType] = useState('my_calendar') // 'my_calendar' | 'team_calendar'
  const [selectedEvent, setSelectedEvent] = useState(null)
  
  // Filters
  const [filters, setFilters] = useState({
    task: true,
    project: true,
    meeting: true,
    milestone: true,
    completed: true,
    pending: true,
    high: true,
    medium: true,
    low: true,
  })

  // Date Range Calculation for query
  const dateRange = useMemo(() => {
    let start, end
    if (view === 'month') {
      start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 })
      end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
    } else if (view === 'week') {
      start = startOfWeek(currentDate, { weekStartsOn: 1 })
      end = endOfWeek(currentDate, { weekStartsOn: 1 })
    } else {
      start = currentDate
      end = currentDate
    }
    return {
      start_date: format(start, 'yyyy-MM-dd'),
      end_date: format(end, 'yyyy-MM-dd')
    }
  }, [currentDate, view])

  // React Query Fetch
  const { data, isLoading, isError, refetch } = useQuery(
    ['workspace-calendar-events', dateRange.start_date, dateRange.end_date, viewType],
    () => calendarApi.getEvents({
      start_date: dateRange.start_date,
      end_date: dateRange.end_date,
      view_type: viewType
    }),
    { staleTime: 30 * 1000 }
  )

  const events = asArray(data, ['events'])

  // Helper to parse dates safely
  const parseEventDate = (dateStr) => {
    if (!dateStr) return new Date()
    const parsed = parseISO(dateStr)
    return isValid(parsed) ? parsed : new Date()
  }

  // Filter & Search Logic
  const filteredEvents = useMemo(() => {
    const query = search.toLowerCase().trim()
    return events.filter((event) => {
      // 1. Search filter
      const matchesSearch = !query || 
        (event.title || '').toLowerCase().includes(query) ||
        (event.project_name || '').toLowerCase().includes(query) ||
        (event.description || '').toLowerCase().includes(query)

      // 2. Type filter
      let matchesType = false
      if (event.type === 'meeting' && filters.meeting) matchesType = true
      if (event.type === 'milestone' && filters.milestone) matchesType = true
      if ((event.type === 'project_start' || event.type === 'project_due') && filters.project) matchesType = true
      if ((event.type === 'task_assigned' || event.type === 'task_due' || event.type === 'task') && filters.task) matchesType = true

      // 3. Status filter (completed vs pending)
      const isCompleted = ['completed', 'done', 'approved', 'published', 'resolved'].includes(String(event.status || '').toLowerCase())
      let matchesStatus = false
      if (isCompleted && filters.completed) matchesStatus = true
      if (!isCompleted && filters.pending) matchesStatus = true

      // 4. Priority filter
      let matchesPriority = true
      if (event.priority) {
        const p = String(event.priority).toLowerCase()
        if (p === 'critical' || p === 'urgent' || p === 'high') {
          matchesPriority = filters.high
        } else if (p === 'medium') {
          matchesPriority = filters.medium
        } else if (p === 'low') {
          matchesPriority = filters.low
        }
      }

      return matchesSearch && matchesType && matchesStatus && matchesPriority
    })
  }, [events, search, filters])

  // Month View Days
  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentDate])

  // Week View Days
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 })
    const end = endOfWeek(currentDate, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentDate])

  // Mini-sidebar stats
  const overdueTasks = useMemo(() => {
    const today = new Date()
    return events.filter(e => {
      if (e.type !== 'task_due') return false
      const isCompleted = ['completed', 'done', 'approved', 'published', 'resolved'].includes(String(e.status || '').toLowerCase())
      if (isCompleted) return false
      const due = parseEventDate(e.start)
      return isBefore(due, today) && !isSameDay(due, today)
    })
  }, [events])

  const upcomingDeadlines = useMemo(() => {
    const today = new Date()
    return events.filter(e => {
      if (e.type !== 'task_due' && e.type !== 'project_due') return false
      const isCompleted = ['completed', 'done', 'approved', 'published', 'resolved'].includes(String(e.status || '').toLowerCase())
      if (isCompleted) return false
      const due = parseEventDate(e.start)
      return isAfter(due, today) || isSameDay(due, today)
    }).slice(0, 5)
  }, [events])

  // Navigation handlers
  const handlePrev = () => {
    if (view === 'month') setCurrentDate(addMonths(currentDate, -1))
    else if (view === 'week') setCurrentDate(addWeeks(currentDate, -1))
    else setCurrentDate(addDays(currentDate, -1))
  }

  const handleNext = () => {
    if (view === 'month') setCurrentDate(addMonths(currentDate, 1))
    else if (view === 'week') setCurrentDate(addWeeks(currentDate, 1))
    else setCurrentDate(addDays(currentDate, 1))
  }

  const handleToday = () => {
    const now = new Date()
    setCurrentDate(now)
    setSelectedDate(now)
  }

  const toggleFilter = (key) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const selectAllFilters = () => {
    setFilters({
      task: true,
      project: true,
      meeting: true,
      milestone: true,
      completed: true,
      pending: true,
      high: true,
      medium: true,
      low: true,
    })
  }

  const clearFilters = () => {
    setFilters({
      task: false,
      project: false,
      meeting: false,
      milestone: false,
      completed: false,
      pending: false,
      high: false,
      medium: false,
      low: false,
    })
  }

  // Quick action navigation
  const openEventTarget = (event) => {
    setSelectedEvent(null)
    const rawId = String(event.id || '')
    const idParts = rawId.split('_')
    const type = idParts[0]
    const dbId = idParts.slice(1).join('_')
    
    if (type === 'task' || type === 'task_start' || type === 'task_due') {
      if (event.project_id) {
        navigate(`/projects/${event.project_id}/tasks/${dbId}`)
      } else {
        navigate(`/tasks/${dbId}`)
      }
    } else if (type === 'project' || type === 'project_start' || type === 'project_due' || type === 'project_milestone') {
      navigate(`/projects/${dbId}/board`)
    } else if (type === 'meeting') {
      if (event.zoom_meeting_url) {
        window.open(event.zoom_meeting_url, '_blank')
      } else {
        navigate(`/meetings`)
      }
    }
  }

  // Styles/Colors Mapping helper
  const getEventBadgeLabel = (type) => {
    switch (type) {
      case 'meeting': return 'Meeting'
      case 'project_start': return 'Project Start'
      case 'project_due': return 'Project Due'
      case 'task_assigned': return 'Task Assigned'
      case 'task_due': return 'Task Due'
      case 'milestone': return 'Milestone'
      default: return 'Event'
    }
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-140px)] flex-col space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 border-b border-surface-border pb-5 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-primary-600" />
            Workspace Calendar
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Automatically aggregated timeline of projects, tasks, meetings, and deadlines.
          </p>
        </div>

        {/* View and controls */}
        <div className="flex flex-wrap items-center gap-2 sm:self-center">
          {/* My/Team toggle */}
          {!isEmployee && (
            <div className="flex rounded-xl bg-slate-100 p-0.5 dark:bg-gray-800">
              <button
                type="button"
                onClick={() => setViewType('my_calendar')}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                  viewType === 'my_calendar'
                    ? 'bg-white shadow-sm text-primary-700 dark:bg-gray-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                My Calendar
              </button>
              <button
                type="button"
                onClick={() => setViewType('team_calendar')}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                  viewType === 'team_calendar'
                    ? 'bg-white shadow-sm text-primary-700 dark:bg-gray-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                Team Calendar
              </button>
            </div>
          )}

          {/* Month/Week/Day tabs */}
          <div className="flex rounded-xl bg-slate-100 p-0.5 dark:bg-gray-800">
            {['month', 'week', 'day'].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  view === v
                    ? 'bg-white shadow-sm text-primary-700 dark:bg-gray-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="xs" onClick={handlePrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="xs" onClick={handleToday}>
              Today
            </Button>
            <Button variant="secondary" size="xs" onClick={handleNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 min-w-36 text-center">
            {view === 'day' 
              ? format(currentDate, 'MMMM d, yyyy') 
              : view === 'week' 
                ? `${format(weekDays[0], 'MMM d')} - ${format(weekDays[6], 'MMM d, yyyy')}`
                : format(currentDate, 'MMMM yyyy')}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        
        {/* LEFT SIDEBAR: Controls & Overview */}
        <aside className="space-y-6">
          
          {/* Search Box */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="input pl-10 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, project..."
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Quick Filters */}
          <div className="rounded-3xl border border-surface-border bg-surface p-4 dark:border-gray-800 dark:bg-black">
            <div className="flex items-center justify-between border-b border-surface-border pb-2 mb-3 dark:border-gray-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                Filters
              </h3>
              <div className="flex gap-2">
                <button type="button" onClick={selectAllFilters} className="text-[10px] text-primary-600 hover:underline">All</button>
                <button type="button" onClick={clearFilters} className="text-[10px] text-gray-400 hover:underline">None</button>
              </div>
            </div>

            <div className="space-y-4">
              {/* Type Category */}
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Event Types</span>
                <div className="mt-2 space-y-1.5">
                  <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="rounded text-primary-600 focus:ring-primary-500" checked={filters.task} onChange={() => toggleFilter('task')} />
                    Tasks
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="rounded text-primary-600 focus:ring-primary-500" checked={filters.project} onChange={() => toggleFilter('project')} />
                    Projects
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="rounded text-primary-600 focus:ring-primary-500" checked={filters.meeting} onChange={() => toggleFilter('meeting')} />
                    Meetings
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="rounded text-primary-600 focus:ring-primary-500" checked={filters.milestone} onChange={() => toggleFilter('milestone')} />
                    Milestones
                  </label>
                </div>
              </div>

              {/* Status Category */}
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Status</span>
                <div className="mt-2 space-y-1.5">
                  <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="rounded text-primary-600 focus:ring-primary-500" checked={filters.completed} onChange={() => toggleFilter('completed')} />
                    Completed / Done
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="rounded text-primary-600 focus:ring-primary-500" checked={filters.pending} onChange={() => toggleFilter('pending')} />
                    Pending / Active
                  </label>
                </div>
              </div>

              {/* Priority Category */}
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Priority</span>
                <div className="mt-2 space-y-1.5">
                  <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="rounded text-primary-600 focus:ring-primary-500" checked={filters.high} onChange={() => toggleFilter('high')} />
                    <span className="inline-flex h-2 w-2 rounded-full bg-red-500 mr-1" />
                    High / Critical
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="rounded text-primary-600 focus:ring-primary-500" checked={filters.medium} onChange={() => toggleFilter('medium')} />
                    <span className="inline-flex h-2 w-2 rounded-full bg-amber-500 mr-1" />
                    Medium
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="rounded text-primary-600 focus:ring-primary-500" checked={filters.low} onChange={() => toggleFilter('low')} />
                    <span className="inline-flex h-2 w-2 rounded-full bg-blue-500 mr-1" />
                    Low
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Overdue Tasks List */}
          {overdueTasks.length > 0 && (
            <div className="rounded-3xl border border-red-500/20 bg-red-50/10 p-4 dark:border-red-950/20">
              <h3 className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1.5 mb-3">
                <AlertTriangle className="h-4 w-4" />
                Overdue ({overdueTasks.length})
              </h3>
              <div className="max-h-56 overflow-y-auto space-y-2">
                {overdueTasks.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedEvent(event)}
                    className="w-full text-left p-2 rounded-xl bg-white border border-red-100 hover:bg-red-50/40 text-xs dark:bg-gray-950 dark:border-red-950/30 transition-colors"
                  >
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{event.title}</p>
                    <p className="text-[10px] text-red-500 font-medium mt-1">
                      Due: {format(parseEventDate(event.start), 'MMM d, yyyy')}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Deadlines */}
          <div className="rounded-3xl border border-surface-border bg-surface p-4 dark:border-gray-800 dark:bg-black">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mb-3">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Deadlines / Milestones
            </h3>
            {upcomingDeadlines.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">No upcoming deadlines.</p>
            ) : (
              <div className="space-y-2">
                {upcomingDeadlines.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedEvent(event)}
                    className="w-full text-left p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs dark:bg-gray-900/40 dark:hover:bg-gray-900 transition-colors"
                  >
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{event.title}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                      {format(parseEventDate(event.start), 'MMM d, yyyy')}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* MAIN PANEL: The Calendar views */}
        <main className="flex-1">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full rounded-2xl" />
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 35 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-2xl" />
                ))}
              </div>
            </div>
          ) : isError ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-50/20 p-6 text-center text-red-800 dark:text-red-400">
              <p className="font-semibold">Unable to load calendar events.</p>
              <Button size="sm" variant="secondary" className="mt-4" onClick={() => refetch()}>Retry</Button>
            </div>
          ) : (
            <div className="rounded-3xl border border-surface-border bg-surface shadow-sm dark:border-gray-800 dark:bg-black overflow-hidden">
              {view === 'month' && (
                <MonthView
                  days={monthDays}
                  events={filteredEvents}
                  selected={selectedDate}
                  setSelected={setSelectedDate}
                  month={currentDate}
                  onOpenEvent={setSelectedEvent}
                  parseEventDate={parseEventDate}
                />
              )}
              {view === 'week' && (
                <WeekView
                  days={weekDays}
                  events={filteredEvents}
                  onOpenEvent={setSelectedEvent}
                  parseEventDate={parseEventDate}
                />
              )}
              {view === 'day' && (
                <DayView
                  day={currentDate}
                  events={filteredEvents}
                  onOpenEvent={setSelectedEvent}
                  parseEventDate={parseEventDate}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Slide Drawer for Event Details */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setSelectedEvent(null)}
            role="presentation"
          />
          
          {/* Content panel */}
          <div className="relative w-full max-w-lg bg-white p-6 shadow-2xl dark:bg-gray-950 flex flex-col h-full overflow-y-auto">
            <div className="flex items-center justify-between border-b border-surface-border pb-4 mb-4 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-gray-800 dark:text-gray-300">
                  {getEventBadgeLabel(selectedEvent.type)}
                </span>
                <Badge
                  label={String(selectedEvent.status || 'Active').toUpperCase()}
                  colorKey={selectedEvent.status || 'Active'}
                />
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="rounded-full p-1.5 text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{selectedEvent.title}</h2>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                  {selectedEvent.description || 'No description provided.'}
                </p>
              </div>

              {/* Parameters grid */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-gray-900">
                  <span className="font-semibold text-gray-400 block uppercase tracking-wider mb-1">Date</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {format(parseEventDate(selectedEvent.start), 'PPP')}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-gray-900">
                  <span className="font-semibold text-gray-400 block uppercase tracking-wider mb-1">Time</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {selectedEvent.time ? format(parseEventDate(`${selectedEvent.start}T${selectedEvent.time}`), 'p') : 'All Day'}
                  </span>
                </div>

                {selectedEvent.project_name && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-gray-900 col-span-2">
                    <span className="font-semibold text-gray-400 block uppercase tracking-wider mb-1">Project</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-primary-500" />
                      {selectedEvent.project_name}
                    </span>
                  </div>
                )}

                {selectedEvent.assignee && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-gray-900">
                    <span className="font-semibold text-gray-400 block uppercase tracking-wider mb-1">Assignee</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-slate-500" />
                      {selectedEvent.assignee}
                    </span>
                  </div>
                )}

                {selectedEvent.priority && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-gray-900">
                    <span className="font-semibold text-gray-400 block uppercase tracking-wider mb-1">Priority</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                      <Flag className="h-3.5 w-3.5 text-amber-500" />
                      <span className="capitalize">{selectedEvent.priority}</span>
                    </span>
                  </div>
                )}
                
                {selectedEvent.host && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-gray-900">
                    <span className="font-semibold text-gray-400 block uppercase tracking-wider mb-1">Host</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{selectedEvent.host}</span>
                  </div>
                )}
                
                {selectedEvent.participants && selectedEvent.participants.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-gray-900 col-span-2">
                    <span className="font-semibold text-gray-400 block uppercase tracking-wider mb-1">Participants</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {selectedEvent.participants.map((p, idx) => (
                        <span key={idx} className="bg-white border dark:bg-black px-2 py-0.5 rounded-md text-[10px] font-medium text-gray-700 dark:text-gray-300">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="border-t border-surface-border pt-4 dark:border-gray-800 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setSelectedEvent(null)}>
                  Close
                </Button>
                <Button onClick={() => openEventTarget(selectedEvent)}>
                  {selectedEvent.type === 'meeting' ? (
                    <>
                      <Video className="h-4 w-4 mr-1.5" />
                      Join Meeting
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4 mr-1.5" />
                      Open Record
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* Month view sub-component */
function MonthView({ days, events, selected, setSelected, month, onOpenEvent, parseEventDate }) {
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-surface-border bg-slate-50/50 text-center text-xs font-semibold uppercase text-gray-500 dark:border-gray-800 dark:bg-black dark:text-gray-400">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <div key={day} className="p-3">{day}</div>
        ))}
      </div>
      
      <div className="grid grid-cols-7 divide-x divide-y divide-surface-border dark:divide-gray-800">
        {days.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(parseEventDate(e.start), day))
          const isSelected = isSameDay(day, selected)
          const isCurrentMonth = isSameMonth(day, month)
          const isToday = isSameDay(day, new Date())
          const isWeekend = day.getDay() === 0 || day.getDay() === 6
          
          return (
            <div
              key={day.toISOString()}
              onClick={() => setSelected(day)}
              className={`min-h-32 p-1.5 text-left transition-colors flex flex-col justify-between hover:bg-slate-50 dark:hover:bg-gray-900/40 cursor-pointer ${
                isSelected ? 'bg-primary-50/30 dark:bg-primary-950/10' : ''
              } ${
                !isCurrentMonth ? 'text-gray-300 dark:text-gray-600 bg-slate-50/20 dark:bg-gray-900/10' : 'text-gray-900 dark:text-gray-100'
              } ${
                isWeekend && isCurrentMonth ? 'bg-slate-50/30 dark:bg-gray-950/20' : ''
              }`}
            >
              {/* Date Header */}
              <div className="flex items-center justify-between">
                <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full text-xs font-bold ${
                  isToday 
                    ? 'bg-primary-600 text-white' 
                    : isSelected 
                      ? 'text-primary-600' 
                      : ''
                }`}>
                  {format(day, 'd')}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-[10px] text-gray-400 font-medium">{dayEvents.length} items</span>
                )}
              </div>

              {/* Events stack */}
              <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenEvent(event)
                    }}
                    className={`w-full text-left truncate rounded-lg p-1 text-[10px] font-semibold border transition-all hover:scale-[1.02] ${getEventColorStyles(event)}`}
                    title={event.title}
                  >
                    {event.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[9px] font-bold text-primary-600 dark:text-primary-400 pl-1">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* Week view sub-component */
function WeekView({ days, events, onOpenEvent, parseEventDate }) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[700px] grid-cols-7 divide-x divide-surface-border bg-slate-50/50 dark:divide-gray-800 dark:bg-black border-b border-surface-border dark:border-gray-800">
        {days.map((day) => {
          const isToday = isSameDay(day, new Date())
          return (
            <div key={day.toISOString()} className={`p-4 text-center ${isToday ? 'bg-primary-50/20 dark:bg-primary-950/20' : ''}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase">{format(day, 'EEE')}</p>
              <p className={`mt-1 text-lg font-bold inline-block px-2 py-0.5 rounded-full ${
                isToday ? 'bg-primary-600 text-white' : 'text-gray-900 dark:text-gray-100'
              }`}>{format(day, 'd')}</p>
            </div>
          )
        })}
      </div>

      <div className="grid min-w-[700px] grid-cols-7 divide-x divide-surface-border dark:divide-gray-800 min-h-[450px]">
        {days.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(parseEventDate(e.start), day))
          return (
            <div key={day.toISOString()} className="p-2 space-y-2 bg-white dark:bg-black">
              {dayEvents.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[10px] text-gray-300 dark:text-gray-700 italic select-none py-10">
                  No Events
                </div>
              ) : (
                dayEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onOpenEvent(event)}
                    className={`w-full text-left rounded-xl p-2.5 text-xs shadow-xs border transition-all hover:shadow-md hover:scale-[1.01] ${getEventStylesWithBorder(event)}`}
                  >
                    <span className="block font-bold truncate">{event.title}</span>
                    <span className="mt-1 block text-[10px] opacity-75 truncate">{event.project_name || 'No project'}</span>
                    {event.time && (
                      <span className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-bold opacity-80">
                        <Clock className="h-3 w-3" />
                        {event.time}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* Day view sub-component */
function DayView({ day, events, onOpenEvent, parseEventDate }) {
  const dayEvents = events.filter((e) => isSameDay(parseEventDate(e.start), day))
  const timedEvents = dayEvents.filter((e) => e.time)
  const allDayEvents = dayEvents.filter((e) => !e.time)

  return (
    <div className="p-4 space-y-4">
      {/* Day summary header */}
      <div className="flex items-center gap-3 border-b border-surface-border pb-3 dark:border-gray-800">
        <span className="h-10 w-10 bg-primary-50 rounded-full flex items-center justify-center text-primary-600 font-bold dark:bg-primary-950/30">
          {format(day, 'd')}
        </span>
        <div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100">{format(day, 'EEEE')}</h3>
          <p className="text-xs text-gray-500">{format(day, 'MMMM yyyy')}</p>
        </div>
      </div>

      {/* All day events row */}
      {allDayEvents.length > 0 && (
        <div className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">All-day Items</span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {allDayEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => onOpenEvent(event)}
                className={`text-left rounded-xl p-3 text-xs border transition-all hover:scale-[1.01] ${getEventStylesWithBorder(event)}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold truncate">{event.title}</span>
                  <Badge label={String(event.type).replace(/_/g, ' ')} colorKey={event.status || 'Active'} />
                </div>
                <p className="text-[10px] mt-1 opacity-80">{event.project_name || 'Global Event'}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hourly Timeline */}
      <div className="mt-4 border border-surface-border rounded-2xl overflow-hidden dark:border-gray-800">
        <div className="grid grid-cols-[70px_1fr] bg-slate-50/50 dark:bg-black/30">
          <div className="p-3 border-r border-surface-border text-center text-xs font-bold text-gray-400 dark:border-gray-800">Time</div>
          <div className="p-3 text-left text-xs font-bold text-gray-400">Scheduled Items</div>
        </div>
        
        <div className="divide-y divide-surface-border dark:divide-gray-800">
          {HOURS.map((hour) => {
            const formattedHour = format(new Date(2026, 0, 1, hour), 'ha')
            const hourEvents = timedEvents.filter((e) => {
              const [h] = e.time.split(':').map(Number)
              return h === hour
            })

            return (
              <div key={hour} className="grid grid-cols-[70px_1fr] min-h-[70px]">
                <div className="p-3 border-r border-surface-border dark:border-gray-800 text-center text-xs text-gray-400 font-medium">
                  {formattedHour}
                </div>
                <div className="p-2 space-y-2">
                  {hourEvents.length === 0 ? (
                    <span className="text-[10px] text-gray-300 dark:text-gray-700 italic select-none">Free</span>
                  ) : (
                    hourEvents.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => onOpenEvent(event)}
                        className={`text-left rounded-xl p-2.5 text-xs shadow-xs border block w-full transition-all hover:shadow-md ${getEventStylesWithBorder(event)}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold">{event.title}</span>
                          <span className="text-[9px] opacity-75">{event.time}</span>
                        </div>
                        <p className="text-[10px] mt-0.5 opacity-85">{event.project_name || 'No project'}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* Helper styles */
function getEventColorStyles(event) {
  const isCompleted = ['completed', 'done', 'approved', 'published', 'resolved'].includes(String(event.status || '').toLowerCase())
  if (isCompleted) return 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-400'

  switch (event.type) {
    case 'meeting':
      return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/50 dark:bg-purple-950/20 dark:text-purple-300'
    case 'project_start':
      return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300'
    case 'project_due':
      return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300'
    case 'task_assigned':
      return 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-300'
    case 'task_due':
      if (event.color === '#7F1D1D') {
        return 'border-red-950 bg-red-100 text-red-950 dark:border-red-950 dark:bg-red-950/40 dark:text-red-100'
      }
      if (event.color === '#EF4444') {
        return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300'
      }
      if (event.color === '#EAB308') {
        return 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900/50 dark:bg-yellow-950/20 dark:text-yellow-300'
      }
      return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-300'
    case 'milestone':
      return 'border-yellow-300 bg-yellow-50/50 text-yellow-800 dark:border-yellow-900/40 dark:bg-yellow-950/10 dark:text-yellow-300'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300'
  }
}

function getEventStylesWithBorder(event) {
  const isCompleted = ['completed', 'done', 'approved', 'published', 'resolved'].includes(String(event.status || '').toLowerCase())
  if (isCompleted) return 'border-l-4 border-gray-400 bg-gray-50 text-gray-500 border-y border-r border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-800'

  switch (event.type) {
    case 'meeting':
      return 'border-l-4 border-purple-500 bg-purple-50 text-purple-700 border-y border-r border-purple-100 dark:bg-purple-950/10 dark:text-purple-300 dark:border-purple-900/30'
    case 'project_start':
      return 'border-l-4 border-blue-500 bg-blue-50 text-blue-700 border-y border-r border-blue-100 dark:bg-blue-950/10 dark:text-blue-300 dark:border-blue-900/30'
    case 'project_due':
      return 'border-l-4 border-red-500 bg-red-50 text-red-700 border-y border-r border-red-100 dark:bg-red-950/10 dark:text-red-300 dark:border-red-900/30'
    case 'task_assigned':
      return 'border-l-4 border-green-500 bg-green-50 text-green-700 border-y border-r border-green-100 dark:bg-green-950/10 dark:text-green-300 dark:border-green-900/30'
    case 'task_due':
      if (event.color === '#7F1D1D') {
        return 'border-l-4 border-red-950 bg-red-100 text-red-950 border-y border-r border-red-200 dark:bg-red-950/40 dark:text-red-100 dark:border-red-950'
      }
      if (event.color === '#EF4444') {
        return 'border-l-4 border-red-500 bg-red-50 text-red-700 border-y border-r border-red-100 dark:bg-red-950/10 dark:text-red-300 dark:border-red-900/30'
      }
      if (event.color === '#EAB308') {
        return 'border-l-4 border-yellow-500 bg-yellow-50 text-yellow-700 border-y border-r border-yellow-100 dark:bg-yellow-950/10 dark:text-yellow-300 dark:border-yellow-900/30'
      }
      return 'border-l-4 border-orange-500 bg-orange-50 text-orange-700 border-y border-r border-orange-100 dark:bg-orange-950/10 dark:text-orange-300 dark:border-orange-900/30'
    case 'milestone':
      return 'border-l-4 border-yellow-600 bg-yellow-50/50 text-yellow-800 border-y border-r border-yellow-100 dark:bg-yellow-950/10 dark:text-yellow-300 dark:border-yellow-900/30'
    default:
      return 'border-l-4 border-slate-500 bg-slate-50 text-slate-700 border-y border-r border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
  }
}
