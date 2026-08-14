import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Calculator, CheckCircle2, Play, RefreshCw, AlertCircle, Eye, Loader2, Plus, Send, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import { payrollAPI } from '../../api/payroll'
import { Button, ConfirmDialog, PageHeader, Skeleton } from '../../components/ui'
import { usePayrollPermissions } from '../../hooks/usePayrollPermissions'

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-600', calculating: 'bg-blue-50 text-blue-700',
  calculated: 'bg-indigo-50 text-indigo-700', review: 'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700', processed: 'bg-purple-50 text-purple-700',
}
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const formatCurrency = (v) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0 }).format(v || 0)

const PayrollPeriodDetail = () => {
  const { periodId } = useParams()
  const navigate = useNavigate()
  const { canManage } = usePayrollPermissions()
  const [period, setPeriod] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)

  const loadData = useCallback(async () => {
    if (!periodId) return
    try {
      setLoading(true); setError(null)
      const [periodRes, recordsRes] = await Promise.all([
        payrollAPI.getPeriod(periodId),
        payrollAPI.getPeriodRecords(periodId),
      ])
      setPeriod(periodRes.data)
      setRecords(recordsRes.data || [])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load payroll')
    } finally { setLoading(false) }
  }, [periodId])

  useEffect(() => { loadData() }, [loadData])

  const handleAction = async (action) => {
    try {
      setActionLoading(action)
      if (action === 'calculate') await payrollAPI.calculatePeriod(periodId)
      else if (action === 'review') await payrollAPI.reviewPeriod(periodId)
      else if (action === 'approve') await payrollAPI.approvePeriod(periodId)
      else if (action === 'process') await payrollAPI.processPeriod(periodId)
      toast.success(`Payroll ${action}d successfully`)
      loadData()
    } catch (err) {
      toast.error(err?.response?.data?.detail || `Failed to ${action}`)
    } finally { setActionLoading(null) }
  }

  // ── Bulk payslip generation ──────────────────────────────────────────────
  const eligibleCount = records.filter((r) => r.status !== 'blocked').length
  const handleBulkGenerate = async () => {
    setBulkLoading(true)
    try {
      const res = await payrollAPI.generatePeriodPayslips(periodId)
      const summary = res.data || {}
      const generated = summary.generated?.length || 0
      const existing = summary.already_existing?.length || 0
      const failed = summary.failed?.length || 0
      const skipped = summary.skipped?.length || 0

      if (failed > 0) {
        toast.error(`${generated} payslip(s) generated · ${failed} failed${existing ? ` · ${existing} already existed` : ''}${skipped ? ` · ${skipped} skipped` : ''}`)
      } else if (generated > 0) {
        toast.success(`${generated} payslip(s) generated${existing ? ` · ${existing} already existed` : ''}${skipped ? ` · ${skipped} skipped` : ''}`)
      } else {
        toast.success(`No new payslips generated${existing ? ` — ${existing} already exist` : ''}${skipped ? ` (${skipped} skipped)` : ''}`)
      }
      setBulkOpen(false)
      loadData()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to generate payslips')
    } finally { setBulkLoading(false) }
  }

  if (loading) return <div className="space-y-4 p-4 md:p-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-48 w-full" /></div>
  if (error) return (
    <div className="p-4 md:p-6"><div className="rounded-lg border border-red-200 bg-white p-5 dark:border-red-900/60 dark:bg-gray-800">
      <div className="flex items-start gap-3"><AlertCircle className="h-5 w-5 text-red-600" /><div>
        <p className="font-medium text-gray-900 dark:text-white">{error}</p>
        <Button className="mt-3" variant="secondary" onClick={loadData}><RefreshCw className="h-4 w-4" /> Retry</Button>
      </div></div></div></div>
  )
  if (!period) return null

  const canCalculate = ['draft', 'calculated', 'review'].includes(period.status)
  const canReview = period.status === 'calculated'
  const canApprove = period.status === 'review'
  const canProcess = period.status === 'approved'
  const canBulkGenerate = period.status === 'processed' && canManage && records.length > 0
  const generatedCount = records.filter((r) => r.payslip?.generated).length

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/hr/payroll')} className="text-gray-400 hover:text-gray-600"><ArrowLeft className="h-5 w-5" /></button>
        <PageHeader title={`${MONTHS[period.month - 1]} ${period.year} Payroll`} description={`Status: ${period.status}`} />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Employees', value: period.employee_count, color: 'text-gray-900 dark:text-white' },
          { label: 'Total Earnings', value: formatCurrency(period.total_earnings), color: 'text-green-600' },
          { label: 'Total Deductions', value: formatCurrency(period.total_deductions), color: 'text-red-600' },
          { label: 'Net Payroll', value: formatCurrency(period.total_net), color: 'text-indigo-600 dark:text-indigo-400' },
        ].map(card => (
          <div key={card.label} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
            <p className={`mt-1 text-lg font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {period.blocked_count > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/30">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">
            {period.blocked_count} employee(s) have blockers (missing salary structure or other issues).
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {canCalculate && (
          <Button onClick={() => handleAction('calculate')} loading={actionLoading === 'calculate'}>
            <Calculator className="h-4 w-4" /> {period.status === 'draft' ? 'Calculate Payroll' : 'Recalculate'}
          </Button>
        )}
        {canReview && (
          <Button onClick={() => handleAction('review')} loading={actionLoading === 'review'} variant="secondary">
            <Send className="h-4 w-4" /> Move to Review
          </Button>
        )}
        {canApprove && (
          <Button onClick={() => handleAction('approve')} loading={actionLoading === 'approve'}>
            <CheckCircle2 className="h-4 w-4" /> Approve Payroll
          </Button>
        )}
        {canProcess && (
          <Button onClick={() => handleAction('process')} loading={actionLoading === 'process'}>
            <Play className="h-4 w-4" /> Process Payroll
          </Button>
        )}
        {canBulkGenerate && (
          <Button onClick={() => setBulkOpen(true)} loading={bulkLoading} loadingText="Generating payslips…" variant="secondary">
            <Plus className="mr-2 h-4 w-4" /> Generate Payslips
          </Button>
        )}
      </div>

      {/* Employee Records Table */}
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Employee Payroll Records</h3>
          {period.status === 'processed' && records.length > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Payslips: {generatedCount} of {records.length} generated
            </span>
          )}
        </div>
        {records.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {period.status === 'draft' ? 'Calculate payroll to generate employee records.' : 'No records found.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Department</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Payable Days</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Gross</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Deductions</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Net</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Payslip</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {records.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{r.employee_name || r.employee_id}</p>
                      {r.employee_number && <p className="text-xs text-gray-500">{r.employee_number}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{r.department || '-'}</td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-gray-900 dark:text-white">{r.payable_days}</td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-gray-900 dark:text-white">{formatCurrency(r.gross_salary)}</td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-red-600">{formatCurrency(r.total_deductions)}</td>
                    <td className="px-4 py-3 text-right text-sm font-mono font-semibold text-indigo-600 dark:text-indigo-400">{formatCurrency(r.net_salary)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status] || 'bg-gray-100 text-gray-600'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.payslip?.generated ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-400">
                          <FileText className="h-3 w-3" /> Generated {r.payslip.version > 1 ? `· V${r.payslip.version}` : ''}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700/40 dark:text-gray-400">
                          Not Generated
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => navigate(`/hr/payroll/${periodId}/records/${r.id}`)}
                        className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400">
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk generate confirm */}
      <ConfirmDialog
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Generate Payslips?"
        message={`Generate payslips for ${eligibleCount} processed employee record(s)? Blocked or already-generated records are skipped.`}
        confirmLabel="Generate Payslips"
        loading={bulkLoading}
        onConfirm={handleBulkGenerate}
      />
    </div>
  )
}

export default PayrollPeriodDetail
