import { useEffect, useState, useCallback } from 'react'
import {
  CalendarDays, Download, Filter, RefreshCw, User,
  Users, Clock, TrendingUp, Award, Activity, BarChart3,
  CheckCircle2, AlertTriangle, XCircle
} from 'lucide-react'
import { PageHeader, Button, Badge, Table } from '../../components/ui'
import { attendanceAPI } from '../../api/attendance'
import { usersAPI } from '../../api/users'
import { useAuthStore } from '../../store/authStore'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { timeService } from '@/services/timeService'

// Stat Card Component
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
    teal: 'from-teal-500 to-cyan-500',
  }

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  )
}

const AttendanceReports = () => {
  const { user } = useAuthStore()
  const isEmployee = user?.role === 'employee'

  const [records, setRecords] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  // Filters
  const [startDate, setStartDate] = useState(format(timeService.addDays(timeService.now(), -7), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(timeService.now(), 'yyyy-MM-dd'))
  const [employeeId, setEmployeeId] = useState('')

  // Load roster for dropdown (if admin/manager/lead)
  const loadEmployeesDropdown = useCallback(async () => {
    if (isEmployee) return
    try {
      const res = await usersAPI.listUsers()
      if (res && res.users) {
        setEmployees(res.users.filter(u => u.role === 'employee'))
      }
    } catch (e) {
      console.error('Failed to load employee list for filtering:', e)
    }
  }, [isEmployee])

  // Load attendance history logs
  const loadHistory = useCallback(async () => {
    try {
      setLoading(true)
      const res = await attendanceAPI.getAttendanceHistory(startDate, endDate, employeeId || null)
      if (res && res.data) {
        setRecords(res.data)
      }
    } catch (e) {
      toast.error('Failed to load attendance logs')
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, employeeId])

  useEffect(() => {
    loadEmployeesDropdown()
    loadHistory()
  }, [loadHistory, loadEmployeesDropdown])

  // Calculate stats
  const totalRecords = records.length
  const totalWorkingHours = records.reduce((sum, r) => sum + (r.total_working_hours || 0), 0)
  const totalOvertime = records.reduce((sum, r) => sum + (r.overtime_seconds || 0), 0)
  const lateCount = records.filter(r => r.is_late).length
  const fullTimeCount = records.filter(r => r.work_type === 'Full Time').length
  const overtimeCount = records.filter(r => r.work_type === 'Overtime').length
  const underTimeCount = records.filter(r => r.work_type === 'Under Time').length

  // Format hours for display
  const formatHours = (seconds) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    return `${hrs}h ${mins}m`
  }

  // Export CSV
  const handleExport = async () => {
    try {
      setExporting(true)
      const res = await attendanceAPI.exportAttendanceReport(startDate, endDate, employeeId || null)
      
      const blob = new Blob([res.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `attendance_report_${startDate}_to_${endDate}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      
      toast.success('Report downloaded successfully')
    } catch (e) {
      toast.error('Failed to export CSV report')
    } finally {
      setExporting(false)
    }
  }

  const columns = [
    { key: 'date', header: 'Date', render: (row) => format(timeService.instant(row.date), 'MMM d, yyyy') },
    ...(isEmployee ? [] : [
      { key: 'employee_name', header: 'Employee', render: (row) => row.employee_name }
    ]),
    {
      key: 'login_time',
      header: 'Login',
      render: (row) => row.login_time ? format(timeService.instant(row.login_time), 'hh:mm a') : '—'
    },
    {
      key: 'logout_time',
      header: 'Logout',
      render: (row) => row.logout_time ? format(timeService.instant(row.logout_time), 'hh:mm a') : 'Active'
    },
    {
      key: 'total_working_hours',
      header: 'Working Time',
      render: (row) => {
        const hrs = Math.floor(row.total_working_hours / 3600)
        const mins = Math.floor((row.total_working_hours % 3600) / 60)
        return `${hrs}h ${mins}m`
      }
    },
    {
      key: 'work_type',
      header: 'Work Type',
      render: (row) => {
        const wt = row.work_type || 'Under Time'
        const colorMap = {
          'Overtime': 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 dark:from-amber-900/40 dark:to-orange-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700',
          'Full Time': 'bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-800 dark:from-emerald-900/40 dark:to-teal-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700',
          'Under Time': 'bg-gradient-to-r from-rose-100 to-pink-100 text-rose-700 dark:from-rose-900/40 dark:to-pink-900/40 dark:text-rose-300 border border-rose-300 dark:border-rose-700',
        }
        return (
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold shadow-sm ${colorMap[wt] || colorMap['Under Time']}`}>
            {wt}
          </span>
        )
      }
    },
    {
      key: 'overtime_seconds',
      header: 'Overtime',
      render: (row) => {
        const secs = row.overtime_seconds || 0
        if (secs <= 0) return <span className="text-gray-400 dark:text-gray-600">—</span>
        const hrs = Math.floor(secs / 3600)
        const mins = Math.floor((secs % 3600) / 60)
        return <span className="text-amber-600 dark:text-amber-400 font-semibold">+{hrs}h {mins}m</span>
      }
    },
    {
      key: 'is_late',
      header: 'Late',
      render: (row) => row.is_late
        ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"><AlertTriangle className="h-3 w-3 mr-0.5" /> Yes</span>
        : <span className="text-gray-400 dark:text-gray-600 text-xs">No</span>
    },
    {
      key: 'break_duration',
      header: 'Break',
      render: (row) => {
        const hrs = Math.floor(row.break_duration / 3600)
        const mins = Math.floor((row.break_duration % 3600) / 60)
        return `${hrs}h ${mins}m`
      }
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge label={row.status} colorKey={row.status} />
    }
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">Attendance Reports</h1>
              <p className="mt-1 text-indigo-100">View and export historic employee work logs and active tracking stats.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={loadHistory}
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Records"
          value={totalRecords}
          icon={Users}
          color="indigo"
          subtitle="Attendance entries"
        />
        <StatCard
          label="Total Hours"
          value={formatHours(totalWorkingHours)}
          icon={Clock}
          color="emerald"
          subtitle="Combined working time"
        />
        <StatCard
          label="Overtime"
          value={formatHours(totalOvertime)}
          icon={TrendingUp}
          color="amber"
          subtitle="Extra hours worked"
        />
        <StatCard
          label="Late Arrivals"
          value={lateCount}
          icon={AlertTriangle}
          color="rose"
          subtitle={`${totalRecords > 0 ? Math.round((lateCount / totalRecords) * 100) : 0}% of entries`}
        />
      </div>

      {/* Work Type Breakdown */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-center dark:border-emerald-800/50 dark:bg-emerald-950/20">
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Full Time</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{fullTimeCount}</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">Days</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-center dark:border-amber-800/50 dark:bg-amber-950/20">
          <div className="flex items-center justify-center gap-2">
            <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Overtime</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-700 dark:text-amber-300">{overtimeCount}</p>
          <p className="text-xs text-amber-600 dark:text-amber-400">Days</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-center dark:border-rose-800/50 dark:bg-rose-950/20">
          <div className="flex items-center justify-center gap-2">
            <XCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            <span className="text-sm font-medium text-rose-700 dark:text-rose-300">Under Time</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-rose-700 dark:text-rose-300">{underTimeCount}</p>
          <p className="text-xs text-rose-600 dark:text-rose-400">Days</p>
        </div>
      </div>

      {/* Filter Card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center space-x-2 mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
          <Filter className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            Report Filters
          </h3>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {/* Start Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Start Date</label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-400" />
              <input
                type="date"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
          </div>

          {/* End Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">End Date</label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-400" />
              <input
                type="date"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Employee Dropdown (Admins/Managers only) */}
          {!isEmployee && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Employee</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-400" />
                <select
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  value={employeeId}
                  onChange={e => setEmployeeId(e.target.value)}
                >
                  <option value="">All Employees</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reports Table Card */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                <Activity className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Attendance Logs</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{records.length} records found</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                {fullTimeCount} Full Time
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                {overtimeCount} Overtime
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-400"></span>
                {underTimeCount} Under Time
              </span>
            </div>
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="py-12 text-center">
              <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-500 dark:text-gray-400">Loading work logs...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                <BarChart3 className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">No attendance logs found</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Try adjusting your date range or filters.</p>
            </div>
          ) : (
            <Table columns={columns} data={records} />
          )}
        </div>
      </div>
    </div>
  )
}

export default AttendanceReports
