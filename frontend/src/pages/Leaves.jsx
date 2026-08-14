import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, Clock, Home, Paperclip, Plus, X, Send, Forward, Users, Activity, Calendar, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { leavesAPI } from '../api/leaves'
import { usersAPI } from '../api/users'
import { PageHeader, Button, Badge, FormField, Modal, LoadingSpinner, inputClassName } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { ROLE, hasCompanyAdminAccess, isManagerRole, isLeadRole, normalizeRole } from '../utils/roles'
import { timeService } from '@/services/timeService'

// Phase 3 normalized model: Leave Type is a separate concept from Duration.
// Leave types come from the backend configuration (/leaves/types) — never
// hard-coded here. Duration is the separate Full Day / Half Day axis.
const LEAVE_DURATIONS = [
  ['full_day', 'Full Day'],
  ['half_day', 'Half Day'],
]

// Legacy enum values that may still appear on historical requests (display only).
const LEGACY_LEAVE_LABELS = {
  full_day: 'Full Day',
  half_day: 'Half Day',
  sick_leave: 'Sick Leave',
  casual_leave: 'Casual Leave',
  emergency_leave: 'Emergency Leave',
  work_from_home: 'Work From Home',
}

const STATUS_OPTIONS = ['pending', 'forwarded', 'approved', 'rejected', 'cancelled']

const defaultForm = {
  leave_type_id: '',
  duration: 'full_day',
  start_date: '',
  end_date: '',
  reason: '',
  attachment: null,
}

const defaultActionState = {
  open: false,
  type: null,
  leave: null,
  comment: '',
  target_user_ids: [],
}

export const canSubmitLeaveRequest = (role) => {
  const normalized = normalizeRole(role)
  return ![ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN].includes(normalized)
}

export const canReviewLeaveRequest = (leave, user) => {
  const userId = String(user?.id || '')
  const userRole = normalizeRole(user?.role)
  const employeeRole = normalizeRole(leave?.employee_role)
  if (!leave || !['pending', 'forwarded'].includes(leave.status) || !userId || String(leave.employee_id) === userId) return false
  // Managers review employee/lead requests. Once the manager forwards a request
  // to admins, only the selected reviewers decide; otherwise the manager reviews
  // their reports' requests (including legacy requests that predate the
  // pending_with_user_ids field, so it may be empty).
  if (userRole === ROLE.MANAGER) {
    if (![ROLE.EMPLOYEE, ROLE.LEAD].includes(employeeRole)) return false
    if (leave.forwarded_by) {
      const pendingIds = (leave.pending_with_user_ids || []).map(String)
      return pendingIds.includes(userId)
    }
    return true
  }
  // Admins/sub-admins review only the leaves assigned to them (pending reviewers).
  if (userRole === ROLE.ADMIN || userRole === ROLE.SUB_ADMIN) {
    const pendingIds = (leave.pending_with_user_ids || []).map(String)
    if (!pendingIds.includes(userId)) return false
    return employeeRole === ROLE.MANAGER || Boolean(leave.forwarded_by)
  }
  // Other roles may view requests but never receive approve/reject actions.
  return false
}

