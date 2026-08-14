import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  GitBranch,
  Loader2,
  MapPin,
  ShieldAlert,
  UserRound,
  UserRoundCheck,
  XCircle,
} from 'lucide-react'

import { Button, EmptyState, FormField, Modal, inputClassName } from '../../../../components/ui'
import { lifecycleApi } from '../../../../api/lifecycle'
import { departmentsAPI } from '../../../../api/departments'
import { usersAPI } from '../../../../api/users'
import { useLifecyclePermissions } from '../../../../hooks/useLifecyclePermissions'
import { useCanManageSalary } from '../hooks/useCanManageSalary'
import { fmtDate, labelize } from '../utils/data'

const EVENT_LABELS = {
  joined: 'Joined',
  employment_baseline: 'Employment Baseline',
  probation_started: 'Probation Started',
  probation_extended: 'Probation Extended',
  confirmed: 'Employment Confirmed',
  promoted: 'Promoted',
  designation_changed: 'Designation Changed',
  department_transferred: 'Department Transfer',
  manager_changed: 'Manager Changed',
  work_location_changed: 'Work Location Changed',
  work_mode_changed: 'Work Mode Changed',
  employment_type_changed: 'Employment Type Changed',
  resignation_submitted: 'Resignation Submitted',
  resignation_withdrawn: 'Resignation Withdrawn',
  resignation_accepted: 'Resignation Accepted',
  resignation_rejected: 'Resignation Not Accepted',
  notice_period_started: 'Notice Period Started',
  terminated: 'Terminated',
  exited: 'Exited',
}

const EVENT_ICONS = {
  joined: UserRound,
  employment_baseline: UserRound,
  probation_started: Clock,
  probation_extended: Clock,
  confirmed: BadgeCheck,
  promoted: ArrowRight,
  designation_changed: ArrowRight,
  department_transferred: Building2,
  manager_changed: UserRoundCheck,
  work_location_changed: MapPin,
  work_mode_changed: MapPin,
  employment_type_changed: ArrowRight,
  resignation_submitted: Clock,
  resignation_withdrawn: XCircle,
  resignation_accepted: CheckCircle2,
  resignation_rejected: XCircle,
  notice_period_started: Clock,
  terminated: ShieldAlert,
  exited: CheckCircle2,
}

const STATUS_COLORS = {
  onboarding: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  probation: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  notice_period: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  exited: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300',
}

const SEPARATION_STATUS_COLORS = {
  submitted: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  under_review: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  accepted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  withdrawn: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300',
  completed: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300',
}

const EVENT_COLORS = {
  joined: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
  employment_baseline: 'bg-gray-100 text-gray-500 dark:bg-gray-700/40 dark:text-gray-300',
  probation_started: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400',
  probation_extended: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400',
  confirmed: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
  promoted: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400',
  designation_changed: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400',
  department_transferred: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
  manager_changed: 'bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400',
  work_location_changed: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
  work_mode_changed: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
  employment_type_changed: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400',
  resignation_submitted: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
  resignation_withdrawn: 'bg-gray-100 text-gray-500 dark:bg-gray-700/40 dark:text-gray-300',
  resignation_accepted: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400',
  resignation_rejected: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  notice_period_started: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400',
  terminated: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  exited: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300',
}

