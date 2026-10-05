import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertCircle, CalendarDays, Plus, Send, X } from 'lucide-react'
import { leavesAPI } from '../../../api/leaves'
import { useMyLeaveBalances, useMyLeaveRequests } from '../../../hooks/useMyHr'
import { Button, EmptyState, FormField, Modal, Skeleton, inputClassName } from '../../../components/ui'
import { LEAVE_STATUS_BADGES, formatDate } from './myHrUtils'

const MyLeave = () => {
  const { data: balancesData, isLoading: balancesLoading } = useMyLeaveBalances()
  const { data: requestsData, isLoading: requestsLoading, isError: requestsError, refetch: refetchRequests } = useMyLeaveRequests()
  const [requestOpen, setRequestOpen] = useState(false)
  const [cancelling, setCancelling] = useState(null)

  const balances = balancesData?.balances || []
  const requests = requestsData?.leaves || []

  const handleCancel = async (leave) => {
    setCancelling(leave.id)
    try {
      await leavesAPI.cancel(leave.id)
      toast.success('Leave request cancelled')
      refetchRequests()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to cancel leave request')
    } finally {
      setCancelling(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Balances */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
              <CalendarDays className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Leave Balance</h3>
          </div>
          <Button size="sm" onClick={() => setRequestOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Request Leave
          </Button>
        </div>
        {balancesLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : balances.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No leave types are available yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {balances.map((balance) => (
              <div key={balance.leave_type_id} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{balance.name}</p>
                <p className="mt-2 text-2xl font-bold text-indigo-600 dark:text-indigo-400">{balance.available}</p>
                <p className="text-xs text-gray-400">days available</p>
                <div className="mt-2 flex justify-between text-[11px] text-gray-400">
                  <span>{balance.allocated} allocated</span>
                  <span>{balance.used} used</span>
                  <span>{balance.pending} pending</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* My requests */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <CalendarDays className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">My Leave Requests</h3>
          </div>
        </div>
        {requestsLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : requestsError ? (
          <EmptyState icon={AlertCircle} title="Unable to load your leave requests" description="Please try again in a moment." />
        ) : requests.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No leave requests yet.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((leave) => (
              <div key={leave.id} className="flex flex-col gap-2 rounded-xl border border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900 dark:text-white">{leave.leave_type_name || leave.leave_type || 'Leave'}</p>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LEAVE_STATUS_BADGES[leave.status] || ''}`}>
                      {leave.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {formatDate(leave.start_date)} – {formatDate(leave.end_date)}
                    {leave.duration === 'half_day' ? ' (half day)' : ''} · {leave.requested_units} day(s)
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{leave.reason}</p>
                  {leave.review_comment ? (
                    <p className="mt-1 text-xs text-gray-400">Review note: {leave.review_comment}</p>
                  ) : null}
                </div>
                {leave.status === 'pending' ? (
                  <Button variant="secondary" size="sm" onClick={() => handleCancel(leave)} loading={cancelling === leave.id} loadingText="Cancelling…">
                    <X className="mr-1.5 h-3.5 w-3.5" /> Cancel
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <RequestLeaveModal isOpen={requestOpen} onClose={() => setRequestOpen(false)} balances={balances} onSubmitted={refetchRequests} />
    </div>
  )
}

const DEFAULT_LEAVE_FORM = { leave_type_id: '', duration: 'full_day', start_date: '', end_date: '', reason: '', attachment: null }

function RequestLeaveModal({ isOpen, onClose, balances, onSubmitted }) {
  const [form, setForm] = useState(DEFAULT_LEAVE_FORM)
  const [types, setTypes] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [loadingTypes, setLoadingTypes] = useState(false)

  useEffect(() => {
    if (isOpen) setForm(DEFAULT_LEAVE_FORM)
  }, [isOpen])

  const selectedBalance = balances.find((balance) => balance.leave_type_id === form.leave_type_id)

  const loadTypes = async () => {
    if (types.length) return
    setLoadingTypes(true)
    try {
      const data = await leavesAPI.leaveTypes()
      setTypes(Array.isArray(data) ? data : [])
    } catch {
      setTypes([])
    } finally {
      setLoadingTypes(false)
    }
  }

  const open = Boolean(isOpen)
  if (open && types.length === 0 && !loadingTypes) {
    loadTypes()
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
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
    if (form.duration === 'half_day' && form.start_date !== form.end_date) {
      toast.error('Half-day leave can only be requested for a single day')
      return
    }
    if (!form.reason.trim()) {
      toast.error('Please provide a reason')
      return
    }
    setSubmitting(true)
    try {
      await leavesAPI.create({ ...form, attachment: form.attachment || undefined })
      toast.success('Leave request submitted')
      setForm({ leave_type_id: '', duration: 'full_day', start_date: '', end_date: '', reason: '', attachment: null })
      onClose()
      onSubmitted?.()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Unable to submit leave request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Request Leave"
      description="Your available balance is shown for the selected leave type."
      size="lg"
      bodyClassName="max-h-[70vh] overflow-y-auto"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" form="request-leave-form" loading={submitting} loadingText="Submitting…">
            <Send className="mr-2 h-4 w-4" /> Submit Request
          </Button>
        </div>
      }
    >
      <form id="request-leave-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Leave type" required>
          <select
            className={inputClassName}
            value={form.leave_type_id}
            onChange={(event) => setForm({ ...form, leave_type_id: event.target.value })}
          >
            <option value="">Select leave type…</option>
            {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
        </FormField>
        {selectedBalance ? (
          <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
            You have {selectedBalance.available} days of {selectedBalance.name} available.
          </p>
        ) : null}
        <FormField label="Duration">
          <select
            className={inputClassName}
            value={form.duration}
            onChange={(event) => setForm({ ...form, duration: event.target.value })}
          >
            <option value="full_day">Full day</option>
            <option value="half_day">Half day</option>
          </select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Start date" required>
            <input
              type="date"
              className={inputClassName}
              required
              value={form.start_date}
              onChange={(event) => setForm({ ...form, start_date: event.target.value })}
            />
          </FormField>
          <FormField label="End date" required>
            <input
              type="date"
              className={inputClassName}
              required
              value={form.end_date}
              onChange={(event) => setForm({ ...form, end_date: event.target.value })}
            />
          </FormField>
        </div>
        <FormField label="Reason" required>
          <textarea
            className={`${inputClassName} min-h-24`}
            required
            value={form.reason}
            onChange={(event) => setForm({ ...form, reason: event.target.value })}
            placeholder="Please provide details for your leave request…"
          />
        </FormField>
        <FormField label="Attachment (optional)">
          <input
            type="file"
            className={inputClassName}
            onChange={(event) => setForm({ ...form, attachment: event.target.files?.[0] || null })}
          />
        </FormField>
      </form>
    </Modal>
  )
}

export default MyLeave