export const canForwardLeaveRequest = (leave, user) => {
  const userRole = normalizeRole(user?.role)
  const employeeRole = normalizeRole(leave?.employee_role)
  return userRole === ROLE.MANAGER && [ROLE.EMPLOYEE, ROLE.LEAD].includes(employeeRole) && canReviewLeaveRequest(leave, user)
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

export default function Leaves() {
  const { user } = useAuthStore()
  const canManage = hasCompanyAdminAccess(user?.role) || isManagerRole(user?.role) || isLeadRole(user?.role)
  const canRequestLeave = canSubmitLeaveRequest(user?.role)
  const contentGridClassName = canRequestLeave ? 'grid gap-6 xl:grid-cols-[minmax(320px,420px)_1fr]' : 'grid gap-6'
  const [form, setForm] = useState(defaultForm)
  const [leaves, setLeaves] = useState([])
  const [myLeaves, setMyLeaves] = useState([])
  const [calendar, setCalendar] = useState({ today: [], upcoming: [] })
  const [availability, setAvailability] = useState({ availability: 'working' })
  const [users, setUsers] = useState([])
  const [forwardTargetUsers, setForwardTargetUsers] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [filters, setFilters] = useState({ status: '', leave_type_id: '', employee_id: '', start_date: '', end_date: '' })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [actionPending, setActionPending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [actionState, setActionState] = useState(defaultActionState)
  const [myLeavesTab, setMyLeavesTab] = useState(false)

  const selectedEmployeeName = useMemo(() => {
    const item = users.find((entry) => String(entry.id) === String(filters.employee_id))
    return item ? `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.email : 'All employees'
  }, [filters.employee_id, users])

  const forwardTargets = useMemo(() => {
    const currentUserId = String(user?.id || '')
    const requesterId = String(actionState.leave?.employee_id || '')
    return forwardTargetUsers.filter((item) => {
      const role = normalizeRole(item.role)
      const id = String(item.id)
      return (role === ROLE.ADMIN || role === ROLE.SUB_ADMIN) && id !== currentUserId && id !== requesterId
    })
  }, [actionState.leave?.employee_id, forwardTargetUsers, user?.id])

  // Calculate stats
  const totalLeaves = leaves.length
  const pendingLeaves = leaves.filter(l => l.status === 'pending').length
  const approvedLeaves = leaves.filter(l => l.status === 'approved').length
  const rejectedLeaves = leaves.filter(l => l.status === 'rejected').length

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const params = {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.leave_type_id ? { leave_type_id: filters.leave_type_id } : {}),
        ...(filters.employee_id ? { employee_id: filters.employee_id } : {}),
        ...(filters.start_date ? { start_date: timeService.toUtcISOString(filters.start_date) } : {}),
        ...(filters.end_date ? { end_date: timeService.zonedInputToUtcISOString(`${filters.end_date}T23:59:59`) } : {}),
      }
      const promises = [
        leavesAPI.list(params),
        leavesAPI.calendar(),
        leavesAPI.availability(),
        leavesAPI.leaveTypes(),
      ]
      // Admins & Managers: also load their own submitted leaves separately
      if (canManage && user?.id) {
        promises.push(leavesAPI.myLeaves())
      }
      const results = await Promise.all(promises)
      const [leaveData, calendarData, availabilityData, leaveTypesData] = results
      setLeaves(leaveData.leaves || [])
      setCalendar(calendarData || { today: [], upcoming: [] })
      setAvailability(availabilityData || { availability: 'working' })
      const types = Array.isArray(leaveTypesData) ? leaveTypesData : leaveTypesData?.items || []
      setLeaveTypes(types)
      if (canManage && results[4]) {
        setMyLeaves(results[4].leaves || [])
      }
    } catch (error) {
      console.error('Error loading leaves:', error)
      setLeaves([])
    } finally {
      setLoading(false)
    }
  }, [filters, canManage, user?.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!canManage) return
    const loadUsers = async () => {
      try {
        const data = hasCompanyAdminAccess(user?.role) || isManagerRole(user?.role)
          ? await usersAPI.listUsers(null, null, null, 0, 100)
          : await usersAPI.getMyTeam()
        setUsers(data.users || data.team_members || [])
      } catch (error) {
        console.error('Error loading leave users:', error)
      }
    }
    loadUsers()
  }, [canManage, user?.role])

  useEffect(() => {
    if (!isManagerRole(user?.role)) return
    const loadForwardTargets = async () => {
      try {
        const data = await leavesAPI.forwardTargets()
        setForwardTargetUsers(data.users || [])
      } catch (error) {
        console.error('Error loading leave forward targets:', error)
        setForwardTargetUsers([])
      }
    }
    loadForwardTargets()
  }, [user?.role])

  const submitLeave = async (event) => {
    event.preventDefault()
    // Client-side date validation
    if (!form.leave_type_id) {
      toast.error('Please select a leave type')
      return
    }
    if (!form.start_date || !form.end_date) {
      toast.error('Please select both start and end dates')
      return
    }
    if (form.end_date < form.start_date) {
      toast.error('End date cannot be before start date')
      return
    }
    if (!form.reason.trim()) {
      toast.error('Please provide a reason for your leave request')
      return
    }
    try {
      setSubmitting(true)
      await leavesAPI.create(form)
      toast.success('Leave request submitted')
      setForm(defaultForm)
      await loadData()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Unable to submit leave')
    } finally {
      setSubmitting(false)
    }
  }

  const openAction = (type, leave) => {
    setActionState({
      open: true,
      type,
      leave,
      comment: type === 'reject' ? leave?.review_comment || '' : '',
      target_user_ids: [],
    })
  }

  const closeAction = () => setActionState(defaultActionState)

  const submitAction = async (event) => {
    event.preventDefault()
    const { type, leave, comment, target_user_ids } = actionState
    if (!leave || !type) return
    try {
      setActionPending(true)
      if (type === 'approve') {
        await leavesAPI.approve(leave.id, comment)
        toast.success('Leave approved')
      } else if (type === 'reject') {
        if (!comment.trim()) {
          toast.error('Rejection reason is required')
          return
        }
        await leavesAPI.reject(leave.id, comment)
        toast.success('Leave rejected')
      } else if (type === 'forward') {
        if (!(target_user_ids || []).length) {
          toast.error('Select at least one reviewer')
          return
        }
        if (!comment.trim()) {
          toast.error('Forwarding reason is required')
          return
        }
        await leavesAPI.forward(leave.id, { target_user_ids, comment })
        toast.success('Leave forwarded')
      } else if (type === 'cancel') {
        await leavesAPI.cancel(leave.id)
        toast.success('Leave cancelled')
      }
      closeAction()
      await loadData()
    } catch (error) {
      toast.error(error.response?.data?.detail || `Unable to ${type} leave`)
    } finally {
      setActionPending(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await loadData()
    } finally {
      setRefreshing(false)
    }
  }

  // Only mark a row's action button as busy while the API request is actually in
  // flight (not just because its modal is open), so the loading icon appears at
  // the moment the action is submitted.
  const busyAction = actionPending && actionState.open && actionState.leave
    ? { type: actionState.type, leaveId: String(actionState.leave.id || '') }
    : null

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-lime-600 via-green-600 to-emerald-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
              <CalendarDays className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">Leave Management</h1>
              <p className="mt-1 text-indigo-100">
                {canRequestLeave ? 'Request leave, review approvals, and see current availability.' : 'Review leave requests, approve or reject pending items, and see current availability.'}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {refreshing ? <LoadingSpinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Requests"
          value={totalLeaves}
          icon={Activity}
          color="indigo"
          subtitle="All leave requests"
        />
        <StatCard
          label="Pending"
          value={pendingLeaves}
          icon={Clock}
          color="amber"
          subtitle="Awaiting review"
        />
        <StatCard
          label="Approved"
          value={approvedLeaves}
          icon={Check}
          color="emerald"
          subtitle="Approved requests"
        />
        <StatCard
          label="Rejected"
          value={rejectedLeaves}
          icon={X}
          color="rose"
          subtitle="Rejected requests"
        />
      </div>

      {/* Quick Status Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatusCard 
          icon={Clock} 
          label="Availability" 
          value={availabilityLabel(availability.availability)} 
          colorKey={availability.availability} 
        />
        <StatusCard 
          icon={CalendarDays} 
          label="On Leave Today" 
          value={calendar.today?.filter((item) => item.leave_type !== 'work_from_home').length || 0} 
          colorKey="pending" 
        />
        <StatusCard 
          icon={Home} 
          label="WFH Today" 
          value={calendar.today?.filter((item) => item.leave_type === 'work_from_home').length || 0} 
          colorKey="approved" 
        />
      </div>

      <div className={contentGridClassName}>
        {canRequestLeave ? (
          <form onSubmit={submitLeave} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3 dark:border-gray-700">
              <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                <Plus className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h2 className="font-bold text-gray-900 dark:text-white">New Request</h2>
            </div>
            <div className="space-y-4">
              <FormField label="Leave type" required>
                <select 
                  className={`${inputClassName} bg-gray-50 dark:bg-gray-900/50`} 
                  value={form.leave_type_id} 
                  onChange={(event) => setForm({ ...form, leave_type_id: event.target.value })}
                >
                  <option value="">Select leave type…</option>
                  {leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select>
              </FormField>
              <FormField label="Duration">
                <select 
                  className={`${inputClassName} bg-gray-50 dark:bg-gray-900/50`} 
                  value={form.duration} 
                  onChange={(event) => setForm({ ...form, duration: event.target.value })}
                >
                  {LEAVE_DURATIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </FormField>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Start date" required>
                  <input 
                    className={`${inputClassName} bg-gray-50 dark:bg-gray-900/50`} 
                    type="date" 
                    required 
                    value={form.start_date} 
                    onChange={(event) => setForm({ ...form, start_date: event.target.value })} 
                  />
                </FormField>
                <FormField label="End date" required>
                  <input 
                    className={`${inputClassName} bg-gray-50 dark:bg-gray-900/50`} 
                    type="date" 
                    required 
                    value={form.end_date} 
                    onChange={(event) => setForm({ ...form, end_date: event.target.value })} 
                  />
                </FormField>
              </div>
              <FormField label="Reason" required>
                <textarea 
                  className={`${inputClassName} min-h-28 resize-y bg-gray-50 dark:bg-gray-900/50`} 
                  required 
                  value={form.reason} 
                  onChange={(event) => setForm({ ...form, reason: event.target.value })} 
                  placeholder="Please provide details for your leave request..."
                />
              </FormField>
              <FormField label="Attachment">
                <input 
                  className={`${inputClassName} bg-gray-50 dark:bg-gray-900/50`} 
                  type="file" 
                  onChange={(event) => setForm({ ...form, attachment: event.target.files?.[0] || null })} 
                />
              </FormField>
              <Button type="submit" loading={submitting} className="w-full">
                <Send className="h-4 w-4 mr-2" />
                Submit Request
              </Button>
            </div>
          </form>
        ) : null}

        <section className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                    <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900 dark:text-white">Requests</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{myLeavesTab ? 'My submitted requests' : selectedEmployeeName}</p>
                  </div>
                </div>
                {canManage && canRequestLeave && (
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden dark:border-gray-600">
                    <button
                      type="button"
                      onClick={() => setMyLeavesTab(false)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${!myLeavesTab ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                    >
                      Team
                    </button>
                    <button
                      type="button"
                      onClick={() => setMyLeavesTab(true)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${myLeavesTab ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                    >
                      My Requests
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4">
              {!myLeavesTab && (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5 mb-4">
                <select 
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white" 
                  value={filters.status} 
                  onChange={(event) => setFilters({ ...filters, status: event.target.value })}
                >
                  <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All status</option>
                  {STATUS_OPTIONS.map((status) => <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={status} value={status}>{status}</option>)}
                </select>
                <select 
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white" 
                  value={filters.leave_type_id} 
                  onChange={(event) => setFilters({ ...filters, leave_type_id: event.target.value })}
                >
                  <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All types</option>
                  {leaveTypes.map((type) => <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={type.id} value={type.id}>{type.name}</option>)}
                </select>
                {canManage ? (
                  <select 
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white" 
                    value={filters.employee_id} 
                    onChange={(event) => setFilters({ ...filters, employee_id: event.target.value })}
                  >
                    <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All employees</option>
                    {users.map((item) => <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={item.id} value={item.id}>{`${item.first_name || ''} ${item.last_name || ''}`.trim() || item.email}</option>)}
                  </select>
                ) : null}
                <input 
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white" 
                  type="date" 
                  value={filters.start_date} 
                  onChange={(event) => setFilters({ ...filters, start_date: event.target.value })} 
                />
                <input 
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white" 
                  type="date" 
                  value={filters.end_date} 
                  onChange={(event) => setFilters({ ...filters, end_date: event.target.value })} 
                />
              </div>
              )}

              {loading ? (
                <div className="flex h-40 items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-gray-500 dark:text-gray-400">Loading requests...</p>
                  </div>
                </div>
              ) : (myLeavesTab ? myLeaves : leaves).length ? (
                <div className="space-y-3">
                  {(myLeavesTab ? myLeaves : leaves).map((leave) => (
                    <LeaveRow
                      key={leave.id}
                      leave={leave}
                      currentUserId={user?.id}
                      currentUser={user}
                      currentRole={user?.role}
                      busyAction={busyAction}
                      onApprove={() => openAction('approve', leave)}
                      onReject={() => openAction('reject', leave)}
                      onForward={() => openAction('forward', leave)}
                      onCancel={() => openAction('cancel', leave)}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                    <CalendarDays className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">No leave requests found</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{myLeavesTab ? 'You have not submitted any leave requests yet.' : 'Try adjusting your filters or create a new request.'}</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 bg-gradient-to-r from-emerald-50/50 to-white p-4 dark:border-gray-700 dark:from-emerald-950/20 dark:to-gray-800">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/30">
                  <Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 dark:text-white">Approved Leave Calendar</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Today's and upcoming leaves</p>
                </div>
              </div>
            </div>
            <div className="p-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <CalendarList title="Today" items={calendar.today || []} />
                <CalendarList title="Upcoming" items={(calendar.upcoming || []).slice(0, 8)} />
              </div>
            </div>
          </div>
        </section>
      </div>

      <Modal
        isOpen={actionState.open}
        onClose={closeAction}
        title={
          actionState.type === 'approve'
            ? 'Approve Leave'
            : actionState.type === 'reject'
              ? 'Reject Leave'
              : actionState.type === 'forward'
                ? 'Forward to Admin/Sub Admin'
                : 'Cancel Leave'
        }
        description={
          actionState.type === 'reject'
            ? 'Rejection reason is required and will be shown to the requester.'
            : actionState.type === 'forward'
              ? 'Forward this request so an Admin or Sub Admin can approve or reject it.'
              : actionState.type === 'cancel'
                ? 'Confirm that you want to cancel this leave request.'
                : 'Confirm approval for this leave request.'
        }
      >
        <form className="space-y-4" onSubmit={submitAction}>
          {actionState.type === 'reject' || actionState.type === 'forward' || actionState.type === 'approve' ? (
            <>
              {actionState.type === 'forward' ? (
                <FormField label="Reviewers" required>
                  <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-2 dark:border-gray-700">
                    {forwardTargets.length ? forwardTargets.map((item) => {
                      const reviewerId = String(item.id)
                      const checked = (actionState.target_user_ids || []).map(String).includes(reviewerId)
                      return (
                        <label
                          key={reviewerId}
                          className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-gray-50 dark:hover:bg-gray-800/60"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            checked={checked}
                            onChange={() => setActionState((current) => ({
                              ...current,
                              target_user_ids: checked
                                ? (current.target_user_ids || []).filter((targetId) => String(targetId) !== reviewerId)
                                : [...(current.target_user_ids || []), reviewerId],
                            }))}
                          />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {`${item.first_name || ''} ${item.last_name || ''}`.trim() || item.email}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            ({normalizeRole(item.role).replace(/_/g, ' ')})
                          </span>
                        </label>
                      )
                    }) : <p className="px-2 py-2 text-sm text-gray-500 dark:text-gray-400">No reviewer available</p>}
                  </div>
                </FormField>
              ) : null}
              <FormField label={actionState.type === 'reject' ? 'Rejection reason' : actionState.type === 'forward' ? 'Forwarding reason' : 'Note to reviewer'} required={actionState.type === 'reject' || actionState.type === 'forward'}>
                <textarea
                  className={inputClassName}
                  required={actionState.type === 'reject' || actionState.type === 'forward'}
                  minLength={actionState.type === 'reject' || actionState.type === 'forward' ? 3 : undefined}
                  value={actionState.comment}
                  onChange={(event) => setActionState((current) => ({ ...current, comment: event.target.value }))}
                  placeholder={actionState.type === 'reject' ? 'Explain why this leave request is rejected' : actionState.type === 'forward' ? 'Explain why this request needs admin review' : 'Optional internal note'}
                  rows={4}
                />
              </FormField>
            </>
          ) : null}
          {actionState.leave ? (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-4 text-sm text-indigo-950 shadow-sm dark:border-indigo-500/25 dark:bg-indigo-950/20 dark:text-indigo-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{actionState.leave.employee_name || 'Employee'}</p>
                <Badge label={actionState.leave.status} colorKey={actionState.leave.status} />
              </div>
              <p className="mt-1">{leaveDisplayName(actionState.leave)} · {dateRange(actionState.leave)}</p>
              <p className="mt-3 leading-6 text-gray-600 dark:text-indigo-100/85">{actionState.leave.reason}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeAction} disabled={actionPending}>Close</Button>
            <Button type="submit" loading={actionPending} loadingText={actionState.type === 'forward' ? 'Forwarding' : actionState.type === 'approve' ? 'Approving' : actionState.type === 'reject' ? 'Rejecting' : 'Cancelling'}>Confirm</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// Missing import for RefreshCw
import { RefreshCw } from 'lucide-react'

function LeaveRow({ leave, currentUserId, currentUser, busyAction, onApprove, onReject, onForward, onCancel }) {
  const canCancel = leave.status === 'pending' && String(leave.employee_id) === String(currentUserId)
  const canReview = canReviewLeaveRequest(leave, currentUser)
  const canForward = canForwardLeaveRequest(leave, currentUser)
  const leaveId = String(leave.id || '')
  const isBusy = (type) => busyAction?.type === type && busyAction.leaveId === leaveId
  
  const statusColors = {
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    forwarded: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-indigo-200 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800/50 dark:hover:border-indigo-700">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-gray-900 dark:text-white">{leaveDisplayName(leave)}</p>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[leave.status] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
              {leave.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{leave.employee_name || 'Employee'}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{dateRange(leave)}</p>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{leave.reason}</p>
          {leave.forwarded_to_admin ? (
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
              <Forward className="h-3.5 w-3.5" />
              Forwarded to Admin/Sub Admin
            </p>
          ) : null}
          {leave.attachment_url ? (
            <a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300" href={leave.attachment_url} target="_blank" rel="noreferrer">
              <Paperclip className="h-3.5 w-3.5" />
              Attachment
            </a>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {canReview ? (
            <>
              <Button size="sm" onClick={onApprove} loading={isBusy('approve')} className="gap-1.5">
                <Check className="h-4 w-4" /> Approve
              </Button>
              <Button size="sm" variant="danger" onClick={onReject} loading={isBusy('reject')} className="gap-1.5">
                <X className="h-4 w-4" /> Reject
              </Button>
            </>
          ) : null}
          {canForward ? (
            <Button size="sm" variant="secondary" onClick={onForward} loading={isBusy('forward')} className="gap-1.5">
              <Send className="h-4 w-4" /> Forward
            </Button>
          ) : null}
          {canCancel ? (
            <Button size="sm" variant="secondary" onClick={onCancel} loading={isBusy('cancel')} className="gap-1.5">
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function CalendarList({ title, items }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      <div className="mt-3 space-y-3">
        {items.length ? items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 shadow-sm dark:bg-gray-800">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{item.employee_name || 'Employee'}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{leaveDisplayName(item)} · {dateRange(item)}</p>
            </div>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              item.leave_type === 'work_from_home' 
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' 
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
            }`}>
              {item.leave_type === 'work_from_home' ? 'WFH' : item.duration === 'half_day' ? 'Half-day' : leaveDisplayName(item)}
            </span>
          </div>
        )) : <p className="text-sm text-gray-500 dark:text-gray-400">No items</p>}
      </div>
    </div>
  )
}

