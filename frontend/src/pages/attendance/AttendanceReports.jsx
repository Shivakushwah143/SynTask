import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Download, Filter, RefreshCw, User, Clock, Users, Activity, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageHeader, Badge, Table } from '../../components/ui'
import { attendanceAPI } from '../../api/attendance'
import { usersAPI } from '../../api/users'
import { useAuthStore } from '../../store/authStore'
import { timeService } from '@/services/timeService'

const formatSeconds = (seconds = 0) => {
  const s = Math.max(0, Math.floor(seconds))
  const hrs = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  return `${hrs}h ${mins}m`
}

const displayStatus = (status) => {
  if (status === 'working' || status === 'Working') return 'Working'
  if (status === 'on_break' || status === 'On Break') return 'On Break'
  return 'Completed'
}

const StatCard = ({ label, value, icon: Icon, subtitle }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <Icon className="h-4 w-4 text-indigo-500" />
    </div>
    <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
  </div>
)

const AttendanceReports = () => {
  const { user } = useAuthStore()
  const isEmployee = user?.role === 'employee'
  const [records, setRecords] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [startDate, setStartDate] = useState(timeService.toZonedDateOnly(timeService.addDays(timeService.now(), -7)))
  const [endDate, setEndDate] = useState(timeService.toZonedDateOnly(timeService.now()))
  const [employeeId, setEmployeeId] = useState('')

  const loadEmployeesDropdown = useCallback(async () => {
    if (isEmployee) return
    try {
      const res = await usersAPI.listUsers()
      setEmployees((res?.users || []).filter(u => u.role === 'employee'))
    } catch {
      setEmployees([])
    }
  }, [isEmployee])

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true)
      const res = await attendanceAPI.getAttendanceHistory(startDate, endDate, employeeId || null)
      setRecords(res?.data || [])
    } catch {
      toast.error('Failed to load attendance logs')
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, employeeId])

  useEffect(() => {
    loadEmployeesDropdown()
    loadHistory()
  }, [loadHistory, loadEmployeesDropdown])

  const handleExport = async () => {
    try {
      setExporting(true)
      const res = await attendanceAPI.exportAttendanceReport(startDate, endDate, employeeId || null)
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `attendance_report_${startDate}_to_${endDate}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success('Report downloaded successfully')
    } catch {
      toast.error('Failed to export CSV report')
    } finally {
      setExporting(false)
    }
  }

  const totalWork = records.reduce((sum, r) => sum + (r.total_work_seconds ?? r.total_working_hours ?? 0), 0)
  const activeCount = records.filter(r => ['working', 'on_break', 'Working', 'On Break'].includes(r.status)).length
  const completedCount = records.length - activeCount

  const columns = [
    { key: 'date', header: 'Date', render: row => timeService.formatDateOnly(row.date || row.attendance_date) },
    ...(isEmployee ? [] : [{ key: 'employee_name', header: 'Employee', render: row => row.employee_name }]),
    { key: 'login_time', header: 'Check In', render: row => row.check_in_at || row.login_time ? timeService.formatPattern(row.check_in_at || row.login_time, 'hh:mm a') : '-' },
    { key: 'logout_time', header: 'Check Out', render: row => row.check_out_at || row.logout_time ? timeService.formatPattern(row.check_out_at || row.logout_time, 'hh:mm a') : 'Active' },
    { key: 'break_duration', header: 'Break Time', render: row => formatSeconds(row.total_break_seconds ?? row.break_duration) },
    { key: 'total_working_hours', header: 'Total Work Time', render: row => formatSeconds(row.total_work_seconds ?? row.total_working_hours) },
    { key: 'status', header: 'Status', render: row => <Badge label={displayStatus(row.status)} colorKey={displayStatus(row.status)} /> },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader title="Attendance Reports" description="Saved daily attendance records." />

      <div className="flex flex-wrap gap-3">
        <button onClick={loadHistory} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
        <button onClick={handleExport} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200">
          <Download className="h-4 w-4" /> {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Records" value={records.length} icon={Users} subtitle="Attendance entries" />
        <StatCard label="Total Hours" value={formatSeconds(totalWork)} icon={Clock} subtitle="Combined working time" />
        <StatCard label="Active" value={activeCount} icon={Activity} subtitle="Working or on break" />
        <StatCard label="Completed" value={completedCount} icon={CheckCircle2} subtitle="Checked out records" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          <Filter className="h-5 w-5 text-indigo-500" /> Filters
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Start Date
            <div className="relative mt-1">
              <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
            </div>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            End Date
            <div className="relative mt-1">
              <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
            </div>
          </label>
          {!isEmployee && (
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Employee
              <div className="relative mt-1">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                  <option value="">All Employees</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>)}
                </select>
              </div>
            </label>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {loading ? <div className="py-10 text-center text-gray-500">Loading work logs...</div> : <Table columns={columns} data={records} />}
      </div>
    </div>
  )
}

export default AttendanceReports
