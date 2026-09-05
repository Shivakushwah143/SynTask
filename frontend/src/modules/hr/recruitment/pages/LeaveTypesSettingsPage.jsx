import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { CalendarDays, Loader2, Pencil, Plus, RefreshCw, Settings2, X } from 'lucide-react'

import { Button, ConfirmDialog, EmptyState, Modal, PageHeader, inputClassName } from '../../../../components/ui'
import { leavesAPI } from '../../../../api/leaves'

const EMPTY_FORM = {
  name: '',
  code: '',
  description: '',
  is_paid: true,
  default_annual_allocation: 12,
  allow_half_day: true,
  requires_approval: true,
  carry_forward_allowed: false,
  max_carry_forward: 0,
}

/**
 * HR Settings → Leave Types.
 *
 * Company-scoped configurable leave types (seeded idempotently by the backend).
 * Create / edit / activate / deactivate. Deactivated types are never physically
 * deleted so historical leave requests keep their references. The backend
 * remains authoritative for paid/unpaid, allocation, half-day and approval
 * rules — the form only configures them.
 */
export default function LeaveTypesSettingsPage() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [deactivating, setDeactivating] = useState(null)
  const [deactivateLoading, setDeactivateLoading] = useState(false)

  const query = useQuery(['hr-leave-types', 'settings'], () => leavesAPI.leaveTypes({ include_inactive: true }))
  const types = Array.isArray(query.data) ? query.data : query.data?.items || []

  const invalidate = () => queryClient.invalidateQueries(['hr-leave-types'])

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setErrors({})
  }

  const openEdit = (type) => {
    setForm({
      id: type.id,
      name: type.name,
      code: type.code,
      description: type.description || '',
      is_paid: Boolean(type.is_paid),
      default_annual_allocation: type.default_annual_allocation ?? 0,
      allow_half_day: Boolean(type.allow_half_day),
      requires_approval: type.requires_approval !== false,
      carry_forward_allowed: Boolean(type.carry_forward_allowed),
      max_carry_forward: type.max_carry_forward ?? 0,
    })
    setErrors({})
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const next = {}
    if (!form.name.trim()) next.name = 'Name is required'
    if (!form.code.trim()) next.code = 'Code is required'
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        description: form.description.trim() || undefined,
        is_paid: form.is_paid,
        default_annual_allocation: Number(form.default_annual_allocation) || 0,
        allow_half_day: form.allow_half_day,
        requires_approval: form.requires_approval,
        carry_forward_allowed: form.carry_forward_allowed,
        max_carry_forward: form.carry_forward_allowed ? Number(form.max_carry_forward) || 0 : 0,
      }
      if (form.id) {
        await leavesAPI.updateLeaveType(form.id, payload)
        toast.success('Leave type updated')
      } else {
        await leavesAPI.createLeaveType(payload)
        toast.success('Leave type created')
      }
      setForm(null)
      invalidate()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to save leave type')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async () => {
    setDeactivateLoading(true)
    try {
      await leavesAPI.deactivateLeaveType(deactivating.id)
      toast.success('Leave type deactivated')
      setDeactivating(null)
      invalidate()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to deactivate leave type')
    } finally {
      setDeactivateLoading(false)
    }
  }

  const handleReactivate = async (type) => {
    try {
      await leavesAPI.updateLeaveType(type.id, { active: true })
      toast.success('Leave type activated')
      invalidate()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to activate leave type')
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="HR Settings — Leave Types"
        description="Configure the leave types employees can request. Paid/unpaid, annual allocation, half-day and approval rules are enforced by the backend."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New Leave Type
          </Button>
        }
      />

      {query.isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={Settings2}
          title="Failed to load leave types"
          description="Something went wrong. Please try again."
          action={<Button variant="secondary" onClick={() => query.refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Try Again</Button>}
        />
      ) : types.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No leave types configured"
          description="Create your first leave type — the standard types are added automatically by the backend."
          action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> New Leave Type</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800/70">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Leave Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Pay</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Allocation</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Settings</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {types.map((type) => (
                  <tr key={type.id} className="transition-colors hover:bg-gray-50/70 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{type.name}</p>
                      {type.description ? <p className="mt-0.5 max-w-sm truncate text-xs text-gray-500 dark:text-gray-400">{type.description}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">{type.code}</span>
                    </td>
                    <td className="px-4 py-3">
                      {type.is_paid ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Paid</span>
                      ) : (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">Unpaid</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{type.default_annual_allocation} days/yr</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {type.allow_half_day ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">Half-day</span> : null}
                        {type.requires_approval ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">Approval</span> : null}
                        {type.carry_forward_allowed ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Carry {type.max_carry_forward || 0}d</span> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {type.active !== false ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Active</span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button type="button" title="Edit" onClick={() => openEdit(type)} className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-300">
                          <Pencil className="h-4 w-4" />
                        </button>
                        {type.active !== false ? (
                          <button type="button" title="Deactivate" onClick={() => setDeactivating(type)} className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-gray-400 dark:hover:bg-rose-900/30 dark:hover:text-rose-300">
                            <X className="h-4 w-4" />
                          </button>
                        ) : (
                          <button type="button" title="Activate" onClick={() => handleReactivate(type)} className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-emerald-50 hover:text-emerald-600 dark:text-gray-400 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-300">
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit modal */}
      <Modal
        isOpen={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? 'Edit Leave Type' : 'New Leave Type'}
        description="Configure how this leave type behaves. Paid/unpaid, allocation and approval are enforced by the backend."
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="hr-leave-type-form" loading={saving} loadingText="Saving…">
              {form?.id ? 'Save Changes' : 'Create Type'}
            </Button>
          </div>
        }
      >
        <form id="hr-leave-type-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Name <span className="ml-1 text-red-600">*</span>
              </label>
              <input className={inputClassName} value={form?.name || ''} onChange={(event) => setField('name', event.target.value)} placeholder="e.g. Sick Leave" />
              {errors.name ? <p className="text-xs text-red-600">{errors.name}</p> : null}
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Code <span className="ml-1 text-red-600">*</span>
              </label>
              <input className={inputClassName} value={form?.code || ''} onChange={(event) => setField('code', event.target.value)} placeholder="e.g. sick" disabled={Boolean(form?.id)} />
              {errors.code ? <p className="text-xs text-red-600">{errors.code}</p> : null}
              {form?.id ? <p className="text-xs text-gray-400 dark:text-gray-500">Code is fixed after creation.</p> : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
            <textarea className={`${inputClassName} min-h-20`} value={form?.description || ''} onChange={(event) => setField('description', event.target.value)} placeholder="Optional description…" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Paid / Unpaid</label>
              <select className={inputClassName} value={form?.is_paid ? 'paid' : 'unpaid'} onChange={(event) => setField('is_paid', event.target.value === 'paid')}>
                <option value="paid">Paid leave</option>
                <option value="unpaid">Unpaid leave</option>
              </select>
              <p className="text-xs text-gray-400 dark:text-gray-500">Paid leave reduces payroll payable days at full factor; unpaid leave does not credit pay.</p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Default annual allocation (days)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                className={inputClassName}
                value={form?.default_annual_allocation ?? 0}
                onChange={(event) => setField('default_annual_allocation', event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={Boolean(form?.allow_half_day)} onChange={(event) => setField('allow_half_day', event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
              Allow half-day
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={form?.requires_approval !== false} onChange={(event) => setField('requires_approval', event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
              Requires approval
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={Boolean(form?.carry_forward_allowed)} onChange={(event) => setField('carry_forward_allowed', event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
              Carry forward allowed
            </label>
          </div>

          {form?.carry_forward_allowed ? (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Max carry forward (days)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                className={inputClassName}
                value={form?.max_carry_forward ?? 0}
                onChange={(event) => setField('max_carry_forward', event.target.value)}
              />
            </div>
          ) : null}
        </form>
      </Modal>

      {/* Deactivate confirm */}
      <ConfirmDialog
        isOpen={Boolean(deactivating)}
        onClose={() => setDeactivating(null)}
        title="Deactivate Leave Type?"
        message={`Deactivate “${deactivating?.name}”? Existing requests keep their history, but the type will no longer be offered for new requests.`}
        confirmLabel="Deactivate"
        loading={deactivateLoading}
        onConfirm={handleDeactivate}
      />
    </div>
  )
}