function StatusCard({ icon: Icon, label, value, colorKey }) {
  const colors = {
    working: 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/50 dark:bg-emerald-950/20',
    wfh: 'border-blue-200 bg-blue-50/50 dark:border-blue-800/50 dark:bg-blue-950/20',
    leave: 'border-amber-200 bg-amber-50/50 dark:border-amber-800/50 dark:bg-amber-950/20',
  }

  return (
    <div className={`rounded-2xl border ${colors[colorKey] || 'border-gray-200 bg-white'} p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        </div>
        <div className="rounded-xl bg-indigo-100 p-3 text-indigo-700 shadow-sm dark:bg-indigo-950/35 dark:text-indigo-200">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

function typeLabel(type) {
  if (!type) return 'Leave'
  return LEGACY_LEAVE_LABELS[type] || String(type).replace(/_/g, ' ')
}

// Normalized leaves carry leave_type_name from the backend; legacy ones fall
// back to the legacy label mapping.
function leaveDisplayName(leave) {
  if (leave?.leave_type_name) return leave.leave_type_name
  return typeLabel(leave?.leave_type)
}

function availabilityLabel(value) {
  if (value === 'wfh') return 'WFH'
  if (value === 'leave') return 'Leave'
  return 'Working'
}

function dateRange(leave) {
  return `${timeService.formatDateOnly(leave.start_date)} - ${timeService.formatDateOnly(leave.end_date)}`
}
