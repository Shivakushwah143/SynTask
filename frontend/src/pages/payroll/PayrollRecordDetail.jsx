import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Clock,
  DollarSign,
  Download,
  Eye,
  FileText,
  History,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { payrollAPI, payrollFiles } from '../../api/payroll'
import { Button, ConfirmDialog, EmptyState, Modal, PageHeader, Skeleton } from '../../components/ui'
import { decodeBlobErrorMessage, downloadBlob, getDownloadFilename } from '../../utils/download'

const formatCurrency = (v) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(v || 0)
const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'
const formatDateTime = (d) => d
  ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '-'

const PayrollRecordDetail = () => {
  const { periodId, recordId } = useParams()
  const navigate = useNavigate()
  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Payslip UI state
  const [generating, setGenerating] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(null)
  const [previewPayslip, setPreviewPayslip] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyItems, setHistoryItems] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(null)

  const loadRecord = useCallback(async () => {
    if (!recordId) return
    try {
      setLoading(true); setError(null)
      const res = await payrollAPI.getRecord(recordId)
      setRecord(res.data)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load payroll record')
    } finally { setLoading(false) }
  }, [recordId])

  useEffect(() => { loadRecord() }, [loadRecord])

  // Revoke the preview object URL when it changes or the modal closes.
  useEffect(() => {
    return () => {
      if (previewUrl) window.URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // ── Generate ─────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await payrollAPI.generatePayslip(recordId)
      toast.success('Payslip generated')
      await loadRecord()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to generate payslip')
    } finally { setGenerating(false) }
  }

  // ── Regenerate (new version from the same processed snapshot) ────────────
  const handleRegenerate = async () => {
    const payslipId = confirmRegenerate?.payslip_id
    if (!payslipId) return
    setRegenerating(true)
    try {
      await payrollAPI.regeneratePayslip(payslipId)
      toast.success('Payslip regenerated (new version)')
      setConfirmRegenerate(null)
      await loadRecord()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to regenerate payslip')
    } finally { setRegenerating(false) }
  }

  // ── Preview (authorized blob fetch — never a raw storage URL) ────────────
  const openPreview = async (payslip) => {
    setPreviewPayslip(payslip)
    setPreviewUrl(null)
    setPreviewError(null)
    setPreviewLoading(true)
    try {
      const response = await payrollFiles.preview(payslip.payslip_id)
      setPreviewUrl(window.URL.createObjectURL(response.data))
    } catch (err) {
      const message = await decodeBlobErrorMessage(err, 'Unable to preview this payslip. You may not have permission.')
      setPreviewError(message)
    } finally {
      setPreviewLoading(false)
    }
  }

  // ── Download (authorized blob fetch + safe filename) ─────────────────────
  const handleDownload = async (payslip) => {
    try {
      const response = await payrollFiles.download(payslip.payslip_id)
      const filename = getDownloadFilename(
        response.headers?.['content-disposition'],
        payslip.file_name || `payslip-v${payslip.version}.pdf`,
      )
      downloadBlob(response.data, filename)
    } catch (err) {
      const message = await decodeBlobErrorMessage(err, 'Failed to download payslip')
      toast.error(message)
    }
  }

  // ── History (versions for this record) ───────────────────────────────────
  const openHistory = async () => {
    setHistoryOpen(true)
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const res = await payrollAPI.getRecordPayslips(recordId)
      setHistoryItems(res.data || [])
    } catch (err) {
      setHistoryError(err?.response?.data?.detail || 'Failed to load payslip history')
    } finally {
      setHistoryLoading(false)
    }
  }

  if (loading) return <div className="space-y-4 p-4 md:p-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>
  if (error) return (
    <div className="p-4 md:p-6"><div className="rounded-lg border border-red-200 bg-white p-5 dark:border-red-900/60 dark:bg-gray-800">
      <div className="flex items-start gap-3"><AlertCircle className="h-5 w-5 text-red-600" /><div>
        <p className="font-medium text-gray-900 dark:text-white">{error}</p>
        <Button className="mt-3" variant="secondary" onClick={loadRecord}><RefreshCw className="h-4 w-4" /> Retry</Button>
      </div></div></div></div>
  )
  if (!record) return null

  const att = record.attendance_snapshot || {}
  const payslip = record.payslip || { generated: false }
  const currentPayslip = payslip.generated
    ? { payslip_id: payslip.payslip_id, version: payslip.version, generated_at: payslip.generated_at, file_name: payslip.file_name }
    : null

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/hr/payroll/${periodId}`)} className="text-gray-400 hover:text-gray-600"><ArrowLeft className="h-5 w-5" /></button>
        <PageHeader title={record.employee_name || 'Employee Payroll'} description={`Payroll record for ${record.employee_number || record.employee_id}`} />
      </div>

      {/* Employee Info */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Employee</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-gray-500">Name</p><p className="font-medium text-gray-900 dark:text-white">{record.employee_name || '-'}</p></div>
          <div><p className="text-xs text-gray-500">Employee ID</p><p className="font-medium text-gray-900 dark:text-white">{record.employee_number || '-'}</p></div>
          <div><p className="text-xs text-gray-500">Department</p><p className="font-medium text-gray-900 dark:text-white">{record.department || '-'}</p></div>
          <div><p className="text-xs text-gray-500">Designation</p><p className="font-medium text-gray-900 dark:text-white">{record.designation || '-'}</p></div>
        </div>
      </div>

      {/* Attendance */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-3"><CalendarDays className="h-4 w-4" /> Attendance</h3>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 text-sm">
          {[
            ['Working Days', att.working_days],
            ['Present', att.present_days],
            ['Paid Leave', att.paid_leave_days],
            ['Unpaid Leave', att.unpaid_leave_days],
            ['Absent', att.absent_days],
            ['Half Day', att.half_days],
            ['Holiday', att.holiday_days],
            ['Week Off', att.week_off_days],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between rounded bg-gray-50 px-3 py-2 dark:bg-gray-900/50">
              <span className="text-gray-500 dark:text-gray-400">{label}</span>
              <span className="font-medium text-gray-900 dark:text-white">{val ?? 0}</span>
            </div>
          ))}
          <div className="flex justify-between rounded bg-indigo-50 px-3 py-2 font-semibold dark:bg-indigo-950/40">
            <span className="text-indigo-700 dark:text-indigo-300">Payable Days</span>
            <span className="text-indigo-700 dark:text-indigo-300">{record.payable_days}</span>
          </div>
        </div>
      </div>

      {/* Earnings & Deductions */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Earnings */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-400 mb-3"><DollarSign className="h-4 w-4" /> Earnings</h3>
          <div className="space-y-2">
            {record.earnings?.map((e, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div>
                  <span className="text-gray-700 dark:text-gray-300">{e.component_name}</span>
                  {e.proration_factor < 1 && (
                    <span className="ml-2 text-xs text-gray-400">(prorated {Math.round(e.proration_factor * 100)}%)</span>
                  )}
                </div>
                <span className="font-mono text-gray-900 dark:text-white">{formatCurrency(e.calculated_amount)}</span>
              </div>
            ))}
            {(!record.earnings || record.earnings.length === 0) && <p className="text-sm text-gray-400">No earnings</p>}
            <div className="border-t border-gray-200 pt-2 dark:border-gray-700 flex justify-between font-semibold text-sm">
              <span className="text-gray-900 dark:text-white">Total Earnings</span>
              <span className="font-mono text-green-600 dark:text-green-400">{formatCurrency(record.gross_salary)}</span>
            </div>
          </div>
        </div>

        {/* Deductions */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400 mb-3"><DollarSign className="h-4 w-4" /> Deductions</h3>
          <div className="space-y-2">
            {record.deductions?.map((d, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-300">{d.component_name}</span>
                <span className="font-mono text-gray-900 dark:text-white">{formatCurrency(d.calculated_amount)}</span>
              </div>
            ))}
            {(!record.deductions || record.deductions.length === 0) && <p className="text-sm text-gray-400">No deductions</p>}
            <div className="border-t border-gray-200 pt-2 dark:border-gray-700 flex justify-between font-semibold text-sm">
              <span className="text-gray-900 dark:text-white">Total Deductions</span>
              <span className="font-mono text-red-600 dark:text-red-400">{formatCurrency(record.total_deductions)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Summary</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-green-50 p-4 dark:bg-green-950/30">
            <p className="text-xs text-green-600 dark:text-green-400">Gross Salary</p>
            <p className="mt-1 text-xl font-bold text-green-700 dark:text-green-300">{formatCurrency(record.gross_salary)}</p>
          </div>
          <div className="rounded-lg bg-red-50 p-4 dark:bg-red-950/30">
            <p className="text-xs text-red-600 dark:text-red-400">Total Deductions</p>
            <p className="mt-1 text-xl font-bold text-red-700 dark:text-red-300">{formatCurrency(record.total_deductions)}</p>
          </div>
          <div className="rounded-lg bg-indigo-50 p-4 dark:bg-indigo-950/30">
            <p className="text-xs text-indigo-600 dark:text-indigo-400">Net Salary</p>
            <p className="mt-1 text-xl font-bold text-indigo-700 dark:text-indigo-300">{formatCurrency(record.net_salary)}</p>
          </div>
        </div>
      </div>

      {/* Phase 7 — Payslip */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-3"><FileText className="h-4 w-4" /> Payslip</h3>

        {!payslip.generated ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Status: <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">Not Generated</span></p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {record.can_generate
                  ? 'Generate the payslip from this processed payroll record.'
                  : 'Payslip can only be generated after payroll is processed.'}
              </p>
            </div>
            {record.can_generate && (
              <Button onClick={handleGenerate} loading={generating} loadingText="Generating…">
                <Plus className="mr-2 h-4 w-4" /> Generate Payslip
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Status: <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-400">Generated</span>
                <span className="ml-2 inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">V{currentPayslip.version}</span>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Generated: {formatDateTime(currentPayslip.generated_at)} · {currentPayslip.file_name || 'Payslip PDF'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {record.can_preview && (
                <Button variant="secondary" onClick={() => openPreview(currentPayslip)}>
                  <Eye className="mr-2 h-4 w-4" /> Preview
                </Button>
              )}
              {record.can_download && (
                <Button variant="secondary" onClick={() => handleDownload(currentPayslip)}>
                  <Download className="mr-2 h-4 w-4" /> Download
                </Button>
              )}
              {record.can_regenerate && (
                <Button variant="secondary" onClick={() => setConfirmRegenerate(currentPayslip)} loading={regenerating} loadingText="Regenerating…">
                  <RotateCcw className="mr-2 h-4 w-4" /> Regenerate
                </Button>
              )}
              {record.can_preview && (
                <Button variant="ghost" onClick={openHistory}>
                  <History className="mr-2 h-4 w-4" /> History
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Warnings */}
      {record.warnings?.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-2">Warnings</h4>
          <ul className="space-y-1 text-sm text-amber-600 dark:text-amber-400">
            {record.warnings.map((w, i) => <li key={i}>- {w}</li>)}
          </ul>
        </div>
      )}
      {record.blockers?.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
          <h4 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-2">Blockers</h4>
          <ul className="space-y-1 text-sm text-red-600 dark:text-red-400">
            {record.blockers.map((b, i) => <li key={i}>- {b}</li>)}
          </ul>
        </div>
      )}

      {/* Preview modal */}
      <Modal
        isOpen={Boolean(previewPayslip)}
        onClose={() => setPreviewPayslip(null)}
        title={`Payslip Preview · V${previewPayslip?.version || 1}`}
        description={previewPayslip?.file_name}
        size="xl"
        bodyClassName="flex flex-col"
        footer={
          previewPayslip ? (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPreviewPayslip(null)}>Close</Button>
              {record.can_download && (
                <Button onClick={() => handleDownload(previewPayslip)}>
                  <Download className="mr-2 h-4 w-4" /> Download
                </Button>
              )}
            </div>
          ) : null
        }
      >
        {previewLoading ? (
          <div className="flex h-80 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : previewError ? (
          <EmptyState icon={ShieldAlert} title="Preview unavailable" description={previewError} />
        ) : previewUrl ? (
          <iframe src={previewUrl} title="Payslip preview" className="h-[70vh] w-full rounded-xl border border-gray-200 dark:border-gray-700" />
        ) : null}
      </Modal>

      {/* History modal */}
      <Modal
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Payslip Versions"
        description={`${record.employee_name || 'Employee'} — payslip version history`}
        size="lg"
      >
        {historyLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : historyError ? (
          <EmptyState icon={AlertCircle} title="Failed to load history" description={historyError} />
        ) : historyItems.length === 0 ? (
          <EmptyState icon={History} title="No payslip versions" description="No payslip has been generated for this record yet." />
        ) : (
          <div className="space-y-3">
            {historyItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-xs font-bold text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
                    V{item.version}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{item.file_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Generated: {formatDateTime(item.generated_at)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {item.can_preview && (
                    <Button variant="secondary" size="sm" onClick={() => openPreview({ payslip_id: item.id, version: item.version, file_name: item.file_name })}>
                      <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
                    </Button>
                  )}
                  {item.can_download && (
                    <Button variant="secondary" size="sm" onClick={() => handleDownload({ payslip_id: item.id, version: item.version, file_name: item.file_name })}>
                      <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Regenerate confirm */}
      <ConfirmDialog
        isOpen={Boolean(confirmRegenerate)}
        onClose={() => setConfirmRegenerate(null)}
        title="Regenerate Payslip?"
        message={`A new version (V${(confirmRegenerate?.version || 1) + 1}) will be generated from the same processed payroll record. The current version stays in history and payroll values never change.`}
        confirmLabel="Regenerate"
        loading={regenerating}
        onConfirm={handleRegenerate}
      />
    </div>
  )
}

export default PayrollRecordDetail
