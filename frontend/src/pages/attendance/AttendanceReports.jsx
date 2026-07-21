import { useEffect, useState, useCallback } from 'react'
import {
  CalendarDays, Download, Filter, RefreshCw, User
} from 'lucide-react'
import { PageHeader, Button, Badge, Table } from '../../components/ui'
import { attendanceAPI } from '../../api/attendance'
import { usersAPI } from '../../api/users'
import { useAuthStore } from '../../store/authStore'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { timeService } from '@/services/timeService'

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

  // Export CSV
  const handleExport = async () => {
    try {
      setExporting(true)
      const res = await attendanceAPI.exportAttendanceReport(startDate, endDate, employeeId || null)
      
      // Axios response type blob is returned as payload blob in res or res.data
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
          'Overtime': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
          'Full Time': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
          'Under Time': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
        }
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${colorMap[wt] || colorMap['Under Time']}`}>
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
        if (secs <= 0) return <span className="text-gray-400">—</span>
        const hrs = Math.floor(secs / 3600)
        const mins = Math.floor((secs % 3600) / 60)
        return <span className="text-amber-600 dark:text-amber-400 font-semibold">+{hrs}h {mins}m</span>
      }
    },
    {
      key: 'is_late',
      header: 'Late',
      render: (row) => row.is_late
        ? <span className="text-rose-600 dark:text-rose-400 font-semibold text-xs">Yes</span>
        : <span className="text-gray-400 text-xs">No</span>
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
    <div className="space-y-6">
      <PageHeader
        title="Attendance Reports"
        description="View and export historic employee work logs and active tracking stats."
        actions={
          <div className="flex items-center space-x-2">
            <Button variant="secondary" size="sm" onClick={loadHistory}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={handleExport} loading={exporting}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Filter Card */}
      <div className="card p-5 bg-white dark:bg-gray-900 border border-surface-border/80 dark:border-gray-800 shadow-sm">
        <div className="flex items-center space-x-2 mb-4 border-b border-gray-100 dark:border-gray-800 pb-2">
          <Filter className="h-4.5 w-4.5 text-gray-400" />
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            Report Filters
          </h3>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {/* Start Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">Start Date</label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-2.5 h-4.5 w-4.5 text-gray-400" />
              <input
                type="date"
                className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-800 dark:text-gray-200"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
          </div>

          {/* End Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">End Date</label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-2.5 h-4.5 w-4.5 text-gray-400" />
              <input
                type="date"
                className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-800 dark:text-gray-200"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Employee Dropdown (Admins/Managers only) */}
          {!isEmployee && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">Employee</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4.5 w-4.5 text-gray-400" />
                <select
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-850 dark:text-gray-250"
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
      <div className="card p-6 bg-white dark:bg-gray-900 border border-surface-border/80 dark:border-gray-800 shadow-sm">
        {loading ? (
          <div className="py-12 text-center text-gray-400">Loading work logs...</div>
        ) : records.length === 0 ? (
          <div className="py-12 text-center text-gray-450 border border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
            No attendance logs found for the selected date range.
          </div>
        ) : (
          <Table columns={columns} data={records} />
        )}
      </div>
    </div>
  )
}

export default AttendanceReports
