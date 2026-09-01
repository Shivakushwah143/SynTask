import { useCallback, useEffect, useState } from 'react'

import { AlertCircle, DollarSign, Eye, Plus, RefreshCw } from 'lucide-react'
import { salaryAPI } from '../../api/salary'
import { Button, PageHeader, Skeleton } from '../../components/ui'

const formatCurrency = (val, currency = 'INR') => {
  const sym = currency === 'INR' ? '\u20B9' : currency + ' '
  return `${sym}${Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`
}

const formatDate = (d) => {
  if (!d) return '\u2014'
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return d }
}

const STATUS_STYLES = {
  active: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  superseded: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const SalaryStructuresPage = () => {
  const [structures, setStructures] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadStructures = useCallback(async () => {
    try {
      setLoading(true); setError(null)
      const res = await salaryAPI.listStructures()
      setStructures(res.data || [])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load salary structures')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadStructures() }, [loadStructures])

  if (loading) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <PageHeader title="Salary Structures" description="View and manage employee salary structures." />
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <PageHeader title="Salary Structures" />
        <div className="rounded-lg border border-red-200 bg-white p-5 dark:border-red-900/60 dark:bg-gray-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Could not load salary structures</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{error}</p>
              <Button className="mt-4" variant="secondary" onClick={loadStructures}><RefreshCw className="h-4 w-4" /> Try Again</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Group by employee to show current vs historical
  const employeeMap = {}
  for (const s of structures) {
    if (!employeeMap[s.employee_id]) {
      employeeMap[s.employee_id] = { name: s.employee_name, number: s.employee_number, structures: [] }
    }
    employeeMap[s.employee_id].structures.push(s)
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader title="Salary Structures" description="View employee salary assignments and version history."
        action={null} />

      {structures.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center dark:border-gray-700 dark:bg-gray-800">
          <DollarSign className="mx-auto h-10 w-10 text-gray-400" />
          <h3 className="mt-3 text-sm font-medium text-gray-900 dark:text-white">No salary structures yet</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Assign a salary structure to an employee from their profile.</p>
          <Button className="mt-4" onClick={() => window.location.href = '/hr/employees'}>View Employees</Button>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Effective From</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Effective To</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Earnings</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Deductions</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Currency</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Version</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {structures.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{s.employee_name}</div>
                      {s.employee_number && <div className="text-xs text-gray-500 dark:text-gray-400">{s.employee_number}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{formatDate(s.effective_from)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{formatDate(s.effective_to)}</td>
                    <td className="px-4 py-3 text-sm font-mono text-green-600 dark:text-green-400">{formatCurrency(s.total_earnings, s.currency)}</td>
                    <td className="px-4 py-3 text-sm font-mono text-red-600 dark:text-red-400">{formatCurrency(s.total_deductions, s.currency)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{s.currency}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[s.status] || STATUS_STYLES.active}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">V{s.version || 1}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default SalaryStructuresPage
