import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { ClipboardCheck, Download, AlertTriangle, CheckCircle, XCircle, ArrowUpRight } from 'lucide-react'
import { metaApi } from '../../../api/meta'
import { Button } from '../../../components/ui'
import toast from 'react-hot-toast'
import { timeService } from '@/services/timeService'

export function MetaReadinessDashboard() {
  const queryClient = useQueryClient()
  const [selectedItem, setSelectedItem] = useState(null)
  const [editForm, setEditForm] = useState({ status: 'pending', evidence_url: '', notes: '' })

  const { data: checklist = [], isLoading, isError } = useQuery(
    'meta-readiness',
    () => metaApi.getReadiness().then(res => res.data),
    { retry: false }
  )

  const updateMutation = useMutation(
    ({ checklistId, payload }) => metaApi.updateReadiness(checklistId, payload),
    {
      onSuccess: () => {
        toast.success('Checklist item updated')
        queryClient.invalidateQueries('meta-readiness')
        setSelectedItem(null)
      },
      onError: (err) => {
        toast.error(err.response?.data?.detail || 'Failed to update item')
      }
    }
  )

  const exportMutation = useMutation(
    () => metaApi.exportReadiness().then(res => res.data),
    {
      onSuccess: (data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `meta-app-review-readiness-${timeService.toUtcDateOnlyNow()}.json`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('App Review evidence package exported!')
      },
      onError: () => {
        toast.error('Failed to export evidence package')
      }
    }
  )

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Partner Readiness & App Review Pack</h3>
        <p className="mt-2 text-sm text-slate-500">Loading compliance audit logs...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <h3 className="text-base font-semibold text-red-950">Partner Readiness & App Review Pack</h3>
        <p className="mt-2 text-sm text-red-700">Failed to load checklist records.</p>
      </div>
    )
  }

  const passedCount = checklist.filter(item => item.status === 'passed').length
  const totalCount = checklist.length
  const isFullyPassed = passedCount === totalCount

  const handleEdit = (item) => {
    setSelectedItem(item.checklist_id)
    setEditForm({
      status: item.status,
      evidence_url: item.evidence_url || '',
      notes: item.notes || ''
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    updateMutation.mutate({
      checklistId: selectedItem,
      payload: {
        status: editForm.status,
        evidence_url: editForm.evidence_url || null,
        notes: editForm.notes || null
      }
    })
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-indigo-600" />
            Partner Readiness & App Review Pack
          </h3>
          <p className="text-xs text-slate-500">Verify developer requirements, record audits, and export App Review submission package.</p>
        </div>
        <div>
          <Button
            type="button"
            variant="secondary"
            className="flex items-center gap-2 text-xs font-semibold"
            onClick={() => exportMutation.mutate()}
            loading={exportMutation.isLoading}
          >
            <Download className="h-4 w-4" />
            Export Evidence Package
          </Button>
        </div>
      </div>

      {/* Compliance Health Score */}
      <div className={`mt-6 rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
        isFullyPassed ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50/70 border-amber-100 text-amber-800'
      }`}>
        <div className="flex items-center gap-3">
          {isFullyPassed ? (
            <CheckCircle className="h-6 w-6 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
          )}
          <div>
            <p className="text-sm font-semibold">
              {isFullyPassed ? 'Application Fully Compliant' : 'App Review Readiness Incomplete'}
            </p>
            <p className="text-xs mt-0.5 opacity-90">
              {passedCount} of {totalCount} certification controls verified and approved.
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold">{Math.round((passedCount / totalCount) * 100)}%</span>
          <p className="text-[10px] tracking-wider uppercase opacity-85">Audit Score</p>
        </div>
      </div>

      {/* Compliance Table */}
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-100 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Control Requirement</th>
              <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Evidence Link</th>
              <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {checklist.map((item) => {
              const isEditing = selectedItem === item.checklist_id
              return (
                <tr key={item.checklist_id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-4 max-w-sm">
                    <p className="font-medium text-slate-900">{item.checklist_name}</p>
                    <p className="text-xs text-slate-500 mt-1">{item.notes}</p>
                    {item.verified_at && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Verified by {item.verified_by} on {timeService.formatDate(item.verified_at)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-4 max-w-xs truncate">
                    {item.evidence_url ? (
                      <a
                        href={item.evidence_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Evidence link
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">None provided</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                      onClick={() => handleEdit(item)}
                    >
                      Audit
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Inline Audit Form Drawer/Modal */}
      {selectedItem && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h4 className="text-sm font-semibold text-slate-900">
              Audit Control:{' '}
              {checklist.find((item) => item.checklist_id === selectedItem)?.checklist_name}
            </h4>
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-slate-700"
              onClick={() => setSelectedItem(null)}
            >
              Cancel
            </button>
          </div>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="audit-status" className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                <select
                  id="audit-status"
                  value={editForm.status}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-indigo-500 focus:outline-hidden"
                >
                  <option value="pending">Pending</option>
                  <option value="passed">Passed (Approved)</option>
                  <option value="failed">Failed (Action Required)</option>
                </select>
              </div>
              <div>
                <label htmlFor="audit-evidence" className="block text-xs font-medium text-slate-700 mb-1">Evidence URL</label>
                <input
                  id="audit-evidence"
                  type="url"
                  placeholder="https://example.com/screencast.mp4"
                  value={editForm.evidence_url}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, evidence_url: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>
            <div>
              <label htmlFor="audit-notes" className="block text-xs font-medium text-slate-700 mb-1">Audit Notes / Comments</label>
              <textarea
                id="audit-notes"
                rows={2}
                placeholder="Details of verification checks performed..."
                value={editForm.notes}
                onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-indigo-500 focus:outline-hidden"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedItem(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={updateMutation.isLoading}>
                Save Audit Record
              </Button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

function StatusBadge({ status }) {
  if (status === 'passed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 border border-emerald-100">
        <CheckCircle className="h-3 w-3" />
        Passed
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 border border-rose-100">
        <XCircle className="h-3 w-3" />
        Failed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 border border-amber-100">
      <AlertTriangle className="h-3 w-3" />
      Pending
    </span>
  )
}