function badge(status, colors) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${colors[status] || colors.default || ''}`}>
      {labelize(status)}
    </span>
  )
}

function InfoItem({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{value || '—'}</p>
    </div>
  )
}

function EventRow({ event, departmentName }) {
  const Icon = EVENT_ICONS[event.event_type] || GitBranch
  const color = EVENT_COLORS[event.event_type] || 'bg-gray-100 text-gray-500 dark:bg-gray-700/40 dark:text-gray-300'
  const before = event.previous_state || {}
  const after = event.new_state || {}

  let detail = null
  if (event.event_type === 'promoted' || event.event_type === 'designation_changed') {
    detail = `${before.designation || '—'} → ${after.designation || '—'}`
  } else if (event.event_type === 'department_transferred') {
    detail = 'Department changed'
  } else if (event.event_type === 'manager_changed') {
    detail = 'Reporting manager changed'
  } else if (event.event_type === 'employment_type_changed') {
    detail = `${labelize(before.employment_type)} → ${labelize(after.employment_type)}`
  } else if (event.event_type === 'work_location_changed') {
    detail = `${before.work_location || '—'} → ${after.work_location || '—'}`
  } else if (event.event_type === 'confirmed' && after.probation?.confirmation_date) {
    detail = `Confirmation date: ${fmtDate(after.probation.confirmation_date)}`
  } else if (event.event_type === 'exited' && after.exit_info?.last_working_day) {
    detail = `Last working day: ${fmtDate(after.exit_info.last_working_day)}`
  } else if (event.reason) {
    detail = event.reason
  }

  return (
    <li className="relative flex gap-4 pb-8 last:pb-0">
      <div className="flex flex-col items-center">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4 ring-white dark:ring-gray-900 ${color}`}>
          <Icon className="h-4.5 w-4.5 h-4 w-4" />
        </span>
        <span className="mt-1 h-full w-px bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {EVENT_LABELS[event.event_type] || labelize(event.event_type)}
          </p>
          {event.status === 'upcoming' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              <Clock className="h-3 w-3" /> Upcoming
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {fmtDate(event.effective_date)}
          {event.status === 'applied' && event.applied_at ? ` · applied ${fmtDate(event.applied_at)}` : ''}
        </p>
        {detail ? <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{detail}</p> : null}
        {event.status === 'upcoming' && event.new_state?.designation ? (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            New designation: <span className="font-medium text-gray-700 dark:text-gray-200">{event.new_state.designation}</span>
          </p>
        ) : null}
      </div>
    </li>
  )
}

const EMPTY_FORM = {}

