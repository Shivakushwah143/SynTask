import { useCallback, useEffect, useState } from 'react'
import { DollarSign, Plus, History, ChevronDown, ChevronUp, AlertCircle, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { salaryAPI } from '../../../../api/salary'
import { Button, Skeleton } from '../../../../components/ui'

const CURRENCY_SYMBOLS = { INR: '\u20B9', USD: '$', EUR: '\u20AC', GBP: '\u00A3' }

const formatCurrency = (amount, currency = 'INR') => {
  const sym = CURRENCY_SYMBOLS[currency] || currency + ' '
  return `${sym}${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`
}

const formatDate = (d) => {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const unwrapSalaryPayload = (response) => response?.data?.data || response?.data || response || {}

const SalaryTab = ({ employeeId, canManage = false, onAssign, onRevise }) => {
  const [current, setCurrent] = useState(null)
  const [upcoming, setUpcoming] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  const loadSalary = useCallback(async () => {
    if (!employeeId) return
    try {
      setLoading(true); setError(null)
      const [salaryRes, historyRes] = await Promise.all([
        salaryAPI.getEmployeeSalary(employeeId),
        salaryAPI.getEmployeeSalaryHistory(employeeId),
      ])
      const salaryData = unwrapSalaryPayload(salaryRes)
      const historyData = unwrapSalaryPayload(historyRes)
      setCurrent(salaryData.current || null)
      setUpcoming(salaryData.upcoming || null)
      setHistory(Array.isArray(historyData) ? historyData : [])
    } catch (err) {
      if (err?.response?.status === 403) {
        setError('You do not have permission to view salary')
      } else if (err?.response?.status === 404) {
        setCurrent(null)
        setUpcoming(null)
        setHistory([])
      } else {
        setError(err?.response?.data?.detail || 'Failed to load salary')
      }
    } finally { setLoading(false) }
  }, [employeeId])

  useEffect(() => { loadSalary() }, [loadSalary])

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-red-500" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{error}</p>
            <Button className="mt-3" variant="secondary" size="sm" onClick={loadSalary}>
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // No salary at all
  if (!current) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center dark:border-gray-600 dark:bg-gray-800">
        <DollarSign className="mx-auto h-10 w-10 text-gray-400" />
        <h3 className="mt-3 text-sm font-medium text-gray-900 dark:text-white">No salary structure assigned</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Assign a salary structure to start tracking compensation.</p>
        {canManage && (
          <Button className="mt-4" onClick={onAssign}><Plus className="h-4 w-4" /> Assign Salary Structure</Button>
        )}
      </div>
    )
  }

  const earnings = (current.items || []).filter(i => i.component_type === 'earning')
  const deductions = (current.items || []).filter(i => i.component_type === 'deduction')

  return (
    <div className="space-y-4">
      {/* Current Salary */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Current Salary Structure</h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Effective from {formatDate(current.effective_from)} | {current.currency} | {current.pay_frequency}
            </p>
          </div>
          {canManage && (
            <Button size="sm" onClick={onRevise}><Plus className="h-3.5 w-3.5" /> Revise Salary</Button>
          )}
        </div>

        <div className="p-5">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Earnings */}
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">Earnings</h4>
              <div className="space-y-2">
                {earnings.map(item => (
                  <div key={item.component_id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">{item.component_name}</span>
                    <span className="font-mono font-medium text-gray-900 dark:text-white">
                      {item.calculation_type === 'percentage' && <span className="text-xs text-gray-400 mr-2">{item.percentage}%</span>}
                      {formatCurrency(item.calculated_amount, current.currency)}
                    </span>
                  </div>
                ))}
                {earnings.length === 0 && <p className="text-sm text-gray-400">No earnings configured</p>}
                <div className="border-t border-gray-200 pt-2 dark:border-gray-700">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span className="text-gray-900 dark:text-white">Total Earnings</span>
                    <span className="font-mono text-green-600 dark:text-green-400">{formatCurrency(current.total_earnings, current.currency)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">Configured Deductions</h4>
              <div className="space-y-2">
                {deductions.map(item => (
                  <div key={item.component_id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">{item.component_name}</span>
                    <span className="font-mono font-medium text-gray-900 dark:text-white">
                      {formatCurrency(item.calculated_amount, current.currency)}
                    </span>
                  </div>
                ))}
                {deductions.length === 0 && <p className="text-sm text-gray-400">No deductions configured</p>}
                <div className="border-t border-gray-200 pt-2 dark:border-gray-700">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span className="text-gray-900 dark:text-white">Total Deductions</span>
                    <span className="font-mono text-red-600 dark:text-red-400">{formatCurrency(current.total_configured_deductions, current.currency)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Net */}
          <div className="mt-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-900/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Configured Net</span>
              <span className="font-mono text-lg font-bold text-indigo-600 dark:text-indigo-400">
                {formatCurrency(current.configured_net, current.currency)}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              This is the fixed structure preview. Actual payroll may differ.
            </p>
          </div>
        </div>
      </div>

      {/* Upcoming Salary */}
      {upcoming && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900 dark:text-amber-300">Upcoming</span>
            Salary revision effective from {formatDate(upcoming.effective_from)}
          </div>
          <div className="mt-2 flex items-center gap-4 text-sm text-amber-700 dark:text-amber-400">
            <span>Earnings: {formatCurrency(upcoming.total_earnings, upcoming.currency)}</span>
            <span>Deductions: {formatCurrency(upcoming.total_configured_deductions, upcoming.currency)}</span>
            <span>Net: {formatCurrency(upcoming.configured_net, upcoming.currency)}</span>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 1 && (
        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50 dark:text-white dark:hover:bg-gray-700/50"
          >
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-gray-400" />
              Salary History ({history.length} versions)
            </div>
            {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showHistory && (
            <div className="overflow-x-auto border-t border-gray-200 dark:border-gray-700">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Effective From</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Effective To</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Earnings</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Deductions</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Net</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {history.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{formatDate(s.effective_from)}</td>
                      <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{s.effective_to ? formatDate(s.effective_to) : 'Current'}</td>
                      <td className="px-4 py-2 text-right text-sm font-mono text-gray-900 dark:text-white">{formatCurrency(s.total_earnings, s.currency)}</td>
                      <td className="px-4 py-2 text-right text-sm font-mono text-gray-900 dark:text-white">{formatCurrency(s.total_configured_deductions, s.currency)}</td>
                      <td className="px-4 py-2 text-right text-sm font-mono font-medium text-indigo-600 dark:text-indigo-400">{formatCurrency(s.configured_net, s.currency)}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.status_label === 'current' ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300'
                          : s.status_label === 'upcoming' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                        }`}>{s.status_label}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SalaryTab
