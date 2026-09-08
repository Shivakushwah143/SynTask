import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Briefcase,
  Contact,
  FileEdit,
  GitBranch,
  Lock,
  MapPin,
  Pencil,
  Send,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react'
import { useMyLifecycle, useMyLifecycleActions, useMyProfile, useUpdateMyProfile } from '../../../hooks/useMyHr'
import { useCreateChangeRequest, useMyChangeRequests } from '../../../hooks/useChangeRequests'
import { hasCompanyAdminAccess } from '../../../utils/roles'
import { Button, EmptyState, FormField, LoadingSpinner, Modal, Skeleton, inputClassName } from '../../../components/ui'
import {
  EMPLOYMENT_STATUS_BADGES,
  EMPLOYMENT_STATUS_LABELS,
  formatDate,
} from './myHrUtils'

const LIFECYCLE_EVENT_LABELS = {
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
  exited: 'Exited',
}

const SEPARATION_STATUS_BADGES = {
  submitted: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  under_review: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  accepted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  withdrawn: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300',
  completed: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300',
}

const MyProfile = () => {
  const { data: profile, isLoading, isError, error, refetch } = useMyProfile()
  const { data: lifecycle, isLoading: lifecycleLoading } = useMyLifecycle()
  const lifecycleActions = useMyLifecycleActions()
  const [editOpen, setEditOpen] = useState(false)
  const [changeReqOpen, setChangeReqOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resignOpen, setResignOpen] = useState(false)
  const updateProfile = useUpdateMyProfile()
  const createChangeRequest = useCreateChangeRequest()
  const { data: myRequests } = useMyChangeRequests({ page_size: 5 })

  // Role check: Admin/SubAdmin/SuperAdmin can edit directly
  const canDirectEdit = hasCompanyAdminAccess(profile?.role)
  const hasPendingRequest = myRequests?.items?.some((r) => r.status === 'pending') || false

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError || !profile) {
    return (
      <EmptyState
        icon={UserRound}
        title="Unable to load your employee profile"
        description={error?.response?.data?.detail || 'Please try again in a moment.'}
        action={<Button variant="secondary" onClick={() => refetch()}>Retry</Button>}
      />
    )
  }

  const statusBadge = EMPLOYMENT_STATUS_BADGES[profile.employment_status] || EMPLOYMENT_STATUS_BADGES.active
  const address = profile.address || {}
  const emergency = profile.emergency_contact || {}

  const handleSave = async (payload) => {
    setSaving(true)
    try {
      await updateProfile.mutateAsync(payload)
      toast.success('Personal details updated')
      setEditOpen(false)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to update your details')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Employment information — HR managed, read-only for non-admins */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
              <Briefcase className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Employment Information</h3>
          </div>
          {canDirectEdit ? (
            <Button variant="secondary" size="sm" onClick={() => toast('Use the Employee Management page to edit employment details', { icon: 'ℹ️' })}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit Employment
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
              <Lock className="h-3 w-3" /> Managed by HR
            </span>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Employee Number" value={profile.employee_number} />
          <Field label="Full Name" value={profile.full_name} />
          <Field label="Work Email" value={profile.email} />
          <Field label="Department" value={profile.department_name} />
          <Field label="Designation" value={profile.designation} />
          <Field
            label="Employment Status"
            value={
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge}`}>
                {EMPLOYMENT_STATUS_LABELS[profile.employment_status] || profile.employment_status}
              </span>
            }
          />
          <Field label="Employment Type" value={profile.employment_type ? profile.employment_type.replace(/_/g, ' ') : '-'} />
          <Field label="Joining Date" value={formatDate(profile.joining_date)} />
          <Field label="Reporting Manager" value={profile.manager_name} />
          <Field label="Work Mode" value={profile.work_mode ? profile.work_mode.replace(/_/g, ' ') : '-'} />
          <Field label="Work Location" value={profile.work_location} />
        </div>
      </section>

      {/* Contact & address — employee editable (direct or via change request) */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <MapPin className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Contact & Address</h3>
          </div>
          {canDirectEdit ? (
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit Personal Details
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setChangeReqOpen(true)}
              disabled={hasPendingRequest}
            >
              <FileEdit className="mr-1.5 h-3.5 w-3.5" />
              {hasPendingRequest ? 'Request Pending…' : 'Request Detail Change'}
            </Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Phone" value={profile.phone || '-'} />
          <Field label="Personal Email" value={profile.personal_email || '-'} />
          <Field label="Personal Phone" value={profile.personal_phone || '-'} />
          <Field
            label="Address"
            value={[address.line1, address.line2, address.city, address.state, address.postal_code, address.country].filter(Boolean).join(', ') || '-'}
          />
          <Field label="Emergency Contact" value={[emergency.name, emergency.relationship, emergency.phone].filter(Boolean).join(' · ') || '-'} />
        </div>
      </section>

      <EmploymentJourneySection
        lifecycle={lifecycle?.data}
        loading={lifecycleLoading}
        onOpenResignation={() => setResignOpen(true)}
        onWithdraw={async (separationId) => {
          try {
            await lifecycleActions.mutateAsync({ action: 'withdraw_resignation', separation_id: separationId })
            toast.success('Resignation withdrawn')
          } catch (err) {
            toast.error(err?.response?.data?.detail || 'Failed to withdraw resignation')
          }
        }}
      />

      {/* Change request history — non-admin users */}
      {!canDirectEdit && myRequests?.items?.length > 0 && (
        <ChangeRequestHistory requests={myRequests.items} />
      )}

      <EditProfileModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        profile={profile}
        saving={saving}
        onSave={handleSave}
      />

      <ChangeRequestModal
        isOpen={changeReqOpen}
        onClose={() => setChangeReqOpen(false)}
        profile={profile}
        submitting={createChangeRequest.isLoading}
        onSubmit={async (payload) => {
          try {
            await createChangeRequest.mutateAsync(payload)
            toast.success('Change request submitted. Your manager will review it.')
            setChangeReqOpen(false)
          } catch (err) {
            toast.error(err?.response?.data?.detail || 'Failed to submit change request')
          }
        }}
      />

      <ResignationModal
        isOpen={resignOpen}
        onClose={() => setResignOpen(false)}
        lifecycle={lifecycle?.data}
        submitting={lifecycleActions.isLoading}
        onSubmit={async (payload) => {
          try {
            await lifecycleActions.mutateAsync({ action: 'submit_resignation', ...payload })
            toast.success('Resignation submitted. HR will review it.')
            setResignOpen(false)
          } catch (err) {
            toast.error(err?.response?.data?.detail || 'Failed to submit resignation')
          }
        }}
        onWithdraw={async (separationId) => {
          try {
            await lifecycleActions.mutateAsync({ action: 'withdraw_resignation', separation_id: separationId })
            toast.success('Resignation withdrawn')
          } catch (err) {
            toast.error(err?.response?.data?.detail || 'Failed to withdraw resignation')
          }
        }}
      />
    </div>
  )
}

function EmploymentJourneySection({ lifecycle, loading, onOpenResignation, onWithdraw }) {
  const events = lifecycle?.events || []
  const activeSeparation = lifecycle?.active_separation
  const canSubmit = !activeSeparation && !['exited', 'notice_period'].includes(lifecycle?.employment_status)

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-violet-50 p-1.5 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
            <GitBranch className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">My Employment Journey</h3>
        </div>
        {canSubmit ? (
          <Button variant="secondary" size="sm" onClick={onOpenResignation}>
            <Send className="mr-1.5 h-3.5 w-3.5" /> Submit Resignation
          </Button>
        ) : null}
      </div>

      {activeSeparation ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Resignation {activeSeparation.status === 'accepted' ? 'Accepted' : 'Under Review'}
            </p>
            <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-200/70">
              Submitted {formatDate(activeSeparation.submitted_date)}
              {activeSeparation.requested_last_working_day ? ` · requested LWD ${formatDate(activeSeparation.requested_last_working_day)}` : ''}
              {activeSeparation.approved_last_working_day ? ` · approved LWD ${formatDate(activeSeparation.approved_last_working_day)}` : ''}
            </p>
          </div>
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${SEPARATION_STATUS_BADGES[activeSeparation.status] || 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300'}`}>
            {activeSeparation.status.replace(/_/g, ' ')}
          </span>
        </div>
      ) : null}

      {activeSeparation && ['submitted', 'under_review'].includes(activeSeparation.status) ? (
        <Button size="sm" variant="secondary" onClick={() => onWithdraw && onWithdraw(activeSeparation.id)} className="mb-4">
          <XCircle className="mr-1.5 h-3.5 w-3.5" /> Withdraw Request
        </Button>
      ) : null}

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : events.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">No employment history is available yet.</p>
      ) : (
        <ol className="relative border-l border-gray-200 pl-5 dark:border-gray-700">
          {events.map((event) => (
            <li key={event.id} className="relative pb-5 last:pb-0">
              <span className="absolute -left-[26px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-indigo-100 dark:border-gray-800 dark:bg-indigo-900/50">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
              </span>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {LIFECYCLE_EVENT_LABELS[event.event_type] || event.event_type.replace(/_/g, ' ')}
              </p>
              <p className="text-xs text-gray-400">{formatDate(event.effective_date)}</p>
              {event.reason ? <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{event.reason}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function ResignationModal({ isOpen, onClose, lifecycle, submitting, onSubmit, onWithdraw }) {
  const [form, setForm] = useState(null)
  const [error, setError] = useState(null)
  const activeSeparation = lifecycle?.active_separation
  const current = form || { requested_last_working_day: '', reason: '', comments: '' }
  const set = (key, value) => setForm((prev) => ({ ...(prev || current), [key]: value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    if (!current.requested_last_working_day) {
      setError('A requested last working day is required.')
      return
    }
    try {
      await onSubmit(current)
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to submit resignation')
    }
  }

  return (
    <Modal
      isOpen={Boolean(isOpen)}
      onClose={() => { onClose(); setError(null) }}
      title="Submit Resignation"
      description="Submitting a resignation does not end your employment immediately — HR will review it and your notice period starts only after acceptance."
      size="lg"
      bodyClassName="max-h-[70vh] overflow-y-auto"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" form="my-hr-resignation-form" loading={submitting} loadingText="Submitting…">
            <Send className="mr-2 h-4 w-4" /> Submit Resignation
          </Button>
        </div>
      }
    >
      <form id="my-hr-resignation-form" onSubmit={handleSubmit} className="space-y-4">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </div>
        ) : null}
        <FormField label="Requested Last Working Day" required>
          <input
            type="date"
            className={inputClassName}
            value={current.requested_last_working_day}
            onChange={(event) => set('requested_last_working_day', event.target.value)}
          />
        </FormField>
        <FormField label="Reason">
          <input
            className={inputClassName}
            value={current.reason}
            onChange={(event) => set('reason', event.target.value)}
            placeholder="e.g. Personal, Better opportunity"
          />
        </FormField>
        <FormField label="Comments">
          <textarea
            className={inputClassName}
            rows={4}
            value={current.comments}
            onChange={(event) => set('comments', event.target.value)}
            placeholder="Anything you would like HR to know"
          />
        </FormField>
      </form>
    </Modal>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200">{value || '-'}</p>
    </div>
  )
}

export function ChangeRequestModal({ isOpen, onClose, profile, submitting, onSubmit }) {
  const address = profile?.address || {}
  const emergency = profile?.emergency_contact || {}
  const [form, setForm] = useState(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  useEffect(() => {
    if (isOpen) {
      setForm(null)
      setReason('')
      setError(null)
    }
  }, [isOpen])

  const current = form || {
    personal_email: profile?.personal_email || '',
    personal_phone: profile?.personal_phone || '',
    address_line1: address.line1 || '',
    address_line2: address.line2 || '',
    address_city: address.city || '',
    address_state: address.state || '',
    address_postal_code: address.postal_code || '',
    address_country: address.country || '',
    emergency_name: emergency.name || '',
    emergency_relationship: emergency.relationship || '',
    emergency_phone: emergency.phone || '',
    emergency_alternate_phone: emergency.alternate_phone || '',
  }

  const set = (key, value) => setForm((prev) => ({ ...(prev || current), [key]: value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    // Build changes — only send fields that differ from the current profile
    const changes = {}
    if (current.personal_email !== (profile?.personal_email || '')) changes.personal_email = current.personal_email?.trim() || null
    if (current.personal_phone !== (profile?.personal_phone || '')) changes.personal_phone = current.personal_phone?.trim() || null

    const currentAddress = {
      line1: current.address_line1 || null,
      line2: current.address_line2 || null,
      city: current.address_city || null,
      state: current.address_state || null,
      postal_code: current.address_postal_code || null,
      country: current.address_country || null,
    }
    const origAddress = address || {}
    const addressChanged = Object.keys(currentAddress).some(
      (k) => (currentAddress[k] || '') !== (origAddress[k] || ''),
    )
    if (addressChanged) changes.address = currentAddress

    const currentEc = {
      name: current.emergency_name?.trim() || null,
      relationship: current.emergency_relationship?.trim() || null,
      phone: current.emergency_phone?.trim() || null,
      alternate_phone: current.emergency_alternate_phone?.trim() || null,
    }
    const origEc = emergency || {}
    const ecChanged = Object.keys(currentEc).some(
      (k) => (currentEc[k] || '') !== (origEc[k] || ''),
    )
    if (ecChanged) changes.emergency_contact = currentEc

    if (Object.keys(changes).length === 0) {
      setError('No changes detected. Please modify at least one field.')
      return
    }

    await onSubmit({ changes, reason: reason.trim() || undefined })
  }

  return (
    <Modal
      isOpen={Boolean(isOpen)}
      onClose={() => { onClose(); setError(null) }}
      title="Request Detail Change"
      description="Submit a change request for your personal details. Your manager will review and approve or reject it."
      size="lg"
      bodyClassName="max-h-[70vh] overflow-y-auto"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" form="change-request-form" loading={submitting} loadingText="Submitting…">
            <Send className="mr-2 h-4 w-4" /> Submit Request
          </Button>
        </div>
      }
    >
      <form id="change-request-form" onSubmit={handleSubmit} className="space-y-5">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </div>
        ) : null}

        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          <p className="font-medium">How it works:</p>
          <p className="mt-1">Modify the fields you need changed below. Only fields that differ from your current values will be submitted. Your manager or HR will review and approve or reject the request.</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Existing account details</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Full name"><input className={inputClassName} value={profile?.full_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()} disabled /></FormField>
            <FormField label="Work email"><input className={inputClassName} value={profile?.email || ''} disabled /></FormField>
            <FormField label="Role"><input className={inputClassName} value={profile?.role ? profile.role.replace(/_/g, ' ') : ''} disabled /></FormField>
            <FormField label="Employee number"><input className={inputClassName} value={profile?.employee_number || ''} disabled /></FormField>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">These fields are shown for reference and cannot be changed through a detail request.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Personal email">
            <input
              type="email"
              className={inputClassName}
              value={current.personal_email}
              onChange={(event) => set('personal_email', event.target.value)}
              placeholder="personal@example.com"
            />
          </FormField>
          <FormField label="Personal phone">
            <input
              type="tel"
              className={inputClassName}
              value={current.personal_phone}
              onChange={(event) => set('personal_phone', event.target.value)}
              placeholder="+91 98765 43210"
            />
          </FormField>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <MapPin className="h-3.5 w-3.5" /> Address
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Address line 1">
              <input className={inputClassName} value={current.address_line1} onChange={(event) => set('address_line1', event.target.value)} />
            </FormField>
            <FormField label="Address line 2">
              <input className={inputClassName} value={current.address_line2} onChange={(event) => set('address_line2', event.target.value)} />
            </FormField>
            <FormField label="City">
              <input className={inputClassName} value={current.address_city} onChange={(event) => set('address_city', event.target.value)} />
            </FormField>
            <FormField label="State">
              <input className={inputClassName} value={current.address_state} onChange={(event) => set('address_state', event.target.value)} />
            </FormField>
            <FormField label="Postal code">
              <input className={inputClassName} value={current.address_postal_code} onChange={(event) => set('address_postal_code', event.target.value)} />
            </FormField>
            <FormField label="Country">
              <input className={inputClassName} value={current.address_country} onChange={(event) => set('address_country', event.target.value)} />
            </FormField>
          </div>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Emergency Contact
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Name">
              <input className={inputClassName} value={current.emergency_name} onChange={(event) => set('emergency_name', event.target.value)} />
            </FormField>
            <FormField label="Relationship">
              <input className={inputClassName} value={current.emergency_relationship} onChange={(event) => set('emergency_relationship', event.target.value)} />
            </FormField>
            <FormField label="Phone">
              <input className={inputClassName} value={current.emergency_phone} onChange={(event) => set('emergency_phone', event.target.value)} />
            </FormField>
            <FormField label="Alternate phone">
              <input className={inputClassName} value={current.emergency_alternate_phone} onChange={(event) => set('emergency_alternate_phone', event.target.value)} />
            </FormField>
          </div>
        </div>

        <FormField label="Reason for change (optional)">
          <textarea
            className={inputClassName}
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Updated phone number, new address after relocation"
          />
        </FormField>
      </form>
    </Modal>
  )
}


function ChangeRequestHistory({ requests }) {
  const statusBadge = (status) => {
    const map = {
      pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
      approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
      rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
      cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300',
    }
    return map[status] || map.pending
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-lg bg-orange-50 p-1.5 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">
          <FileEdit className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Change Requests</h3>
      </div>
      <div className="space-y-3">
        {requests.map((req) => (
          <div key={req.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-700/20">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {req.changed_fields?.map((f) => f.replace(/_/g, ' ')).join(', ')}
              </p>
              <p className="text-xs text-gray-400">
                {formatDate(req.created_at)}
                {req.review_comment ? ` · ${req.review_comment}` : ''}
                {req.rejection_reason ? ` · ${req.rejection_reason}` : ''}
              </p>
            </div>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusBadge(req.status)}`}>
              {req.status}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function EditProfileModal({ isOpen, onClose, profile, saving, onSave }) {
  const address = profile.address || {}
  const emergency = profile.emergency_contact || {}
  const [form, setForm] = useState(null)
  // Reset the form from the latest profile every time the modal opens.
  useEffect(() => {
    if (isOpen) setForm(null)
  }, [isOpen])
  const open = Boolean(isOpen)
  const current = form || {
    personal_email: profile.personal_email || '',
    personal_phone: profile.personal_phone || '',
    address: { ...address },
    emergency_contact: { ...emergency },
  }

  const set = (key, value) => setForm((prev) => ({ ...(prev || current), [key]: value }))
  const setAddress = (key, value) => setForm((prev) => ({ ...(prev || current), address: { ...(prev || current).address, [key]: value } }))
  const setEmergency = (key, value) => setForm((prev) => ({ ...(prev || current), emergency_contact: { ...(prev || current).emergency_contact, [key]: value } }))

  const handleSubmit = (event) => {
    event.preventDefault()
    const payload = {
      personal_email: current.personal_email?.trim() || null,
      personal_phone: current.personal_phone?.trim() || null,
      address: {
        line1: current.address?.line1?.trim() || null,
        line2: current.address?.line2?.trim() || null,
        city: current.address?.city?.trim() || null,
        state: current.address?.state?.trim() || null,
        postal_code: current.address?.postal_code?.trim() || null,
        country: current.address?.country?.trim() || null,
      },
      emergency_contact: {
        name: current.emergency_contact?.name?.trim() || null,
        relationship: current.emergency_contact?.relationship?.trim() || null,
        phone: current.emergency_contact?.phone?.trim() || null,
        alternate_phone: current.emergency_contact?.alternate_phone?.trim() || null,
      },
    }
    onSave(payload)
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Edit Personal Details"
      description="Only personal contact and address fields can be changed from self-service. Employment information is managed by HR."
      size="lg"
      bodyClassName="max-h-[70vh] overflow-y-auto"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="my-hr-profile-form" loading={saving} loadingText="Saving…">
            <Contact className="mr-2 h-4 w-4" /> Save Changes
          </Button>
        </div>
      }
    >
      <form id="my-hr-profile-form" onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Existing account details</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Full name"><input className={inputClassName} value={profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim()} disabled /></FormField>
            <FormField label="Work email"><input className={inputClassName} value={profile.email || ''} disabled /></FormField>
            <FormField label="Role"><input className={inputClassName} value={profile.role ? profile.role.replace(/_/g, ' ') : ''} disabled /></FormField>
            <FormField label="Employee number"><input className={inputClassName} value={profile.employee_number || ''} disabled /></FormField>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">These account and employment fields are managed by HR and are not included in the update.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Personal email">
            <input
              type="email"
              className={inputClassName}
              value={current.personal_email}
              onChange={(event) => set('personal_email', event.target.value)}
              placeholder="personal@example.com"
            />
          </FormField>
          <FormField label="Personal phone">
            <input
              type="tel"
              className={inputClassName}
              value={current.personal_phone}
              onChange={(event) => set('personal_phone', event.target.value)}
              placeholder="+91 98765 43210"
            />
          </FormField>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <MapPin className="h-3.5 w-3.5" /> Address
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Address line 1">
              <input className={inputClassName} value={current.address?.line1 || ''} onChange={(event) => setAddress('line1', event.target.value)} />
            </FormField>
            <FormField label="Address line 2">
              <input className={inputClassName} value={current.address?.line2 || ''} onChange={(event) => setAddress('line2', event.target.value)} />
            </FormField>
            <FormField label="City">
              <input className={inputClassName} value={current.address?.city || ''} onChange={(event) => setAddress('city', event.target.value)} />
            </FormField>
            <FormField label="State">
              <input className={inputClassName} value={current.address?.state || ''} onChange={(event) => setAddress('state', event.target.value)} />
            </FormField>
            <FormField label="Postal code">
              <input className={inputClassName} value={current.address?.postal_code || ''} onChange={(event) => setAddress('postal_code', event.target.value)} />
            </FormField>
            <FormField label="Country">
              <input className={inputClassName} value={current.address?.country || ''} onChange={(event) => setAddress('country', event.target.value)} />
            </FormField>
          </div>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Emergency Contact
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Name">
              <input className={inputClassName} value={current.emergency_contact?.name || ''} onChange={(event) => setEmergency('name', event.target.value)} />
            </FormField>
            <FormField label="Relationship">
              <input className={inputClassName} value={current.emergency_contact?.relationship || ''} onChange={(event) => setEmergency('relationship', event.target.value)} />
            </FormField>
            <FormField label="Phone">
              <input className={inputClassName} value={current.emergency_contact?.phone || ''} onChange={(event) => setEmergency('phone', event.target.value)} />
            </FormField>
            <FormField label="Alternate phone">
              <input className={inputClassName} value={current.emergency_contact?.alternate_phone || ''} onChange={(event) => setEmergency('alternate_phone', event.target.value)} />
            </FormField>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default MyProfile
