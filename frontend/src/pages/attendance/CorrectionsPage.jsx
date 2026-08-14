import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock, RefreshCw, XCircle, Eye, Filter } from 'lucide-react'
import toast from 'react-hot-toast'
import { attendanceAPI } from '../../api/attendance'
import { Button, Modal, PageHeader, Skeleton } from '../../components/ui'

const STATUS_STYLES = {
  pending: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300',
  approved: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

const CORRECTION_TYPE_LABELS = {
  missing_check_in: 'Missing Check-In',
  missing_check_out: 'Missing Check-Out',
  change_check_in: 'Change Check-In',
  change_check_out: 'Change Check-Out',
  break_correction: 'Break Correction',
  status_correction: 'Status Correction',
}

const CorrectionsPage = () => {
  const [corrections, setCorrections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [detailModal, setDetailModal] = useState(null)
  const [rejectComment, setRejectComment] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const loadCorrections = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await attendanceAPI.getAllCorrections({ status: statusFilter })
      setCorrections(res.data?.items || [])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load corrections')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    loadCorrections()
  }, [loadCorrections])

  const handleApprove = async (correction) => {
    try {
      setActionLoading(true)
      await attendanceAPI.approveCorrection(correction.id)
      toast.success('Correction approved')
      setDetailModal(null)
      loadCorrections()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to approve')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async (correction) => {
    if (!rejectComment.trim()) {
      toast.error('Rejection reason is required')
      return
    }
    try {
      setActionLoading(true)
      await attendanceAPI.rejectCorrection(correction.id, rejectComment)
      toast.success('Correction rejected')
      setDetailModal(null)
      setRejectComment('')
      loadCorrections()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to reject')
    } finally {
      setActionLoading(false)
    }
  }

  const formatTime = (dt) => {
    if (!dt) return 'Missing'
    return new Date(dt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  if (error) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <PageHeader title="Attendance Corrections" description="Review and manage employee attendance correction requests." />
        <div className="rounded-lg border border-red-200 bg-white p-5 dark:border-red-900/60 dark:bg-gray-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Could not load corrections</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{error}</p>
              <Button className="mt-4" variant="secondary" onClick={loadCorrections}>
                <RefreshCw className="h-4 w-4" /> Try Again
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader title="Attendance Corrections" description="Review and manage employee attendance correction requests." />

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-gray-500" />
        {['pending', 'approved', 'rejected', 'cancelled', 'all'].map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f === 'all' ? null : f)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              (statusFilter === f || (!statusFilter && f === 'all'))
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300'
                : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : corrections.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center dark:border-gray-700 dark:bg-gray-800">
          <CheckCircle2 className="mx-auto h-10 w-10 text-gray-400" />
          <h3 className="mt-3 text-sm font-medium text-gray-900 dark:text-white">No correction requests</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {statusFilter ? `No ${statusFilter} corrections found.` : 'No correction requests found.'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {corrections.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      {c.employee_name || c.employee_id}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{c.attendance_date}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {CORRECTION_TYPE_LABELS[c.correction_type] || c.correction_type}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[c.status] || ''}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button onClick={() => setDetailModal(c)} className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400">
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <Modal isOpen={!!detailModal} onClose={() => { setDetailModal(null); setRejectComment('') }} title="Correction Details">
        {detailModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Employee:</span>
                <p className="font-medium text-gray-900 dark:text-white">{detailModal.employee_name || detailModal.employee_id}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Date:</span>
                <p className="font-medium text-gray-900 dark:text-white">{detailModal.attendance_date}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Type:</span>
                <p className="font-medium text-gray-900 dark:text-white">
                  {CORRECTION_TYPE_LABELS[detailModal.correction_type]}
                </p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Reason:</span>
                <p className="text-gray-900 dark:text-white">{detailModal.reason}</p>
              </div>
            </div>

            {/* Current vs Requested */}
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Current vs Requested</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Current Check-In: </span>
                  <span className={detailModal.current_check_in ? 'text-gray-900 dark:text-white' : 'text-red-500'}>
                    {formatTime(detailModal.current_check_in)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Requested Check-In: </span>
                  <span className="font-medium text-indigo-600 dark:text-indigo-400">
                    {formatTime(detailModal.requested_check_in)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Current Check-Out: </span>
                  <span className={detailModal.current_check_out ? 'text-gray-900 dark:text-white' : 'text-red-500'}>
                    {formatTime(detailModal.current_check_out)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Requested Check-Out: </span>
                  <span className="font-medium text-indigo-600 dark:text-indigo-400">
                    {formatTime(detailModal.requested_check_out)}
                  </span>
                </div>
              </div>
            </div>

            {/* Reject comment */}
            {detailModal.status === 'pending' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Rejection Reason (required for reject)
                </label>
                <textarea
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  rows={2}
                  placeholder="Reason for rejection..."
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            )}

            {/* Actions */}
            {detailModal.status === 'pending' && (
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => handleReject(detailModal)}
                  loading={actionLoading}
                  className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300"
                >
                  <XCircle className="h-4 w-4" /> Reject
                </Button>
                <Button onClick={() => handleApprove(detailModal)} loading={actionLoading}>
                  <CheckCircle2 className="h-4 w-4" /> Approve
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default CorrectionsPage
