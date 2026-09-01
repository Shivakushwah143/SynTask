import { useState } from 'react'
import toast from 'react-hot-toast'
import { AlertCircle, Banknote, Download, Eye, Loader2, Receipt, ShieldAlert, Wallet } from 'lucide-react'
import { payrollAPI, payrollFiles } from '../../../api/payroll'
import { useMyPayslips, useMySalary } from '../../../hooks/useMyHr'
import { Button, EmptyState, Modal, Skeleton } from '../../../components/ui'
import { decodeBlobErrorMessage, downloadBlob, getDownloadFilename } from '../../../utils/download'
import { formatCurrency, formatDate, formatDateTime } from './myHrUtils'

const MyPayslips = () => {
  const { data: payslips, isLoading, isError, error, refetch } = useMyPayslips()
  // Salary is sensitive — fetched lazily only when this page is opened.
  const { data: salary, isLoading: salaryLoading } = useMySalary({ enabled: true })

  const [preview, setPreview] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(null)

  const openPreview = async (item) => {
    setPreview(item)
    setPreviewUrl(null)
    setPreviewError(null)
    setPreviewLoading(true)
    try {
      const response = await payrollFiles.preview(item.payslip_id)
      setPreviewUrl(window.URL.createObjectURL(response.data))
    } catch (err) {
      const message = await decodeBlobErrorMessage(err, 'Unable to preview this payslip. You may not have permission.')
      setPreviewError(message)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleDownload = async (item) => {
    try {
      const response = await payrollFiles.download(item.payslip_id)
      const filename = getDownloadFilename(
        response.headers?.['content-disposition'],
        `payslip-${item.period?.label || ''}-v${item.version}.pdf`,
      )
      downloadBlob(response.data, filename)
    } catch (err) {
      const message = await decodeBlobErrorMessage(err, 'Payslip download could not be prepared')
      toast.error(message)
    }
  }

  const current = salary?.current || null
  const earnings = (current?.items || []).filter((item) => item.component_type === 'earning')
  const deductions = (current?.items || []).filter((item) => item.component_type === 'deduction')

  return (
    <div className="space-y-5">
      {/* Current salary summary — read-only, own structure only */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center gap-2">
          <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <Wallet className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Current Salary Summary</h3>
          <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
            Read-only
          </span>
        </div>
        {salaryLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : !current ? (
          <p className="py-4 text-sm text-gray-400">Salary information is not currently available.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Earnings</p>
              <div className="space-y-1.5">
                {earnings.map((item) => (
                  <div key={item.component_id} className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">{item.component_name}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(item.calculated_amount)}</span>
                  </div>
                ))}
                {earnings.length === 0 && <p className="text-sm text-gray-400">No earnings configured.</p>}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Deductions</p>
              <div className="space-y-1.5">
                {deductions.map((item) => (
                  <div key={item.component_id} className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">{item.component_name}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(item.calculated_amount)}</span>
                  </div>
                ))}
                {deductions.length === 0 && <p className="text-sm text-gray-400">No deductions configured.</p>}
              </div>
            </div>
            <div className="flex flex-col justify-center gap-1 rounded-xl bg-indigo-50 p-4 dark:bg-indigo-950/40">
              <p className="text-xs text-indigo-600 dark:text-indigo-400">Monthly Net (configured)</p>
              <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{formatCurrency(current.configured_net)}</p>
              <p className="text-xs text-indigo-500 dark:text-indigo-400">
                Effective {formatDate(current.effective_from)} · {current.currency}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Payslip history */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center gap-2">
          <div className="rounded-lg bg-sky-50 p-1.5 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
            <Receipt className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">My Payslips</h3>
        </div>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : isError ? (
          <EmptyState
            icon={AlertCircle}
            title="Unable to load your payslips"
            description={error?.response?.data?.detail || 'Please try again in a moment.'}
            action={<Button variant="secondary" onClick={() => refetch()}>Retry</Button>}
          />
        ) : !payslips || payslips.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">No Payslips are available yet.</p>
        ) : (
          <div className="space-y-3">
            {payslips.map((item) => (
              <div key={item.payslip_id} className="flex flex-col gap-3 rounded-xl border border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
                    <Banknote className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white">{item.period?.label || 'Payslip'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Generated {formatDateTime(item.generated_at)} · V{item.version}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-400">Gross</p>
                    <p className="font-medium text-gray-800 dark:text-gray-200">{formatCurrency(item.gross)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Deductions</p>
                    <p className="font-medium text-gray-800 dark:text-gray-200">{formatCurrency(item.deductions)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Net</p>
                    <p className="font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(item.net)}</p>
                  </div>
                  <div className="flex gap-2">
                    {item.can_download !== false && (
                      <Button variant="secondary" size="sm" onClick={() => openPreview(item)}>
                        <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
                      </Button>
                    )}
                    {item.can_download !== false && (
                      <Button variant="secondary" size="sm" onClick={() => handleDownload(item)}>
                        <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Preview modal */}
      <Modal
        isOpen={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={`Payslip Preview · ${preview?.period?.label || ''}`}
        description={`Version ${preview?.version || 1}`}
        size="xl"
        bodyClassName="flex flex-col"
        footer={
          preview ? (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPreview(null)}>Close</Button>
              <Button onClick={() => handleDownload(preview)}>
                <Download className="mr-2 h-4 w-4" /> Download
              </Button>
            </div>
          ) : null
        }
      >
        {previewLoading ? (
          <div className="flex h-80 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
          </div>
        ) : previewError ? (
          <EmptyState icon={ShieldAlert} title="Preview unavailable" description={previewError} />
        ) : previewUrl ? (
          <iframe src={previewUrl} title="Payslip preview" className="h-[70vh] w-full rounded-xl border border-gray-200 dark:border-gray-700" />
        ) : null}
      </Modal>
    </div>
  )
}

export default MyPayslips
