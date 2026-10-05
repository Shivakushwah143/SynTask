import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CalendarDays, Pencil, RefreshCw, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'

import { leavesAPI } from '../../../../api/leaves'
import { Button, EmptyState, FormField, Modal, Skeleton, inputClassName } from '../../../../components/ui'
import { LEAVE_STATUS_BADGES, formatDate } from '../../../../pages/hr/me/myHrUtils'

/**
 * Employee Detail → Leave.
 *
 * Shows the employee's leave balances (Allocated / Used / Pending / Available —
 * computed by the backend), their request history, and — for authorized HR
 * users — allocation adjustment. Never calculates balances on the frontend.
 *
 * Identity: the Leave domain is keyed by User id (LeaveBalance.employee_id /
 * LeaveRequest.employee_id), so this tab receives the employee's `user_id`.
 */
export default function EmployeeLeaveTab({ employeeId, canManage }) {
  const [balances, setBalances] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [adjusting, setAdjusting] = useState(null)
  const [newAllocated, setNewAllocated] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)
    setError(null)
    try {
      const [balanceRes, requestsRes] = await Promise.all([
        leavesAPI.employeeBalances(employeeId),
        leavesAPI.list({ employee_id: employeeId, limit: 50 }),
      ])
      setBalances(balanceRes?.data?.balances || [])
      setRequests(requestsRes?.data?.leaves || [])
    } catch (err) {
      if (err?.response?.status === 403) {
        setError('You do not have permission to view this employee\u2019s leave.')
      } else {
        setError(err?.response?.data?.detail || 'Failed to load leave')
      }
    } finally {
      setLoading(false)
    }
  }, [employeeId])

  useEffect(() => { load() }, [load])

  const openAdjust = (balance) => {
    setAdjusting(balance)
    setNewAllocated(String(balance.allocated ?? ''))
    setReason('')
  }

  const submitAdjust = async (event) => {
    event.preventDefault()
    if (!adjusting) return
    const value = Number(newAllocated)
    if (!Number.isFinite(value) || value < 0) {
      toast.error('Allocated days must be a valid non-negative number')
      return
    }
    setSaving(true)
    try {
      const updated = await leavesAPI.updateAllocation(adjusting.id, {
        new_allocated: value,
        reason: reason.trim() || undefined,
      })
      toast.success('Allocation updated')
      setAdjusting(null)
      // Refresh balances after the adjustment.
      const balanceRes = await leavesAPI.employeeBalances(employeeId)
      setBalances(balanceRes?.data?.balances || [])
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to update allocation')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <EmptyState
          icon={error.startsWith('You do not have permission') ? ShieldAlert : AlertCircle}
          title={error.startsWith('You do not have permission') ? 'Leave permission required' : 'Failed to load leave'}
          description={error}
          action={<Button variant="secondary" onClick={load}><RefreshCw className="h-4 w-4" /> Retry</Button>}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Balances */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
              <CalendarDays className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Leave Balances</h3>
          </div>
          <Button variant="secondary" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
        {balances.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">No leave allocations for this employee yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {balances.map((balance) => (
              <div key={balance.leave_type_id} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{balance.name}</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      {balance.is_paid ? 'Paid' : 'Unpaid'} · {balance.leave_type_code || balance.leave_type_id?.slice(0, 8)}
                    </p>
                  </div>
                  {canManage ? (
                    <button
                      type="button"
                      title="Adjust allocation"
                      onClick={() => openAdjust(balance)}
                      className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-300"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
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
      </div>

      {/* Requests */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center gap-2">
          <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CalendarDays className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Leave Requests</h3>
        </div>
        {requests.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">No leave requests found for this employee.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((leave) => (
              <div key={leave.id} className="flex flex-col gap-2 rounded-xl border border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900 dark:text-white">{leave.leave_type_name || leave.leave_type || 'Leave'}</p>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LEAVE_STATUS_BADGES[leave.status] || ''}`}>{leave.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {formatDate(leave.start_date)} – {formatDate(leave.end_date)}
                    {leave.duration === 'half_day' ? ' (half day)' : ''} · {leave.requested_units} day(s)
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{leave.reason}</p>
                  {leave.review_comment ? <p className="mt-1 text-xs text-gray-400">Review note: {leave.review_comment}</p> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Adjust allocation modal */}
      <Modal
        isOpen={Boolean(adjusting)}
        onClose={() => setAdjusting(null)}
        title="Adjust Leave Allocation"
        description={`Update the allocated days for ${adjusting?.name || 'this leave type'}. The adjustment is audited on the backend.`}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdjusting(null)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="adjust-allocation-form" loading={saving} loadingText="Saving…">Save Allocation</Button>
          </div>
        }
      >
        <form id="adjust-allocation-form" onSubmit={submitAdjust} className="space-y-4">
          <FormField label="Allocated days" required>
            <input
              type="number"
              min="0"
              step="0.5"
              className={inputClassName}
              required
              value={newAllocated}
              onChange={(event) => setNewAllocated(event.target.value)}
            />
          </FormField>
          <FormField label="Reason" required>
            <textarea
              className={`${inputClassName} min-h-20`}
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is this allocation being changed?"
            />
          </FormField>
          {adjusting ? (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              Currently: {adjusting.allocated} allocated · {adjusting.used} used · {adjusting.pending} pending · {adjusting.available} available.
              Available = allocated − used − pending (computed by the backend).
            </p>
          ) : null}
        </form>
      </Modal>
    </div>
  )
}