export default function LifecycleTab({ employeeId, employee, canManage }) {
  const queryClient = useQueryClient()
  const perms = useLifecyclePermissions()
  const salaryPerms = useCanManageSalary()
  const canManageEffective = Boolean(canManage || perms.canManage)
  const canSeparateEffective = Boolean(canManage || perms.canSeparate)

  const [showModal, setShowModal] = useState(null)
  const [form, setForm] = useState({})
  const [error, setError] = useState(null)

  const lifecycleQuery = useQuery(
    ['employee-lifecycle', employeeId],
    () => lifecycleApi.getEmployeeLifecycle(employeeId),
    { enabled: Boolean(employeeId) },
  )
  const currentQuery = useQuery(
    ['employee-lifecycle', 'current', employeeId],
    () => lifecycleApi.getLifecycleCurrent(employeeId),
    { enabled: Boolean(employeeId) },
  )
  const departmentsQuery = useQuery(['departments'], () => departmentsAPI.listDepartments(), {
    enabled: Boolean(canManageEffective && (showModal === 'transfer' || showModal === 'promote')),
  })
  const usersQuery = useQuery(['users', 'assignable', 'employees'], () => usersAPI.getAssignableUsers(), {
    enabled: Boolean(canManageEffective && (showModal === 'transfer' || showModal === 'changeManager')),
  })

  const data = lifecycleQuery.data?.data
  const current = currentQuery.data?.data
  const departments = departmentsQuery.data || []
  const assignableUsers = usersQuery.data?.users || []

  const invalidate = () => {
    queryClient.invalidateQueries(['employee-lifecycle', employeeId])
    queryClient.invalidateQueries(['employee-lifecycle', 'current', employeeId])
    queryClient.invalidateQueries(['employees', 'detail', employeeId])
    queryClient.invalidateQueries(['employees'])
  }

  const mutation = useMutation(
    async ({ action, payload }) => {
      const calls = {
        confirm: () => lifecycleApi.confirm(employeeId, payload),
        extendProbation: () => lifecycleApi.extendProbation(employeeId, payload),
        promote: () => lifecycleApi.promote(employeeId, payload),
        changeDesignation: () => lifecycleApi.changeDesignation(employeeId, payload),
        transfer: () => lifecycleApi.transfer(employeeId, payload),
        changeManager: () => lifecycleApi.changeManager(employeeId, payload),
        changeEmploymentType: () => lifecycleApi.changeEmploymentType(employeeId, payload),
        changeWorkDetails: () => lifecycleApi.changeWorkDetails(employeeId, payload),
        acceptResignation: () => lifecycleApi.acceptResignation(employeeId, data?.active_separation?.id, payload),
        rejectResignation: () => lifecycleApi.rejectResignation(employeeId, data?.active_separation?.id, payload),
        terminate: () => lifecycleApi.terminate(employeeId, payload),
        exit: () => lifecycleApi.exit(employeeId, payload),
        completeOffboarding: () => lifecycleApi.completeOffboardingItem(employeeId, payload.itemKey, { notes: payload.notes }),
        cancelUpcoming: () => lifecycleApi.cancelUpcomingEvent(employeeId, payload.eventId),
      }
      return calls[action]()
    },
    {
      onSuccess: () => {
        invalidate()
        setShowModal(null)
        setForm({})
        setError(null)
      },
      onError: (err) => {
        setError(err?.response?.data?.detail || err?.message || 'Something went wrong. Please try again.')
      },
    },
  )

  const submit = (action) => mutation.mutate({ action, payload: form })
  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const employeeStatus = current?.employment_status || employee?.employment_status || 'onboarding'
  const isExited = employeeStatus === 'exited'
  const isNoticePeriod = employeeStatus === 'notice_period'
  const isProbation = employeeStatus === 'probation'
  const activeSeparation = data?.active_separation || current?.active_separation
  const upcoming = data?.upcoming || current?.upcoming || []

  const managerName = current?.employee?.manager_name || employee?.manager_name

  useEffect(() => {
    if (!canManageEffective) return
    if (['transfer', 'changeManager'].includes(showModal) && departments.length === 0) {
      departmentsQuery.refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal])

  if (lifecycleQuery.isLoading || currentQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  if (lifecycleQuery.isError || currentQuery.isError) {
    return (
      <EmptyState
        icon={GitBranch}
        title="Unable to load lifecycle"
        description="Something went wrong while loading this employee's lifecycle history."
        action={<Button variant="secondary" onClick={() => { lifecycleQuery.refetch(); currentQuery.refetch() }}>Try Again</Button>}
      />
    )
  }

  const events = data?.events || []

  const modalConfigs = {
    confirm: {
      title: 'Confirm Employment',
      description: 'End probation and confirm this employee (probation → active).',
      fields: (
        <>
          <FormField label="Confirmation Date" required>
            <input type="date" className={inputClassName} value={form.confirmation_date || ''} onChange={(e) => setField('confirmation_date', e.target.value)} />
          </FormField>
          <FormField label="Effective Date">
            <input type="date" className={inputClassName} value={form.effective_date || ''} onChange={(e) => setField('effective_date', e.target.value)} />
          </FormField>
          <FormField label="Notes">
            <textarea className={inputClassName} rows={3} value={form.notes || ''} onChange={(e) => setField('notes', e.target.value)} placeholder="Optional notes about this confirmation" />
          </FormField>
        </>
      ),
      confirmLabel: 'Confirm Employment',
    },
    extendProbation: {
      title: 'Extend Probation',
      description: 'Set a new probation end date. The previous date is preserved in history.',
      fields: (
        <>
          <FormField label="New Probation End" required>
            <input type="date" className={inputClassName} value={form.new_probation_end || ''} onChange={(e) => setField('new_probation_end', e.target.value)} />
          </FormField>
          <FormField label="Reason" required>
            <input className={inputClassName} value={form.reason || ''} onChange={(e) => setField('reason', e.target.value)} placeholder="Why is probation being extended?" />
          </FormField>
        </>
      ),
      confirmLabel: 'Extend Probation',
    },
    promote: {
      title: 'Promote Employee',
      description: `Current designation: ${employee?.designation || '—'}. Record the new designation with an effective date.`,
      fields: (
        <>
          <FormField label="New Designation" required>
            <input className={inputClassName} value={form.new_designation || ''} onChange={(e) => setField('new_designation', e.target.value)} placeholder="e.g. Senior Software Engineer" />
          </FormField>
          <FormField label="New Department (optional)">
            <select className={inputClassName} value={form.department_id || ''} onChange={(e) => setField('department_id', e.target.value)}>
              <option value="">Keep current department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Effective Date">
            <input type="date" className={inputClassName} value={form.effective_date || ''} onChange={(e) => setField('effective_date', e.target.value)} />
          </FormField>
          <FormField label="Reason">
            <input className={inputClassName} value={form.reason || ''} onChange={(e) => setField('reason', e.target.value)} placeholder="Reason for promotion" />
          </FormField>
          {salaryPerms.canManage && (
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" checked={Boolean(form.create_salary_revision)} onChange={(e) => setField('create_salary_revision', e.target.checked)} />
              Create a Salary Revision effective the same date (requires salary items below)
            </label>
          )}
          {form.create_salary_revision && (
            <>
              <FormField label="Salary Items (component, type, amount)">
                <textarea className={inputClassName} rows={4} value={form.salary_items_raw || ''} onChange={(e) => setField('salary_items_raw', e.target.value)} placeholder={'One per line: basic,earning,30000\nhra,earning,12000\npf,deduction,1800'} />
              </FormField>
              <FormField label="Currency">
                <input className={inputClassName} value={form.currency || 'INR'} onChange={(e) => setField('currency', e.target.value)} />
              </FormField>
            </>
          )}
          <FormField label="Notes">
            <textarea className={inputClassName} rows={3} value={form.notes || ''} onChange={(e) => setField('notes', e.target.value)} />
          </FormField>
        </>
      ),
      confirmLabel: 'Promote',
    },
    changeDesignation: {
      title: 'Change Designation',
      description: `Current designation: ${employee?.designation || '—'}.`,
      fields: (
        <>
          <FormField label="New Designation" required>
            <input className={inputClassName} value={form.new_designation || ''} onChange={(e) => setField('new_designation', e.target.value)} placeholder="e.g. Software Engineer" />
          </FormField>
          <FormField label="Effective Date">
            <input type="date" className={inputClassName} value={form.effective_date || ''} onChange={(e) => setField('effective_date', e.target.value)} />
          </FormField>
          <FormField label="Reason">
            <input className={inputClassName} value={form.reason || ''} onChange={(e) => setField('reason', e.target.value)} />
          </FormField>
        </>
      ),
      confirmLabel: 'Change Designation',
    },
    transfer: {
      title: 'Transfer Department',
      description: `Current department: ${employee?.department_name || '—'}.`,
      fields: (
        <>
          <FormField label="New Department" required>
            <select className={inputClassName} value={form.new_department_id || ''} onChange={(e) => setField('new_department_id', e.target.value)}>
              <option value="">Select department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="New Manager (optional)">
            <select className={inputClassName} value={form.new_manager_id || ''} onChange={(e) => setField('new_manager_id', e.target.value)}>
              <option value="">Keep current manager</option>
              {assignableUsers.filter((user) => String(user.id) !== String(employee?.user_id)).map((user) => (
                <option key={user.id} value={user.id}>{user.full_name || user.name || user.email}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Effective Date">
            <input type="date" className={inputClassName} value={form.effective_date || ''} onChange={(e) => setField('effective_date', e.target.value)} />
          </FormField>
          <FormField label="Reason">
            <input className={inputClassName} value={form.reason || ''} onChange={(e) => setField('reason', e.target.value)} />
          </FormField>
        </>
      ),
      confirmLabel: 'Transfer',
    },
    changeManager: {
      title: 'Change Reporting Manager',
      description: `Current manager: ${managerName || '—'}.`,
      fields: (
        <>
          <FormField label="New Manager" required>
            <select className={inputClassName} value={form.new_manager_id || ''} onChange={(e) => setField('new_manager_id', e.target.value)}>
              <option value="">Select manager</option>
              {assignableUsers.filter((user) => String(user.id) !== String(employee?.user_id)).map((user) => (
                <option key={user.id} value={user.id}>{user.full_name || user.name || user.email}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Effective Date">
            <input type="date" className={inputClassName} value={form.effective_date || ''} onChange={(e) => setField('effective_date', e.target.value)} />
          </FormField>
          <FormField label="Reason">
            <input className={inputClassName} value={form.reason || ''} onChange={(e) => setField('reason', e.target.value)} />
          </FormField>
        </>
      ),
      confirmLabel: 'Change Manager',
    },
    changeEmploymentType: {
      title: 'Change Employment Type',
      description: `Current type: ${labelize(employee?.employment_type)}.`,
      fields: (
        <>
          <FormField label="New Employment Type" required>
            <select className={inputClassName} value={form.new_employment_type || ''} onChange={(e) => setField('new_employment_type', e.target.value)}>
              <option value="">Select type</option>
              {['full_time', 'part_time', 'contract', 'internship', 'temporary'].map((type) => (
                <option key={type} value={type}>{labelize(type)}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Effective Date">
            <input type="date" className={inputClassName} value={form.effective_date || ''} onChange={(e) => setField('effective_date', e.target.value)} />
          </FormField>
          <FormField label="Reason">
            <input className={inputClassName} value={form.reason || ''} onChange={(e) => setField('reason', e.target.value)} />
          </FormField>
        </>
      ),
      confirmLabel: 'Change Type',
    },
    changeWorkDetails: {
      title: 'Change Work Details',
      description: 'Update work location and/or work mode.',
      fields: (
        <>
          <FormField label="Work Location">
            <input className={inputClassName} value={form.work_location ?? ''} onChange={(e) => setField('work_location', e.target.value)} placeholder={employee?.work_location || 'e.g. Indore, Pune, Remote'} />
          </FormField>
          <FormField label="Work Mode">
            <select className={inputClassName} value={form.work_mode || ''} onChange={(e) => setField('work_mode', e.target.value)}>
              <option value="">Keep current</option>
              {['onsite', 'remote', 'hybrid'].map((mode) => (
                <option key={mode} value={mode}>{labelize(mode)}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Effective Date">
            <input type="date" className={inputClassName} value={form.effective_date || ''} onChange={(e) => setField('effective_date', e.target.value)} />
          </FormField>
          <FormField label="Reason">
            <input className={inputClassName} value={form.reason || ''} onChange={(e) => setField('reason', e.target.value)} />
          </FormField>
        </>
      ),
      confirmLabel: 'Save Changes',
    },
    acceptResignation: {
      title: 'Accept Resignation',
      description: 'Accepting starts the notice period. The employee is NOT exited yet — a separate Exit action finalizes employment.',
      fields: (
        <>
          <FormField label="Approved Last Working Day" required>
            <input type="date" className={inputClassName} value={form.approved_last_working_day || ''} onChange={(e) => setField('approved_last_working_day', e.target.value)} />
          </FormField>
          <FormField label="Notice Period (days)">
            <input type="number" className={inputClassName} value={form.notice_period_days || ''} onChange={(e) => setField('notice_period_days', e.target.value)} />
          </FormField>
          <FormField label="Comment">
            <textarea className={inputClassName} rows={3} value={form.review_comment || ''} onChange={(e) => setField('review_comment', e.target.value)} />
          </FormField>
        </>
      ),
      confirmLabel: 'Accept Resignation',
    },
    rejectResignation: {
      title: 'Reject Resignation',
      description: 'Rejecting keeps the employee employed. A reason is required.',
      fields: (
        <FormField label="Rejection Reason" required>
          <textarea className={inputClassName} rows={3} value={form.review_comment || ''} onChange={(e) => setField('review_comment', e.target.value)} />
        </FormField>
      ),
      confirmLabel: 'Reject Resignation',
    },
    terminate: {
      title: 'Terminate Employment',
      description: 'HR-only action. Termination places the employee in notice period (or exits immediately if the last working day has passed).',
      fields: (
        <>
          <FormField label="Effective Date" required>
            <input type="date" className={inputClassName} value={form.effective_date || ''} onChange={(e) => setField('effective_date', e.target.value)} />
          </FormField>
          <FormField label="Last Working Day">
            <input type="date" className={inputClassName} value={form.last_working_day || ''} onChange={(e) => setField('last_working_day', e.target.value)} />
          </FormField>
          <FormField label="Reason Category" required>
            <input className={inputClassName} value={form.reason_category || ''} onChange={(e) => setField('reason_category', e.target.value)} placeholder="e.g. Misconduct, Redundancy" />
          </FormField>
          <FormField label="Confidential Notes (HR only)">
            <textarea className={inputClassName} rows={3} value={form.confidential_notes || ''} onChange={(e) => setField('confidential_notes', e.target.value)} />
          </FormField>
          <FormField label="Employee-Visible Note">
            <input className={inputClassName} value={form.employee_visible_note || ''} onChange={(e) => setField('employee_visible_note', e.target.value)} placeholder="Shown to the employee in My HR" />
          </FormField>
        </>
      ),
      confirmLabel: 'Terminate',
    },
    exit: {
      title: 'Complete Exit',
      description: 'Marks the employee as EXITED. All historical records (profile, documents, attendance, leave, salary, payroll, payslips, lifecycle) are preserved.',
      fields: (
        <>
          <FormField label="Last Working Day" required>
            <input type="date" className={inputClassName} value={form.last_working_day || ''} onChange={(e) => setField('last_working_day', e.target.value)} />
          </FormField>
          <FormField label="Exit Date">
            <input type="date" className={inputClassName} value={form.exit_date || ''} onChange={(e) => setField('exit_date', e.target.value)} />
          </FormField>
          <FormField label="Reason">
            <input className={inputClassName} value={form.reason || ''} onChange={(e) => setField('reason', e.target.value)} />
          </FormField>
        </>
      ),
      confirmLabel: 'Complete Exit',
      danger: true,
    },
  }

  const modal = showModal ? modalConfigs[showModal] : null

  return (
    <div className="space-y-6">
      {/* Current state header */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
            <GitBranch className="h-4 w-4 text-indigo-500" /> Current Lifecycle State
          </h3>
          {badge(employeeStatus, STATUS_COLORS)}
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          <InfoItem label="Employment Status" value={labelize(employeeStatus)} />
          <InfoItem label="Joining Date" value={fmtDate(current?.employee?.joining_date || employee?.joining_date)} />
          <InfoItem label="Confirmation Date" value={fmtDate(current?.probation?.confirmation_date || employee?.probation?.confirmation_date)} />
          <InfoItem label="Department" value={current?.employee?.department_name || employee?.department_name} />
          <InfoItem label="Designation" value={current?.employee?.designation || employee?.designation} />
          <InfoItem label="Manager" value={managerName} />
          <InfoItem label="Employment Type" value={labelize(current?.employee?.employment_type || employee?.employment_type)} />
          <InfoItem label="Work Location" value={current?.employee?.work_location || employee?.work_location} />
          {current?.exit_info?.last_working_day ? (
            <InfoItem label="Last Working Day" value={fmtDate(current.exit_info.last_working_day)} />
          ) : null}
        </div>
      </div>

      {/* Active separation */}
      {activeSeparation ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                <Clock className="h-4 w-4" /> {activeSeparation.separation_type === 'termination' ? 'Termination' : 'Resignation'} — {badge(activeSeparation.status, SEPARATION_STATUS_COLORS)}
              </h3>
              <p className="mt-1 text-sm text-amber-800/80 dark:text-amber-200/70">
                Submitted {fmtDate(activeSeparation.submitted_date)}
                {activeSeparation.requested_last_working_day ? ` · requested LWD ${fmtDate(activeSeparation.requested_last_working_day)}` : ''}
                {activeSeparation.approved_last_working_day ? ` · approved LWD ${fmtDate(activeSeparation.approved_last_working_day)}` : ''}
              </p>
              {activeSeparation.reason ? <p className="mt-1 text-sm text-amber-800/80 dark:text-amber-200/70">Reason: {activeSeparation.reason}</p> : null}
              {activeSeparation.employee_comment ? <p className="mt-1 text-sm text-amber-800/80 dark:text-amber-200/70">Comment: {activeSeparation.employee_comment}</p> : null}
            </div>
            {canSeparateEffective && ['submitted', 'under_review'].includes(activeSeparation.status) ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" onClick={() => { setError(null); setForm({}); setShowModal('rejectResignation') }}>
                  <XCircle className="mr-2 h-4 w-4" /> Reject
                </Button>
                <Button onClick={() => { setError(null); setForm({}); setShowModal('acceptResignation') }}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Accept
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Contextual actions */}
      {canManageEffective && !isExited ? (
        <div className="flex flex-wrap gap-2">
          {isProbation && !current?.probation?.confirmation_date ? (
            <Button onClick={() => { setError(null); setForm({}); setShowModal('confirm') }}>
              <BadgeCheck className="mr-2 h-4 w-4" /> Confirm Employment
            </Button>
          ) : null}
          {isProbation ? (
            <Button variant="secondary" onClick={() => { setError(null); setForm({}); setShowModal('extendProbation') }}>
              <Clock className="mr-2 h-4 w-4" /> Extend Probation
            </Button>
          ) : null}
          {!isProbation && !isNoticePeriod ? (
            <>
              <Button variant="secondary" onClick={() => { setError(null); setForm({}); setShowModal('promote') }}>
                <ArrowRight className="mr-2 h-4 w-4" /> Promote
              </Button>
              <Button variant="secondary" onClick={() => { setError(null); setForm({}); setShowModal('transfer') }}>
                <Building2 className="mr-2 h-4 w-4" /> Transfer
              </Button>
              <Button variant="secondary" onClick={() => { setError(null); setForm({}); setShowModal('changeManager') }}>
                <UserRoundCheck className="mr-2 h-4 w-4" /> Change Manager
              </Button>
              <Button variant="secondary" onClick={() => { setError(null); setForm({}); setShowModal('changeEmploymentType') }}>
                <ArrowRight className="mr-2 h-4 w-4" /> Employment Type
              </Button>
              <Button variant="secondary" onClick={() => { setError(null); setForm({}); setShowModal('changeWorkDetails') }}>
                <MapPin className="mr-2 h-4 w-4" /> Work Details
              </Button>
            </>
          ) : null}
          {canSeparateEffective && !isNoticePeriod ? (
            <Button variant="danger" onClick={() => { setError(null); setForm({}); setShowModal('terminate') }}>
              <ShieldAlert className="mr-2 h-4 w-4" /> Terminate
            </Button>
          ) : null}
          {canSeparateEffective && (isNoticePeriod || activeSeparation) && !isExited ? (
            <Button variant="danger" onClick={() => { setError(null); setForm({}); setShowModal('exit') }}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Complete Exit
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Upcoming changes */}
      {upcoming.length > 0 ? (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 dark:border-indigo-800 dark:bg-indigo-900/20">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-indigo-800 dark:text-indigo-300">
            <Clock className="h-4 w-4" /> Upcoming Changes
          </h3>
          <ul className="space-y-3">
            {upcoming.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/60 p-3 text-sm dark:bg-gray-800/60">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {EVENT_LABELS[event.event_type] || labelize(event.event_type)}
                    {event.new_state?.designation ? ` → ${event.new_state.designation}` : ''}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Effective {fmtDate(event.effective_date)}</p>
                </div>
                {canManageEffective ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => mutation.mutate({ action: 'cancelUpcoming', payload: { eventId: event.id } })}
                  >
                    <XCircle className="mr-1.5 h-3.5 w-3.5" /> Cancel
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Timeline */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Lifecycle Timeline</h3>
        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No lifecycle history is available yet.</p>
        ) : (
          <ol>
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ol>
        )}
      </div>

      {/* Offboarding */}
      {current?.offboarding ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Offboarding Checklist</h3>
          <ul className="space-y-2">
            {current.offboarding.items.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40">
                <div className="flex items-center gap-3">
                  {item.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-gray-300 dark:border-gray-600" />
                  )}
                  <div>
                    <p className={`text-sm font-medium ${item.completed ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white'}`}>{item.title}</p>
                    {item.completed_at ? <p className="text-xs text-gray-500 dark:text-gray-400">Completed {fmtDate(item.completed_at)}</p> : null}
                  </div>
                </div>
                {canManageEffective && !item.completed ? (
                  <Button size="sm" variant="secondary" onClick={() => mutation.mutate({ action: 'completeOffboarding', payload: { itemKey: item.key } })}>
                    <Check className="mr-1.5 h-3.5 w-3.5" /> Mark Complete
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Action modal */}
      {modal ? (
        <Modal
          isOpen
          onClose={() => { setShowModal(null); setError(null) }}
          title={modal.title}
          description={modal.description}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setShowModal(null); setError(null) }}>
                Cancel
              </Button>
              <Button
                variant={modal.danger ? 'danger' : 'primary'}
                disabled={mutation.isLoading}
                onClick={() => submit(showModal)}
              >
                {mutation.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {mutation.isLoading ? 'Saving…' : modal.confirmLabel}
              </Button>
            </div>
          }
        >
          {error ? (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
          <div className="space-y-4">{modal.fields}</div>
        </Modal>
      ) : null}
    </div>
  )
}
