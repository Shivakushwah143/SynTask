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
} from 'lucide-react'
import { format } from 'date-fns'
import { timelineAPI } from '../api/timeline'
import { usersAPI } from '../api/users'
import { useAuthStore } from '../store/authStore'
import { hasCompanyAdminAccess, isLeadRole, isManagerRole } from '../utils/roles'
import { timeService } from '@/services/timeService'

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
  task_updated: { icon: PencilLine, tone: 'bg-primary-100 text-primary-700 dark:bg-primary-950/35 dark:text-primary-200' },
  task_reopened: { icon: RotateCcw, tone: 'bg-orange-100 text-orange-700 dark:bg-orange-950/35 dark:text-orange-200' },
  task_deleted: { icon: Trash2, tone: 'bg-red-100 text-red-700 dark:bg-red-950/35 dark:text-red-200' },
  attendance_check_in: { icon: LogIn, tone: 'bg-green-100 text-green-700 dark:bg-green-950/35 dark:text-green-200' },
  attendance_check_out: { icon: LogOut, tone: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200' },
  meeting_created: { icon: CalendarClock, tone: 'bg-primary-100 text-primary-700 dark:bg-primary-950/35 dark:text-primary-200' },
  meeting_joined: { icon: CalendarClock, tone: 'bg-blue-100 text-blue-700 dark:bg-blue-950/35 dark:text-blue-200' },
  meeting_completed: { icon: CheckCircle2, tone: 'bg-green-100 text-green-700 dark:bg-green-950/35 dark:text-green-200' },
  leave_requested: { icon: CalendarClock, tone: 'bg-blue-100 text-blue-700 dark:bg-blue-950/35 dark:text-blue-200' },
  leave_approved: { icon: CheckCircle2, tone: 'bg-green-100 text-green-700 dark:bg-green-950/35 dark:text-green-200' },
  leave_rejected: { icon: Trash2, tone: 'bg-red-100 text-red-700 dark:bg-red-950/35 dark:text-red-200' },
  leave_cancelled: { icon: RotateCcw, tone: 'bg-orange-100 text-orange-700 dark:bg-orange-950/35 dark:text-orange-200' },
  leave_started: { icon: LogIn, tone: 'bg-primary-100 text-primary-700 dark:bg-primary-950/35 dark:text-primary-200' },
  leave_ended: { icon: LogOut, tone: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200' },
  wfh_approved: { icon: CheckCircle2, tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-200' },
  wfh_started: { icon: LogIn, tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-200' },
  wfh_ended: { icon: LogOut, tone: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200' },
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
        ...(filters.start_date ? { start_date: timeService.toUtcISOString(filters.start_date) } : {}),
        ...(filters.end_date ? { end_date: timeService.zonedInputToUtcISOString(`${filters.end_date}T23:59:59`) } : {}),
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-header">Timeline</h1>
          <p className="mt-1 text-sm text-text-muted">Chronological employee activity feed</p>
        </div>
        {canChooseEmployee ? (
          <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="input max-w-xs">
            {teamMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {`${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="card">
        <div className="grid gap-3 md:grid-cols-4">
          <select className="input" value={filters.event_type} onChange={(event) => setFilters((current) => ({ ...current, event_type: event.target.value }))}>
            <option value="">All event types</option>
            {EVENT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select className="input" value={filters.related_module} onChange={(event) => setFilters((current) => ({ ...current, related_module: event.target.value }))}>
            <option value="">All modules</option>
            {MODULE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input className="input" type="date" value={filters.start_date} onChange={(event) => setFilters((current) => ({ ...current, start_date: event.target.value }))} />
          <input className="input" type="date" value={filters.end_date} onChange={(event) => setFilters((current) => ({ ...current, end_date: event.target.value }))} />
        </div>
      </div>

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="section-header">{selectedUserName}</h2>
            <p className="text-xs text-text-muted">{total} timeline events</p>
          </div>
        </div>

        {loading && !events.length ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
          </div>
        ) : events.length === 0 ? (
          <div className="py-16 text-center text-sm text-text-muted">No timeline events found</div>
        ) : (
          <div className="space-y-0">
            {events.map((event) => <TimelineItem key={event.id} event={event} />)}
          </div>
        )}

        {events.length < total ? (
          <div className="mt-5 flex justify-center">
            <button type="button" className="btn btn-secondary" onClick={() => fetchTimeline(skip + 25, true)} disabled={loading}>
              {loading ? 'Loading...' : 'Load more'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const TimelineItem = ({ event }) => {
  const meta = EVENT_META[event.event_type] || { icon: Clock3, tone: 'bg-surface-muted text-text-secondary' }
  const Icon = meta.icon
  const timestamp = timeService.instant(event.timestamp)

  return (
    <div className="grid grid-cols-[5.5rem_2rem_1fr] gap-3 border-b border-surface-border py-4 last:border-0">
      <time className="pt-1 text-right text-xs font-semibold text-text-secondary">{format(timestamp, 'h:mm a')}</time>
      <div className="flex flex-col items-center">
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${meta.tone}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="mt-2 h-full w-px flex-1 bg-surface-border last:hidden" />
      </div>
      <div>
        <p className="font-semibold text-text-primary">{event.title}</p>
        {event.description ? <p className="mt-1 text-sm text-text-secondary">{event.description}</p> : null}
        <p className="mt-2 text-xs text-text-muted">{format(timestamp, 'MMM d, yyyy h:mm a')}</p>
      </div>
    </div>
  )
}

export default Timeline
