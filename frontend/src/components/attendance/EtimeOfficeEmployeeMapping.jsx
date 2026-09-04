import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Link2, RefreshCw, Trash2, UserCheck, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { attendanceAPI } from '../../api/attendance'
import { Badge } from '../ui'
import { BiometricSyncIcon } from '../../config/visualAssets'

/**
 * HR-admin Employee Mapping panel for the eTimeOffice biometric integration.
 *
 * Shows the eTimeOffice directory (code + name from the provider) with the
 * confirmed SynTask employee per row. Mappings are EXPLICIT: the server only
 * ever resolves punches through this table. A suggested employee is shown for
 * convenience but is never assigned until HR confirms via the row action.
 */
const EtimeOfficeEmployeeMapping = () => {
  const [rows, setRows] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selections, setSelections] = useState({})
  const [busy, setBusy] = useState(null) // 'apply:<code>' | 'remove:<code>'

  const load = useCallback(async (refreshDirectory) => {
    if (refreshDirectory) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await attendanceAPI.getEtimeOfficeMappings(refreshDirectory)
      const data = res?.data || {}
      const nextRows = data.rows || []
      const nextEmployees = data.employees || []
      setRows(nextRows)
      setEmployees(nextEmployees)
      // Default each unmapped row's dropdown to its suggestion (still requires
      // the explicit Map click — suggestion is never an assignment).
      setSelections(() =>
        Object.fromEntries(
          nextRows.map((row) => [
            row.external_employee_code,
            row.employee?.id || row.suggestion?.id || '',
          ]),
        ),
      )
    } catch (err) {
      toast.error(
        err?.response?.data?.detail ||
          'Failed to load eTimeOffice employee mappings',
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load(false)
  }, [load])

  const summary = useMemo(() => {
    const mapped = rows.filter((row) => row.status === 'mapped').length
    return { mapped, unmapped: rows.length - mapped, total: rows.length }
  }, [rows])

  const applyMapping = async (row) => {
    const code = row.external_employee_code
    const employeeId = selections[code] || ''
    if (!employeeId) {
      toast.error('Select a SynTask employee to map, or use Remove Mapping to unmap')
      return
    }
    setBusy(`apply:${code}`)
    try {
      await attendanceAPI.mapEtimeOfficeEmployee(code, employeeId)
      toast.success(`Mapped ${row.external_employee_code || code} to a SynTask employee`)
      await load(false)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save the mapping')
    } finally {
      setBusy(null)
    }
  }

  const removeMapping = async (row) => {
    const code = row.external_employee_code
    setBusy(`remove:${code}`)
    try {
      await attendanceAPI.removeEtimeOfficeMapping(code)
      toast.success('Mapping removed')
      await load(false)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to remove the mapping')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="border-t border-gray-100 px-4 py-4 dark:border-gray-700">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Employee Mapping</h3>
          <Badge label={`${summary.mapped} mapped`} colorKey="healthy" pill />
          <Badge label={`${summary.unmapped} unmapped`} colorKey="neutral" pill />
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing…' : 'Refresh from eTimeOffice'}
        </button>
      </div>

      <p className="mb-3 flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <BiometricSyncIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
        <span>Attendance sync resolves each eTimeOffice code only through this table. Suggested employees
        below are never assigned automatically — confirm each mapping explicitly.</span>
      </p>

      {loading ? (
        <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Loading eTimeOffice employees…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
          No eTimeOffice employees found yet. Click “Refresh from eTimeOffice” after the provider is
          reachable, or run a sync first.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-gray-700">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="px-3 py-2 font-medium">eTimeOffice Code</th>
                <th className="px-3 py-2 font-medium">eTimeOffice Name</th>
                <th className="px-3 py-2 font-medium">SynTask Employee</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {rows.map((row) => {
                const code = row.external_employee_code
                const busyKey = busy === `apply:${code}` || busy === `remove:${code}`
                const mapped = row.status === 'mapped'
                const hasSuggestion = Boolean(row.suggestion)
                return (
                  <tr key={code}>
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-gray-900 dark:text-white">
                      {code}
                    </td>
                    <td className="px-3 py-2.5 text-gray-800 dark:text-gray-200">
                      {row.external_employee_name || '—'}
                      {!mapped && hasSuggestion && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                          <UserCheck className="h-3 w-3" />
                          Suggested: {row.suggestion.name}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={selections[code] || ''}
                        onChange={(e) => setSelections((prev) => ({ ...prev, [code]: e.target.value }))}
                        disabled={busyKey}
                        className="w-full max-w-[220px] rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      >
                        <option value="">{mapped ? row.employee?.name || 'Mapped employee' : 'Select SynTask employee'}</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name}
                            {emp.employee_number ? ` (${emp.employee_number})` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      {mapped ? (
                        <Badge label="Mapped" colorKey="healthy" pill />
                      ) : (
                        <Badge label="Unmapped" colorKey="lost" pill />
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {!mapped && (
                          <button
                            onClick={() => applyMapping(row)}
                            disabled={busyKey || !selections[code]}
                            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Link2 className="h-3 w-3" />
                            {busy === `apply:${code}` ? 'Saving…' : 'Map'}
                          </button>
                        )}
                        {mapped && (
                          <>
                            <button
                              onClick={() => applyMapping(row)}
                              disabled={busyKey || !selections[code] || selections[code] === row.employee?.id}
                              title="Save a different employee"
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                            >
                              <ArrowRight className="h-3 w-3" />
                              Change
                            </button>
                            <button
                              onClick={() => removeMapping(row)}
                              disabled={busyKey}
                              title="Remove mapping"
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                            >
                              <Trash2 className="h-3 w-3" />
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default EtimeOfficeEmployeeMapping
