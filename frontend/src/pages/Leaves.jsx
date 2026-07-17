import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, Clock, Home, Paperclip, Plus, X, Forward } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { leavesAPI } from '../api/leaves'
import { usersAPI } from '../api/users'
import { PageHeader, Button, Badge, Modal, FormField, inputClassName } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { hasCompanyAdminAccess, isAdminRole, isLeadRole, isManagerRole } from '../utils/roles'

const LEAVE_TYPES = [
  ['full_day', 'Full Day'],
  ['half_day', 'Half Day'],
  ['sick_leave', 'Sick Leave'],
  ['casual_leave', 'Casual Leave'],
  ['emergency_leave', 'Emergency Leave'],
  ['work_from_home', 'Work From Home'],
]

const STATUS_OPTIONS = ['pending', 'forwarded', 'approved', 'rejected', 'cancelled']

const defaultForm = {
  leave_type: 'full_day',
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
}

export const canSubmitLeaveRequest = (role) => !hasCompanyAdminAccess(role)

export default function Leaves() {
  const { user } = useAuthStore()
  const canManage = hasCompanyAdminAccess(user?.role) || isLeadRole(user?.role) || isManagerRole(user?.role)
  const canRequestLeave = canSubmitLeaveRequest(user?.role)
  const contentGridClassName = canRequestLeave ? 'grid gap-6 xl:grid-cols-[minmax(320px,420px)_1fr]' : 'grid gap-6'
  const [form, setForm] = useState(defaultForm)
  const [leaves, setLeaves] = useState([])
  const [calendar, setCalendar] = useState({ today: [], upcoming: [] })
  const [availability, setAvailability] = useState({ availability: 'working' })
  const [users, setUsers] = useState([])
  const [filters, setFilters] = useState({ status: '', leave_type: '', employee_id: '', start_date: '', end_date: '' })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [actionState, setActionState] = useState(defaultActionState)

  const selectedEmployeeName = useMemo(() => {
    const item = users.find((entry) => String(entry.id) === String(filters.employee_id))
    return item ? `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.email : 'All employees'
  }, [filters.employee_id, users])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const params = {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.leave_type ? { leave_type: filters.leave_type } : {}),
        ...(filters.employee_id ? { employee_id: filters.employee_id } : {}),
        ...(filters.start_date ? { start_date: new Date(filters.start_date).toISOString() } : {}),
        ...(filters.end_date ? { end_date: new Date(`${filters.end_date}T23:59:59`).toISOString() } : {}),
      }
      const [leaveData, calendarData, availabilityData] = await Promise.all([
        leavesAPI.list(params),
        leavesAPI.calendar(),
        leavesAPI.availability(),
      ])
      setLeaves(leaveData.leaves || [])
      setCalendar(calendarData || { today: [], upcoming: [] })
      setAvailability(availabilityData || { availability: 'working' })
    } catch (error) {
      console.error('Error loading leaves:', error)
      setLeaves([])
    } finally {
      setLoading(false)
    }
  }, [filters])

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

  const submitLeave = async (event) => {
    event.preventDefault()
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
    })
  }

  const closeAction = () => setActionState(defaultActionState)

  const submitAction = async (event) => {
    event.preventDefault()
    const { type, leave, comment } = actionState
    if (!leave || !type) return
    try {
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
        await leavesAPI.forward(leave.id, comment)
        toast.success('Leave forwarded to admin')
      } else if (type === 'cancel') {
        await leavesAPI.cancel(leave.id)
        toast.success('Leave cancelled')
      }
      closeAction()
      await loadData()
    } catch (error) {
      toast.error(error.response?.data?.detail || `Unable to ${type} leave`)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Management"
        description={canRequestLeave ? 'Request leave, review approvals, and see current availability.' : 'Review leave requests, approve or reject pending items, and see current availability.'}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatusCard icon={Clock} label="Availability" value={availabilityLabel(availability.availability)} colorKey={availability.availability} />
        <StatusCard icon={CalendarDays} label="On Leave Today" value={calendar.today?.filter((item) => item.leave_type !== 'work_from_home').length || 0} colorKey="pending" />
        <StatusCard icon={Home} label="WFH Today" value={calendar.today?.filter((item) => item.leave_type === 'work_from_home').length || 0} colorKey="approved" />
      </div>

      <div className={contentGridClassName}>
        {canRequestLeave ? (
          <form onSubmit={submitLeave} className="card space-y-4">
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary-600" />
              <h2 className="section-header">New Request</h2>
            </div>
            <Field label="Leave type">
              <select className="input" value={form.leave_type} onChange={(event) => setForm({ ...form, leave_type: event.target.value })}>
                {LEAVE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Start date">
                <input className="input" type="date" required value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} />
              </Field>
              <Field label="End date">
                <input className="input" type="date" required value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} />
              </Field>
            </div>
            <Field label="Reason">
              <textarea className="input min-h-28" required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
            </Field>
            <Field label="Attachment">
              <input className="input" type="file" onChange={(event) => setForm({ ...form, attachment: event.target.files?.[0] || null })} />
            </Field>
            <Button type="submit" loading={submitting} className="w-full">Submit Request</Button>
          </form>
        ) : null}

        <section className="space-y-4">
          <div className="card">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="section-header">Requests</h2>
                <p className="text-xs text-text-muted">{selectedEmployeeName}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <select className="input" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
                  <option value="">All status</option>
                  {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                <select className="input" value={filters.leave_type} onChange={(event) => setFilters({ ...filters, leave_type: event.target.value })}>
                  <option value="">All types</option>
                  {LEAVE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                {canManage ? (
                  <select className="input" value={filters.employee_id} onChange={(event) => setFilters({ ...filters, employee_id: event.target.value })}>
                    <option value="">All employees</option>
                    {users.map((item) => <option key={item.id} value={item.id}>{`${item.first_name || ''} ${item.last_name || ''}`.trim() || item.email}</option>)}
                  </select>
                ) : null}
                <input className="input" type="date" value={filters.start_date} onChange={(event) => setFilters({ ...filters, start_date: event.target.value })} />
                <input className="input" type="date" value={filters.end_date} onChange={(event) => setFilters({ ...filters, end_date: event.target.value })} />
              </div>
            </div>

            {loading ? (
              <div className="flex h-40 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
              </div>
            ) : leaves.length ? (
              <div className="space-y-3">
                {leaves.map((leave) => (
                  <LeaveRow
                    key={leave.id}
                    leave={leave}
                    canManage={canManage}
                    currentUserId={user?.id}
                    currentRole={user?.role}
                    onApprove={() => openAction('approve', leave)}
                    onReject={() => openAction('reject', leave)}
                    onForward={() => openAction('forward', leave)}
                    onCancel={() => openAction('cancel', leave)}
                  />
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-text-muted">No leave requests found</div>
            )}
          </div>

          <div className="card">
            <h2 className="section-header">Approved Leave Calendar</h2>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <CalendarList title="Today" items={calendar.today || []} />
              <CalendarList title="Upcoming" items={(calendar.upcoming || []).slice(0, 8)} />
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
                ? 'Forward to Admin'
                : 'Cancel Leave'
        }
        description={
          actionState.type === 'reject'
            ? 'Rejection reason is required and will be shown to the requester.'
            : actionState.type === 'forward'
              ? 'Forward this request so an admin can approve or reject it.'
              : actionState.type === 'cancel'
                ? 'Confirm that you want to cancel this leave request.'
                : 'Confirm approval for this leave request.'
        }
      >
        <form className="space-y-4" onSubmit={submitAction}>
          {actionState.type === 'reject' || actionState.type === 'forward' || actionState.type === 'approve' ? (
            <FormField label={actionState.type === 'reject' ? 'Rejection reason' : 'Note to reviewer'}>
              <textarea
                className={inputClassName}
                required={actionState.type === 'reject'}
                minLength={actionState.type === 'reject' ? 3 : undefined}
                value={actionState.comment}
                onChange={(event) => setActionState((current) => ({ ...current, comment: event.target.value }))}
                placeholder={actionState.type === 'reject' ? 'Explain why this leave request is rejected' : 'Optional internal note'}
                rows={4}
              />
            </FormField>
          ) : null}
          {actionState.leave ? (
            <div className="rounded-2xl border border-surface-border bg-surface-muted/60 p-4 text-sm text-text-secondary">
              <p className="font-semibold text-text-primary">{actionState.leave.employee_name || 'Employee'}</p>
              <p className="mt-1">{typeLabel(actionState.leave.leave_type)} · {dateRange(actionState.leave)}</p>
              <p className="mt-1">{actionState.leave.reason}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeAction}>Close</Button>
            <Button type="submit">
              Confirm
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function LeaveRow({ leave, canManage, currentUserId, currentRole, onApprove, onReject, onForward, onCancel }) {
  const canCancel = leave.status === 'pending' && String(leave.employee_id) === String(currentUserId)
  const canForward = canManage && isManagerRole(currentRole)
  const canAdminReviewForwarded = isAdminRole(currentRole) && leave.status === 'forwarded'
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-muted/70 p-4 dark:bg-[var(--color-app-surface-muted)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-text-primary">{typeLabel(leave.leave_type)}</p>
            <Badge label={leave.status} colorKey={leave.status} />
          </div>
          <p className="mt-1 text-sm text-text-secondary">{leave.employee_name || 'Employee'}</p>
          <p className="mt-1 text-xs text-text-muted">{dateRange(leave)}</p>
          <p className="mt-2 text-sm text-text-secondary">{leave.reason}</p>
          {leave.forwarded_to_admin ? (
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <Forward className="h-3.5 w-3.5" />
              Forwarded to admin
            </p>
          ) : null}
          {leave.attachment_url ? (
            <a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary-700 dark:text-primary-300" href={leave.attachment_url} target="_blank" rel="noreferrer">
              <Paperclip className="h-3.5 w-3.5" />
              Attachment
            </a>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && leave.status === 'pending' ? (
            <>
              <Button size="sm" onClick={onApprove}><Check className="h-4 w-4" /> Approve</Button>
              <Button size="sm" variant="danger" onClick={onReject}><X className="h-4 w-4" /> Reject</Button>
              {canForward ? (
                <Button size="sm" variant="secondary" onClick={onForward}><Forward className="h-4 w-4" /> Forward</Button>
              ) : null}
            </>
          ) : null}
          {canAdminReviewForwarded ? (
            <>
              <Button size="sm" onClick={onApprove}><Check className="h-4 w-4" /> Accept</Button>
              <Button size="sm" variant="danger" onClick={onReject}><X className="h-4 w-4" /> Reject</Button>
            </>
          ) : null}
          {canCancel ? (
            <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function CalendarList({ title, items }) {
  return (
    <div className="rounded-2xl border border-surface-border p-4">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <div className="mt-3 space-y-3">
        {items.length ? items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-text-primary">{item.employee_name || 'Employee'}</p>
              <p className="text-xs text-text-muted">{typeLabel(item.leave_type)} · {dateRange(item)}</p>
            </div>
            <Badge label={item.leave_type === 'work_from_home' ? 'WFH' : item.leave_type === 'half_day' ? 'Half-day' : 'Leave'} colorKey={item.leave_type === 'work_from_home' ? 'approved' : 'pending'} />
          </div>
        )) : <p className="text-sm text-text-muted">No items</p>}
      </div>
    </div>
  )
}

function StatusCard({ icon: Icon, label, value, colorKey }) {
  return (
    <div className="card flex items-center justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</p>
        <p className="mt-2 text-2xl font-bold text-text-primary">{value}</p>
      </div>
      <div className="rounded-2xl bg-primary-100 p-3 text-primary-700 dark:bg-primary-950/35 dark:text-primary-200">
        <Icon className="h-5 w-5" />
      </div>
      <span className="sr-only">{colorKey}</span>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-text-secondary">{label}</span>
      {children}
    </label>
  )
}

function typeLabel(type) {
  return LEAVE_TYPES.find(([value]) => value === type)?.[1] || String(type || '').replace(/_/g, ' ')
}

function availabilityLabel(value) {
  if (value === 'wfh') return 'WFH'
  if (value === 'leave') return 'Leave'
  return 'Working'
}

function dateRange(leave) {
  return `${format(new Date(leave.start_date), 'MMM d, yyyy')} - ${format(new Date(leave.end_date), 'MMM d, yyyy')}`
}
