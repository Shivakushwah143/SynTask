import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { FileText, Loader2, Pencil, Plus, RefreshCw, Settings2, X } from 'lucide-react'

import { Button, ConfirmDialog, EmptyState, Modal, PageHeader, inputClassName } from '../../../../components/ui'
import { hrDocumentsApi } from '../../../../api/hrDocuments'
import { OWNER_SCOPE_LABELS, OWNER_SCOPE_OPTIONS, VISIBILITY_LABELS, VISIBILITY_OPTIONS } from '../utils/documents'

const selectClassName = inputClassName

const EMPTY_FORM = {
  name: '',
  code: '',
  description: '',
  owner_scope: 'both',
  required: false,
  expiry_supported: true,
  default_visibility: 'employee_visible',
}

/**
 * HR Settings → Document Types.
 * Company-scoped, seeded idempotently by the backend. Create / edit /
 * activate-deactivate. Deactivated types are never physically deleted so
 * historical documents keep their references.
 */
export default function DocumentTypesSettingsPage() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [deactivating, setDeactivating] = useState(null)
  const [deactivateLoading, setDeactivateLoading] = useState(false)

  const query = useQuery(['hr-document-types', 'settings'], () => hrDocumentsApi.listTypes({ include_inactive: true }))
  const types = query.data?.data?.data || query.data?.data || []

  const invalidate = () => queryClient.invalidateQueries(['hr-document-types'])

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
      owner_scope: type.owner_scope || 'both',
      required: Boolean(type.required),
      expiry_supported: type.expiry_supported !== false,
      default_visibility: type.default_visibility || 'employee_visible',
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
      const payload = { ...form }
      delete payload.id
      if (form.id) {
        await hrDocumentsApi.updateType(form.id, payload)
        toast.success('Document type updated')
      } else {
        await hrDocumentsApi.createType(payload)
        toast.success('Document type created')
      }
      setForm(null)
      invalidate()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to save document type')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async () => {
    setDeactivateLoading(true)
    try {
      await hrDocumentsApi.deactivateType(deactivating.id)
      toast.success('Document type deactivated')
      setDeactivating(null)
      invalidate()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to deactivate document type')
    } finally {
      setDeactivateLoading(false)
    }
  }

  const handleReactivate = async (type) => {
    try {
      await hrDocumentsApi.updateType(type.id, { active: true })
      toast.success('Document type activated')
      invalidate()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to activate document type')
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="HR Settings — Document Types"
        description="Configure the document types available when uploading HR documents. Deactivated types stay in history."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New Document Type
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
          title="Failed to load document types"
          description="Something went wrong. Please try again."
          action={<Button variant="secondary" onClick={() => query.refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Try Again</Button>}
        />
      ) : types.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No document types configured"
          description="Create your first document type, or upload documents — the standard types are added automatically."
          action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> New Document Type</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800/70">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Scope</th>
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
                      <span className="text-xs text-gray-600 dark:text-gray-300">{OWNER_SCOPE_LABELS[type.owner_scope] || type.owner_scope}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {type.required ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">Required</span> : null}
                        {type.expiry_supported ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">Expiry</span> : null}
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">
                          {VISIBILITY_LABELS[type.default_visibility] || 'Employee visible'}
                        </span>
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
        title={form?.id ? 'Edit Document Type' : 'New Document Type'}
        description="Document types scope which documents can be uploaded and how they behave (required, expiry, default visibility)."
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="hr-document-type-form" loading={saving} loadingText="Saving…">
              {form?.id ? 'Save Changes' : 'Create Type'}
            </Button>
          </div>
        }
      >
        <form id="hr-document-type-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Name <span className="ml-1 text-red-600">*</span>
              </label>
              <input className={inputClassName} value={form?.name || ''} onChange={(event) => setField('name', event.target.value)} placeholder="e.g. PAN Card" />
              {errors.name ? <p className="text-xs text-red-600">{errors.name}</p> : null}
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Code <span className="ml-1 text-red-600">*</span>
              </label>
              <input className={inputClassName} value={form?.code || ''} onChange={(event) => setField('code', event.target.value)} placeholder="e.g. pan" disabled={Boolean(form?.id)} />
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Applies to</label>
              <select className={selectClassName} value={form?.owner_scope || 'both'} onChange={(event) => setField('owner_scope', event.target.value)}>
                {OWNER_SCOPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Default Visibility</label>
              <select className={selectClassName} value={form?.default_visibility || 'employee_visible'} onChange={(event) => setField('default_visibility', event.target.value)}>
                {VISIBILITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={Boolean(form?.required)} onChange={(event) => setField('required', event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
              Required document
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={form?.expiry_supported !== false} onChange={(event) => setField('expiry_supported', event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
              Supports expiry date
            </label>
          </div>
        </form>
      </Modal>

      {/* Deactivate confirm */}
      <ConfirmDialog
        isOpen={Boolean(deactivating)}
        onClose={() => setDeactivating(null)}
        title="Deactivate Document Type?"
        message={`Deactivate “${deactivating?.name}”? Existing documents keep their history, but the type will no longer be offered for new uploads.`}
        confirmLabel="Deactivate"
        loading={deactivateLoading}
        onConfirm={handleDeactivate}
      />
    </div>
  )
}
