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
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  CalendarDays,
  Users,
  Zap,
  BarChart3,
  PieChart,
  Activity,
  Bell
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { calendarApi } from '../api/calendar'
import { useAuthStore } from '../store/authStore'
import { Badge, Button, Skeleton } from '../components/ui'
import { ROLE, normalizeRole } from '../utils/roles'
import { asArray } from './phase4Utils'
import { timeService } from '@/services/timeService'

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
  const [currentDate, setCurrentDate] = useState(timeService.now())
  const [selectedDate, setSelectedDate] = useState(timeService.now())
  const [search, setSearch] = useState('')
  const [viewType, setViewType] = useState('my_calendar')
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
    if (!dateStr) return timeService.now()
    const parsed = parseISO(dateStr)
    return isValid(parsed) ? parsed : timeService.now()
  }

  // Filter & Search Logic
  const filteredEvents = useMemo(() => {
    const query = search.toLowerCase().trim()
    return events.filter((event) => {
      const matchesSearch = !query || 
        (event.title || '').toLowerCase().includes(query) ||
        (event.project_name || '').toLowerCase().includes(query) ||
        (event.description || '').toLowerCase().includes(query)

      let matchesType = false
      if (event.type === 'meeting' && filters.meeting) matchesType = true
      if (event.type === 'milestone' && filters.milestone) matchesType = true
      if ((event.type === 'project_start' || event.type === 'project_due') && filters.project) matchesType = true
      if ((event.type === 'task_assigned' || event.type === 'task_due' || event.type === 'task') && filters.task) matchesType = true

      const isCompleted = ['completed', 'done', 'approved', 'published', 'resolved'].includes(String(event.status || '').toLowerCase())
      let matchesStatus = false
      if (isCompleted && filters.completed) matchesStatus = true
      if (!isCompleted && filters.pending) matchesStatus = true

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

  // Stats
  const totalEvents = filteredEvents.length
  const overdueTasks = useMemo(() => {
    const today = timeService.now()
    return events.filter(e => {
      if (e.type !== 'task_due') return false
      const isCompleted = ['completed', 'done', 'approved', 'published', 'resolved'].includes(String(e.status || '').toLowerCase())
      if (isCompleted) return false
      const due = parseEventDate(e.start)
      return isBefore(due, today) && !isSameDay(due, today)
    })
  }, [events])

  const upcomingDeadlines = useMemo(() => {
    const today = timeService.now()
    return events.filter(e => {
      if (e.type !== 'task_due' && e.type !== 'project_due') return false
      const isCompleted = ['completed', 'done', 'approved', 'published', 'resolved'].includes(String(e.status || '').toLowerCase())
      if (isCompleted) return false
      const due = parseEventDate(e.start)
      return isAfter(due, today) || isSameDay(due, today)
    }).slice(0, 5)
  }, [events])

  const completedEvents = useMemo(() => {
    return events.filter(e => ['completed', 'done', 'approved', 'published', 'resolved'].includes(String(e.status || '').toLowerCase()))
  }, [events])

  const meetingsCount = useMemo(() => {
    return events.filter(e => e.type === 'meeting').length
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
    const now = timeService.now()
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
    const dbId = idParts.slice(2).join('_')

    console.log("dbid=",dbId);
    console.log("rawid=",rawId,"id=",idParts);
    
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
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-pink-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
              <CalendarDays className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">Workspace Calendar</h1>
              <p className="mt-1 text-indigo-100">Automatically aggregated timeline of projects, tasks, meetings, and deadlines.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleToday}
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
            >
              <CalendarIcon className="h-4 w-4" />
              Today
            </button>
            <button
              type="button"
              onClick={() => setView('month')}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium backdrop-blur-sm transition ${view === 'month' ? 'bg-white/30 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
            >
              Month
            </button>
            <button
              type="button"
              onClick={() => setView('week')}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium backdrop-blur-sm transition ${view === 'week' ? 'bg-white/30 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setView('day')}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium backdrop-blur-sm transition ${view === 'day' ? 'bg-white/30 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
            >
              Day
            </button>
          </div>
        </div>
      </div>

      {/* Quick Stats - 6 Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="group rounded-xl border border-indigo-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Events</span>
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
              <CalendarIcon className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{totalEvents}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">All events</p>
        </div>

        <div className="group rounded-xl border border-emerald-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Completed</span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{completedEvents.length}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Done/Resolved</p>
        </div>

        <div className="group rounded-xl border border-rose-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Overdue</span>
            <div className="rounded-lg bg-rose-50 p-2 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{overdueTasks.length}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Past due tasks</p>
        </div>

        <div className="group rounded-xl border border-amber-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Upcoming</span>
            <div className="rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <Bell className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{upcomingDeadlines.length}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Deadlines soon</p>
        </div>

        <div className="group rounded-xl border border-purple-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Meetings</span>
            <div className="rounded-lg bg-purple-50 p-2 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{meetingsCount}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Scheduled meetings</p>
        </div>

        <div className="group rounded-xl border border-blue-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Active</span>
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{totalEvents - completedEvents.length}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">In progress</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        
        {/* LEFT SIDEBAR: Controls & Overview */}
        <aside className="space-y-6">
          
          {/* Search Box */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search events..."
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
          </div>

          {/* View Toggle */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">View</span>
              {!isEmployee && (
                <div className="flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-700">
                  <button
                    type="button"
                    onClick={() => setViewType('my_calendar')}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      viewType === 'my_calendar'
                        ? 'bg-white text-indigo-700 shadow-sm dark:bg-gray-600 dark:text-white'
                        : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    My
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewType('team_calendar')}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      viewType === 'team_calendar'
                        ? 'bg-white text-indigo-700 shadow-sm dark:bg-gray-600 dark:text-white'
                        : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    Team
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Quick Filters */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-3 dark:border-gray-700">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                Filters
              </h3>
              <div className="flex gap-2">
                <button type="button" onClick={selectAllFilters} className="text-[10px] font-medium text-indigo-600 hover:underline dark:text-indigo-400">All</button>
                <button type="button" onClick={clearFilters} className="text-[10px] font-medium text-gray-400 hover:underline">None</button>
              </div>
            </div>

            <div className="space-y-4">
              {/* Type Category */}
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Event Types</span>
                <div className="mt-2 space-y-1.5">
                  <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600" checked={filters.task} onChange={() => toggleFilter('task')} />
                    Tasks
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600" checked={filters.project} onChange={() => toggleFilter('project')} />
                    Projects
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600" checked={filters.meeting} onChange={() => toggleFilter('meeting')} />
                    Meetings
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600" checked={filters.milestone} onChange={() => toggleFilter('milestone')} />
                    Milestones
                  </label>
                </div>
              </div>

              {/* Status Category */}
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Status</span>
                <div className="mt-2 space-y-1.5">
                  <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600" checked={filters.completed} onChange={() => toggleFilter('completed')} />
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Completed
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600" checked={filters.pending} onChange={() => toggleFilter('pending')} />
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-amber-500" />
                      Pending
                    </span>
                  </label>
                </div>
              </div>

              {/* Priority Category */}
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Priority</span>
                <div className="mt-2 space-y-1.5">
                  <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600" checked={filters.high} onChange={() => toggleFilter('high')} />
                    <span className="flex items-center gap-1">
                      <span className="inline-flex h-2 w-2 rounded-full bg-rose-500" />
                      High / Critical
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600" checked={filters.medium} onChange={() => toggleFilter('medium')} />
                    <span className="flex items-center gap-1">
                      <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
                      Medium
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600" checked={filters.low} onChange={() => toggleFilter('low')} />
                    <span className="flex items-center gap-1">
                      <span className="inline-flex h-2 w-2 rounded-full bg-blue-500" />
                      Low
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Overdue Tasks List */}
          {overdueTasks.length > 0 && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/30 p-4 dark:border-rose-900/30 dark:bg-rose-950/20">
              <h3 className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5 mb-3">
                <AlertTriangle className="h-4 w-4" />
                Overdue ({overdueTasks.length})
              </h3>
              <div className="max-h-56 overflow-y-auto space-y-2">
                {overdueTasks.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedEvent(event)}
                    className="w-full text-left p-3 rounded-xl bg-white border border-rose-200 hover:bg-rose-50/60 text-xs transition-all dark:bg-gray-900 dark:border-rose-900/30 dark:hover:bg-rose-950/30"
                  >
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{event.title}</p>
                    <p className="text-[10px] text-rose-600 dark:text-rose-400 font-medium mt-1">
                      Due: {format(parseEventDate(event.start), 'MMM d, yyyy')}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Deadlines */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mb-3">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Upcoming Deadlines
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
                    className="w-full text-left p-3 rounded-xl bg-gray-50 hover:bg-gray-100 text-xs transition-all dark:bg-gray-900/40 dark:hover:bg-gray-900"
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
            <div className="rounded-2xl border border-rose-200 bg-rose-50/30 p-8 text-center dark:border-rose-900/30 dark:bg-rose-950/20">
              <AlertTriangle className="mx-auto h-12 w-12 text-rose-500 mb-4" />
              <p className="font-semibold text-rose-800 dark:text-rose-400">Unable to load calendar events.</p>
              <p className="mt-1 text-sm text-rose-600 dark:text-rose-500">Please check your connection and try again.</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
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
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedEvent(null)}
            role="presentation"
          />
          
          <div className="relative w-full max-w-lg bg-white shadow-2xl dark:bg-gray-950 flex flex-col h-full overflow-y-auto animate-slide-in-right">
            <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
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
                  className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-6 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{selectedEvent.title}</h2>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                  {selectedEvent.description || 'No description provided.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900">
                  <span className="font-semibold text-gray-400 block uppercase tracking-wider mb-1">Date</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {format(parseEventDate(selectedEvent.start), 'PPP')}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900">
                  <span className="font-semibold text-gray-400 block uppercase tracking-wider mb-1">Time</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {selectedEvent.time ? format(parseEventDate(`${selectedEvent.start}T${selectedEvent.time}`), 'p') : 'All Day'}
                  </span>
                </div>

                {selectedEvent.project_name && (
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 col-span-2">
                    <span className="font-semibold text-gray-400 block uppercase tracking-wider mb-1">Project</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-indigo-500" />
                      {selectedEvent.project_name}
                    </span>
                  </div>
                )}

                {selectedEvent.assignee && (
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900">
                    <span className="font-semibold text-gray-400 block uppercase tracking-wider mb-1">Assignee</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-gray-500" />
                      {selectedEvent.assignee}
                    </span>
                  </div>
                )}

                {selectedEvent.priority && (
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900">
                    <span className="font-semibold text-gray-400 block uppercase tracking-wider mb-1">Priority</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                      <Flag className="h-3.5 w-3.5 text-amber-500" />
                      <span className="capitalize">{selectedEvent.priority}</span>
                    </span>
                  </div>
                )}
                
                {selectedEvent.host && (
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 col-span-2">
                    <span className="font-semibold text-gray-400 block uppercase tracking-wider mb-1">Host</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{selectedEvent.host}</span>
                  </div>
                )}
                
                {selectedEvent.participants && selectedEvent.participants.length > 0 && (
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 col-span-2">
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

              <div className="border-t border-gray-200 pt-4 dark:border-gray-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => openEventTarget(selectedEvent)}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 flex items-center gap-2"
                >
                  {selectedEvent.type === 'meeting' ? (
                    <>
                      <Video className="h-4 w-4" />
                      Join Meeting
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4" />
                      Open Record
                    </>
                  )}
                </button>
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
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50/50 text-center text-xs font-semibold uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <div key={day} className="p-3">{day}</div>
        ))}
      </div>
      
      <div className="grid grid-cols-7 divide-x divide-y divide-gray-100 dark:divide-gray-800">
        {days.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(parseEventDate(e.start), day))
          const isSelected = isSameDay(day, selected)
          const isCurrentMonth = isSameMonth(day, month)
          const isToday = isSameDay(day, timeService.now())
          const isWeekend = day.getDay() === 0 || day.getDay() === 6
          
          return (
            <div
              key={timeService.toUtcISOString(day)}
              onClick={() => setSelected(day)}
              className={`min-h-32 p-2 text-left transition-colors flex flex-col cursor-pointer ${
                isSelected ? 'bg-indigo-50/50 dark:bg-indigo-950/20 ring-2 ring-indigo-300 dark:ring-indigo-700' : ''
              } ${
                !isCurrentMonth ? 'text-gray-300 dark:text-gray-600 bg-gray-50/20 dark:bg-gray-900/10' : 'text-gray-900 dark:text-gray-100'
              } ${
                isWeekend && isCurrentMonth ? 'bg-gray-50/30 dark:bg-gray-950/20' : ''
              } hover:bg-gray-50 dark:hover:bg-gray-900/40`}
            >
              <div className="flex items-center justify-between">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  isToday 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' 
                    : isSelected 
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' 
                      : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {format(day, 'd')}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">
                    {dayEvents.length}
                  </span>
                )}
              </div>

              <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenEvent(event)
                    }}
                    className={`w-full text-left truncate rounded-lg px-1.5 py-1 text-[10px] font-medium border transition-all hover:scale-[1.02] ${getEventColorStyles(event)}`}
                    title={event.title}
                  >
                    {event.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 pl-1">
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
      <div className="grid min-w-[700px] grid-cols-7 divide-x divide-gray-200 bg-gray-50/50 dark:divide-gray-700 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        {days.map((day) => {
          const isToday = isSameDay(day, timeService.now())
          return (
            <div key={day.toISOString()} className={`p-4 text-center ${isToday ? 'bg-indigo-50/30 dark:bg-indigo-950/30' : ''}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">{format(day, 'EEE')}</p>
              <p className={`mt-1 text-lg font-bold inline-block px-2.5 py-0.5 rounded-full ${
                isToday ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'text-gray-900 dark:text-gray-100'
              }`}>{format(day, 'd')}</p>
            </div>
          )
        })}
      </div>

      <div className="grid min-w-[700px] grid-cols-7 divide-x divide-gray-200 dark:divide-gray-700 min-h-[450px] bg-white dark:bg-gray-900">
        {days.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(parseEventDate(e.start), day))
          return (
            <div key={day.toISOString()} className="p-2 space-y-2">
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
                    className={`w-full text-left rounded-xl p-2.5 text-xs shadow-sm border transition-all hover:shadow-md hover:scale-[1.01] ${getEventStylesWithBorder(event)}`}
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
      <div className="flex items-center gap-4 border-b border-gray-200 pb-4 dark:border-gray-700">
        <span className="h-12 w-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 font-bold text-xl dark:bg-indigo-950/30 dark:text-indigo-300">
          {format(day, 'd')}
        </span>
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{format(day, 'EEEE')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{format(day, 'MMMM yyyy')}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {dayEvents.length} events
          </span>
        </div>
      </div>

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

      <div className="mt-4 border border-gray-200 rounded-2xl overflow-hidden dark:border-gray-700">
        <div className="grid grid-cols-[70px_1fr] bg-gray-50/50 dark:bg-gray-800/50">
          <div className="p-3 border-r border-gray-200 text-center text-xs font-bold text-gray-400 dark:border-gray-700">Time</div>
          <div className="p-3 text-left text-xs font-bold text-gray-400">Scheduled Items</div>
        </div>
        
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {HOURS.map((hour) => {
            const formattedHour = format(timeService.instant(2026, 0, 1, hour), 'ha')
            const hourEvents = timedEvents.filter((e) => {
              const [h] = e.time.split(':').map(Number)
              return h === hour
            })

            return (
              <div key={hour} className="grid grid-cols-[70px_1fr] min-h-[70px] hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="p-3 border-r border-gray-200 dark:border-gray-700 text-center text-xs text-gray-400 font-medium">
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
                        className={`text-left rounded-xl p-2.5 text-xs shadow-sm border block w-full transition-all hover:shadow-md ${getEventStylesWithBorder(event)}`}
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
  if (isCompleted) return 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'

  switch (event.type) {
    case 'meeting':
      return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/40 dark:bg-purple-950/20 dark:text-purple-300'
    case 'project_start':
      return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300'
    case 'project_due':
      return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300'
    case 'task_assigned':
      return 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-950/20 dark:text-green-300'
    case 'task_due':
      if (event.color === '#7F1D1D') {
        return 'border-red-950 bg-red-100 text-red-950 dark:border-red-950 dark:bg-red-950/40 dark:text-red-100'
      }
      if (event.color === '#EF4444') {
        return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300'
      }
      if (event.color === '#EAB308') {
        return 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900/40 dark:bg-yellow-950/20 dark:text-yellow-300'
      }
      return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300'
    case 'milestone':
      return 'border-yellow-300 bg-yellow-50/50 text-yellow-800 dark:border-yellow-900/30 dark:bg-yellow-950/10 dark:text-yellow-300'
    default:
      return 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
  }
}

function getEventStylesWithBorder(event) {
  const isCompleted = ['completed', 'done', 'approved', 'published', 'resolved'].includes(String(event.status || '').toLowerCase())
  if (isCompleted) return 'border-l-4 border-gray-400 bg-gray-50 text-gray-500 border-y border-r border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'

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
      return 'border-l-4 border-gray-500 bg-gray-50 text-gray-700 border-y border-r border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
  }
}
