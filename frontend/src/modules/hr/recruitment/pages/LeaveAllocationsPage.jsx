import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CalendarDays, Pencil, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

import { leavesAPI } from '../../../../api/leaves'
import { Button, EmptyState, FormField, Modal, PageHeader, Skeleton, inputClassName } from '../../../../components/ui'

/**
 * People → Leave → Allocations.
 *
 * HR leave allocation/balance management: lists every employee's allocation
 * (Allocated / Used / Pending / Available — all computed by the backend) with
 * filters, and allows authorized HR users to adjust allocations. No balance is
 * ever calculated on the frontend.
 *
 * Backend: GET /leaves/allocations (leave_management.view) and
 * PATCH /leaves/allocations/{id} (leave_management.manage) — the API enforces
 * company scope and capability, so the page is read-only for users without
 * manage rights.
 */
export default function LeaveAllocationsPage() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [leaveTypes, setLeaveTypes] = useState([])
  const [filters, setFilters] = useState({ leave_type_id: '' })
  const [adjusting, setAdjusting] = useState(null)
  const [newAllocated, setNewAllocated] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const loadTypes = useCallback(async () => {
    try {
      const data = await leavesAPI.leaveTypes({ include_inactive: true })
      setLeaveTypes(Array.isArray(data) ? data : data?.items || [])
    } catch {
      setLeaveTypes([])
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = { limit: 500 }
      if (filters.leave_type_id) params.leave_type_id = filters.leave_type_id
      const response = await leavesAPI.listAllocations(params)
      setItems(response?.data?.items || [])
      setTotal(response?.data?.total || 0)
    } catch (err) {
      if (err?.response?.status === 403) {
        setError('You do not have permission to view leave allocations.')
      } else {
        setError(err?.response?.data?.detail || 'Failed to load leave allocations')
      }
    } finally {
      setLoading(false)
    }
  }, [filters.leave_type_id])

  useEffect(() => {
    loadTypes()
    load()
  }, [load, loadTypes])

  const filteredItems = useMemo(() => {
    if (!filters.leave_type_id) return items
    return items.filter((item) => item.leave_type_id === filters.leave_type_id)
  }, [items, filters.leave_type_id])

  const openAdjust = (item) => {
    setAdjusting(item)
    setNewAllocated(String(item.allocated ?? ''))
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
      await leavesAPI.updateAllocation(adjusting.id, {
        new_allocated: value,
        reason: reason.trim() || undefined,
      })
      toast.success('Allocation updated')
      setAdjusting(null)
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to update allocation')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Leave Allocations"
        description={`${total} allocation record(s) across employees. Allocated / Used / Pending / Available are computed by the backend.`}
      />

      <div className="flex flex-wrap items-center gap-3">
        <select
          className="w-full max-w-xs rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          value={filters.leave_type_id}
          onChange={(event) => setFilters((current) => ({ ...current, leave_type_id: event.target.value }))}
        >
          <option value="">All leave types</option>
          {leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
        </select>
        <Button variant="secondary" size="sm" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : error ? (
        <EmptyState
          icon={AlertCircle}
          title="Failed to load leave allocations"
          description={error}
          action={<Button variant="secondary" onClick={load}><RefreshCw className="h-4 w-4" /> Try Again</Button>}
        />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No leave allocations found"
          description="Allocations are created when leave types are allocated to employees. Try a different leave type filter."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800/70">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Leave Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Pay</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Allocated</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Used</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Pending</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Available</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-gray-50/70 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{item.employee_name || 'Unknown employee'}</p>
                      {item.employee_number ? <p className="text-xs text-gray-500 dark:text-gray-400">{item.employee_number}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{item.leave_type_name || item.leave_type_code || '—'}</td>
                    <td className="px-4 py-3">
                      {item.is_paid ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Paid</span>
                      ) : item.is_paid === false ? (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">Unpaid</span>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-gray-900 dark:text-white">{item.allocated}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-gray-600 dark:text-gray-300">{item.used}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-amber-600 dark:text-amber-400">{item.pending}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400">{item.available}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        title="Adjust allocation"
                        onClick={() => openAdjust(item)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-300"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjust allocation modal */}
      <Modal
        isOpen={Boolean(adjusting)}
        onClose={() => setAdjusting(null)}
        title="Adjust Leave Allocation"
        description={`Update the allocated days for ${adjusting?.employee_name || 'this employee'} — ${adjusting?.leave_type_name || 'leave type'}.`}
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
