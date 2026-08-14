import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calculator, Plus, AlertCircle, RefreshCw, DollarSign, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import { payrollAPI } from '../../api/payroll'
import { Button, Modal, PageHeader, Skeleton } from '../../components/ui'

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  calculating: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  calculated: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
  review: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  approved: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  processed: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const formatCurrency = (val, currency = 'INR') => {
  const sym = currency === 'INR' ? '\u20B9' : currency + ' '
  return `${sym}${Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`
}

const PayrollPeriods = () => {
  const navigate = useNavigate()
  const [periods, setPeriods] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() })
  const [submitting, setSubmitting] = useState(false)

  const loadPeriods = useCallback(async () => {
    try {
      setLoading(true); setError(null)
      const res = await payrollAPI.listPeriods()
      setPeriods(res.data || [])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load payroll periods')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadPeriods() }, [loadPeriods])

  const handleCreate = async () => {
    try {
      setSubmitting(true)
      await payrollAPI.createPeriod({ year: Number(form.year), month: Number(form.month) })
      toast.success('Payroll period created')
      setShowCreate(false)
      loadPeriods()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to create period')
    } finally { setSubmitting(false) }
  }

  if (loading) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <PageHeader title="Payroll" description="Manage monthly payroll periods and calculations." />
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <PageHeader title="Payroll" />
        <div className="rounded-lg border border-red-200 bg-white p-5 dark:border-red-900/60 dark:bg-gray-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Could not load payroll</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{error}</p>
              <Button className="mt-4" variant="secondary" onClick={loadPeriods}><RefreshCw className="h-4 w-4" /> Try Again</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader title="Payroll" description="Manage monthly payroll periods, calculate, review, and process payroll."
        action={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Create Period</Button>} />

      {periods.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center dark:border-gray-700 dark:bg-gray-800">
          <Calculator className="mx-auto h-10 w-10 text-gray-400" />
          <h3 className="mt-3 text-sm font-medium text-gray-900 dark:text-white">No payroll periods</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Create a payroll period to start calculating salaries.</p>
          <Button className="mt-4" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Create First Period</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {periods.map(p => (
            <div key={p.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 transition hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:shadow-none cursor-pointer"
              onClick={() => navigate(`/hr/payroll/${p.id}`)}>
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/40">
                  <DollarSign className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {MONTHS[p.month - 1]} {p.year}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {p.employee_count} employees | Earnings: {formatCurrency(p.total_earnings)} | Net: {formatCurrency(p.total_net)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {p.blocked_count > 0 && (
                  <span className="text-xs font-medium text-red-600">{p.blocked_count} blocked</span>
                )}
                {p.warning_count > 0 && (
                  <span className="text-xs font-medium text-amber-600">{p.warning_count} warnings</span>
                )}
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[p.status] || ''}`}>
                  {p.status}
                </span>
                <Eye className="h-4 w-4 text-gray-400" />
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Payroll Period">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Month *</label>
              <select value={form.month} onChange={e => setForm(f => ({...f, month: e.target.value}))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Year *</label>
              <input type="number" value={form.year} onChange={e => setForm(f => ({...f, year: e.target.value}))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={submitting} loadingText="Creating...">Create Period</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default PayrollPeriods
