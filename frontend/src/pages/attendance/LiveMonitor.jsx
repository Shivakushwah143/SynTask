import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Video, Monitor, AlertCircle, RefreshCw,
  Search, SlidersHorizontal, User, Clock, TrendingUp, AlertTriangle,
  Users, Activity, Zap, Award, BarChart3, CheckCircle2, XCircle,
  Coffee
} from 'lucide-react'
import { PageHeader, Button, Badge } from '../../components/ui'
import { attendanceAPI } from '../../api/attendance'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'
import { timeService } from '@/services/timeService'
import { closeOpenWebSocket } from '../../utils/webSocket'

const formatTime = (totalSeconds) => {
  if (!totalSeconds || totalSeconds < 0) return '00:00:00'
  const s = Math.floor(totalSeconds)
  const hrs = Math.floor(s / 3600).toString().padStart(2, '0')
  const mins = Math.floor((s % 3600) / 60).toString().padStart(2, '0')
  const secs = (s % 60).toString().padStart(2, '0')
  return `${hrs}:${mins}:${secs}`
}

const WorkTypePill = ({ workType }) => {
  const map = {
    'Overtime': 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 dark:from-amber-900/40 dark:to-orange-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700',
    'Full Time': 'bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-800 dark:from-emerald-900/40 dark:to-teal-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700',
    'Under Time': 'bg-gradient-to-r from-rose-100 to-pink-100 text-rose-700 dark:from-rose-900/40 dark:to-pink-900/40 dark:text-rose-300 border border-rose-300 dark:border-rose-700',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold shadow-sm ${map[workType] || map['Under Time']}`}>
      {workType === 'Overtime' && <TrendingUp className="h-3 w-3 mr-1" />}
      {workType}
    </span>
  )
}

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
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r ${colors[color]} text-white shadow-sm`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <span className="truncate text-[11px] font-semibold uppercase text-gray-500 dark:text-gray-400">{label}</span>
          <p className="mt-0.5 truncate text-lg font-bold leading-tight text-gray-900 dark:text-white">{value}</p>
          {subtitle && <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}

const LiveMonitor = () => {
  const { token } = useAuthStore()
  const [employees, setEmployees] = useState([])
  const [selectedEmp, setSelectedEmp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [cameraFrame, setCameraFrame] = useState(null)
  const [screenFrame, setScreenFrame] = useState(null)

  const socketRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const selectedEmpRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [isWsConnected, setIsWsConnected] = useState(false)

  // Keep selectedEmpRef in sync
  useEffect(() => {
    selectedEmpRef.current = selectedEmp
  }, [selectedEmp])

  // ─── Load Employees ────────────────────────────────────────────────────────
  const loadEmployees = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await attendanceAPI.getLiveMonitoring()
      console.log('Attendance API response:', res)
      
      // Handle different response formats
      let employeeData = []
      if (res?.data) {
        employeeData = Array.isArray(res.data) ? res.data : []
      } else if (Array.isArray(res)) {
        employeeData = res
      }
      
      if (employeeData.length === 0) {
        // If no data, try to get sample data for testing
        setEmployees([])
        setError('No employees currently active. Try starting work first.')
      } else {
        setEmployees(employeeData)
        // Auto-select first employee if none selected
        if (!selectedEmp && employeeData.length > 0) {
          setSelectedEmp(employeeData[0])
        }
      }
    } catch (err) {
      console.error('Error loading employees:', err)
      setError(err?.response?.data?.detail || err?.message || 'Failed to load live employee roster')
      toast.error('Failed to load live employee roster')
      setEmployees([])
    } finally {
      setLoading(false)
    }
  }, [selectedEmp])

  // ─── Local Stopwatch Tick ─────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setEmployees(prev =>
        prev.map(emp => {
          if (emp.status === 'Working') {
            const next = (emp.total_working_hours || 0) + 1
            return { ...emp, total_working_hours: next }
          } else if (emp.status === 'On Break') {
            return { ...emp, break_duration: (emp.break_duration || 0) + 1 }
          }
          return emp
        })
      )
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // ─── WebSocket ───────────────────────────────────────────────────────────────
  const connectSocket = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return

    const apiBaseUrl = import.meta.env.VITE_API_URL || '/api/v1'
    const apiUrl = new URL(apiBaseUrl, window.location.origin)
    const wsProto = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${wsProto}//${apiUrl.host}${apiUrl.pathname.replace(/\/$/, '')}/attendance/ws?token=${encodeURIComponent(token)}`

    const ws = new WebSocket(wsUrl)
    socketRef.current = ws
    reconnectAttemptsRef.current = 0

    ws.onopen = () => {
      setIsWsConnected(true)
      reconnectAttemptsRef.current = 0
      const current = selectedEmpRef.current
      if (current) {
        ws.send(JSON.stringify({ type: 'subscribe_employee', employee_id: current.employee_id }))
      }
    }

    ws.onmessage = (event) => {
      let msg
      try { msg = JSON.parse(event.data) } catch { return }

      if (msg.type === 'status_changed') {
        setEmployees(prev =>
          prev.map(emp => {
            if (emp.employee_id === msg.employee_id) {
              return {
                ...emp,
                status: msg.status,
                camera_permission_status: msg.camera_status || emp.camera_permission_status,
                screen_sharing_status: msg.screen_share_status || emp.screen_sharing_status,
              }
            }
            return emp
          })
        )
        const current = selectedEmpRef.current
        if (current?.employee_id === msg.employee_id && msg.status !== 'Working') {
          setCameraFrame(null)
          setScreenFrame(null)
        }
      }

      else if (msg.type === 'camera_update') {
        const current = selectedEmpRef.current
        if (current?.employee_id === msg.employee_id) {
          setCameraFrame(msg.data)
        }
      }

      else if (msg.type === 'screen_update') {
        const current = selectedEmpRef.current
        if (current?.employee_id === msg.employee_id) {
          setScreenFrame(msg.data)
        }
      }
    }

    ws.onclose = () => {
      setIsWsConnected(false)
      socketRef.current = null

      const delay = Math.min(30000, 1000 * 2 ** reconnectAttemptsRef.current)
      reconnectAttemptsRef.current += 1
      reconnectTimerRef.current = setTimeout(() => {
        if (token) connectSocket()
      }, delay)
    }

    ws.onerror = () => {
      setIsWsConnected(false)
    }
  }, [token])

  // Mount / unmount WS
  useEffect(() => {
    if (!token) return
    connectSocket()
    loadEmployees()

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      closeOpenWebSocket(socketRef.current)
      socketRef.current = null
    }
  }, [token, connectSocket, loadEmployees])

  // ─── Employee Selection ───────────────────────────────────────────────────
  const handleSelectEmployee = (emp) => {
    if (selectedEmpRef.current?.employee_id === emp.employee_id) return
    const ws = socketRef.current

    if (ws?.readyState === WebSocket.OPEN && selectedEmpRef.current) {
      ws.send(JSON.stringify({ type: 'unsubscribe_employee', employee_id: selectedEmpRef.current.employee_id }))
    }

    setCameraFrame(null)
    setScreenFrame(null)
    setSelectedEmp(emp)

    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe_employee', employee_id: emp.employee_id }))
    }
  }

  // Filtered list
  const filteredEmployees = employees.filter(emp => {
    const term = searchTerm.toLowerCase()
    const matchesSearch =
      (emp.employee_name || '').toLowerCase().includes(term) ||
      (emp.email || '').toLowerCase().includes(term) ||
      (emp.department || '').toLowerCase().includes(term)
    const matchesStatus = statusFilter === 'All' || emp.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Calculate stats
  const totalEmployees = employees.length
  const workingCount = employees.filter(e => e.status === 'Working').length
  const onBreakCount = employees.filter(e => e.status === 'On Break').length
  const offlineCount = employees.filter(e => e.status === 'Offline').length

  return (
    <div className="space-y-4 p-4 md:p-5">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 px-4 py-3 text-white shadow-sm">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-lg bg-white/15 p-2 backdrop-blur-sm">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold md:text-xl">Live Monitoring Dashboard</h1>
              <p className="mt-0.5 truncate text-xs text-rose-100">Monitor active workspaces, status changes, and live camera or screen captures.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold ${
              isWsConnected
                ? 'bg-emerald-500/30 text-emerald-100 backdrop-blur-sm'
                : 'bg-rose-500/30 text-rose-100 backdrop-blur-sm'
            }`}>
              <span className={`h-2 w-2 rounded-full mr-2 ${isWsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              {isWsConnected ? '● Live' : '● Reconnecting…'}
            </span>
            <button
              onClick={loadEmployees}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/15 px-3 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/25"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Employees"
          value={totalEmployees}
          icon={Users}
          color="indigo"
          subtitle="All team members"
        />
        <StatCard
          label="Working"
          value={workingCount}
          icon={Activity}
          color="emerald"
          subtitle="Active now"
        />
        <StatCard
          label="On Break"
          value={onBreakCount}
          icon={Coffee}
          color="amber"
          subtitle="Temporarily paused"
        />
        <StatCard
          label="Offline"
          value={offlineCount}
          icon={XCircle}
          color="rose"
          subtitle="Not clocked in"
        />
      </div>

      <div className="grid min-h-[500px] flex-1 gap-4 lg:grid-cols-3">
        {/* SIDEBAR: Employee Directory */}
        <div className="lg:col-span-1 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 flex flex-col overflow-hidden h-[640px]">
          <div className="space-y-3 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search employees..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="flex items-center space-x-2">
              <SlidersHorizontal className="h-4 w-4 text-gray-400 shrink-0" />
              <select
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                disabled={loading}
              >
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="All">All Statuses</option>
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="Working">Working</option>
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="On Break">On Break</option>
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="Offline">Offline</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scroll">
            {loading ? (
              <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                Loading roster...
              </div>
            ) : error ? (
              <div className="py-8 text-center">
                <AlertCircle className="h-10 w-10 text-rose-500 mx-auto mb-3" />
                <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
                <button
                  onClick={loadEmployees}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </button>
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                <Users className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p>No employees match filters.</p>
              </div>
            ) : (
              filteredEmployees.map(emp => {
                const isSelected = selectedEmp?.employee_id === emp.employee_id
                return (
                  <button
                    key={emp.employee_id}
                    onClick={() => handleSelectEmployee(emp)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/50 shadow-md dark:bg-indigo-950/20 dark:border-indigo-700'
                        : 'border-gray-200 hover:border-indigo-200 hover:shadow-sm dark:border-gray-700 dark:hover:border-indigo-700 dark:bg-gray-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white truncate mr-2">
                        {emp.employee_name || 'Unknown User'}
                      </p>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        emp.status === 'Working' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                        emp.status === 'On Break' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {emp.status || 'Offline'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 mb-1.5">
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{emp.department || 'No Department'} • {emp.role?.replace('_', ' ') || 'No Role'}</p>
                      {emp.is_late && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Late
                        </span>
                      )}
                    </div>
                    {emp.login_time && (
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1 flex items-center">
                        <Clock className="h-2.5 w-2.5 mr-1" />
                        {timeService.formatTime(emp.login_time)}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                        {formatTime(emp.total_working_hours)}
                      </p>
                      {emp.status !== 'Offline' && emp.work_type && (
                        <WorkTypePill workType={emp.work_type} />
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* MAIN VIEW: Live Streams */}
        <div className="lg:col-span-2 flex flex-col space-y-5">
          {selectedEmp ? (
            <div className="flex-1 flex flex-col">
              {/* Selected Employee Header */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white font-bold text-lg shadow-lg shadow-indigo-500/20">
                    {selectedEmp.employee_name?.charAt(0)?.toUpperCase() || 'E'}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white leading-tight">
                      {selectedEmp.employee_name || 'Unknown User'}
                    </h3>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <p className="text-xs text-gray-500 dark:text-gray-400">{selectedEmp.email || 'No email'}</p>
                      {selectedEmp.is_late && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Late
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    selectedEmp.status === 'Working' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                    selectedEmp.status === 'On Break' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                    'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    {selectedEmp.status || 'Offline'}
                  </span>
                  {selectedEmp.work_type && <WorkTypePill workType={selectedEmp.work_type} />}
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    selectedEmp.camera_permission_status === 'Connected' 
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' 
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    <Video className="h-2.5 w-2.5 mr-0.5" />
                    {selectedEmp.camera_permission_status || 'N/A'}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    selectedEmp.screen_sharing_status === 'Sharing' 
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' 
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    <Monitor className="h-2.5 w-2.5 mr-0.5" />
                    {selectedEmp.screen_sharing_status || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Working time summary */}
              <div className="grid grid-cols-3 gap-3 my-4">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-900/50">
                  <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Working</p>
                  <p className="text-lg font-black font-mono text-gray-900 dark:text-white">
                    {formatTime(selectedEmp.total_working_hours)}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-900/50">
                  <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Break</p>
                  <p className="text-lg font-black font-mono text-gray-600 dark:text-gray-400">
                    {formatTime(selectedEmp.break_duration)}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-900/50">
                  <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Overtime</p>
                  <p className={`text-lg font-black font-mono ${
                    (selectedEmp.overtime_seconds || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-600'
                  }`}>
                    +{formatTime(selectedEmp.overtime_seconds || 0)}
                  </p>
                </div>
              </div>

              {/* Viewfinders Grid */}
              <div className="grid gap-5 md:grid-cols-2 flex-1">
                {/* Camera Feed */}
                <div className="rounded-2xl bg-gradient-to-b from-gray-900 to-gray-950 border border-gray-700 text-white overflow-hidden flex flex-col h-[420px] shadow-xl">
                  <div className="px-4 py-3 bg-gray-950/80 border-b border-gray-800/60 flex items-center justify-between shrink-0">
                    <span className="text-xs font-bold uppercase tracking-wider flex items-center">
                      <Video className="mr-2 h-4 w-4 text-emerald-400 animate-pulse" />
                      Camera Feed
                    </span>
                    {cameraFrame && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50" />}
                  </div>
                  <div className="flex-1 relative bg-black overflow-hidden">
                    {selectedEmp.status === 'Working' && cameraFrame ? (
                      <img
                        src={cameraFrame}
                        alt="Camera Stream"
                        className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 p-6 text-center">
                        <Video className="h-12 w-12 mb-3 stroke-1 text-gray-600" />
                        <p className="text-sm">
                          {selectedEmp.status === 'Working'
                            ? 'Awaiting first frame packet…'
                            : `Employee is ${selectedEmp.status?.toLowerCase() || 'offline'}. Feed unavailable.`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Screen Feed */}
                <div className="rounded-2xl bg-gradient-to-b from-gray-900 to-gray-950 border border-gray-700 text-white overflow-hidden flex flex-col h-[420px] shadow-xl">
                  <div className="px-4 py-3 bg-gray-950/80 border-b border-gray-800/60 flex items-center justify-between shrink-0">
                    <span className="text-xs font-bold uppercase tracking-wider flex items-center">
                      <Monitor className="mr-2 h-4 w-4 text-sky-400" />
                      Screen Feed
                    </span>
                    {screenFrame && <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse shadow-lg shadow-sky-500/50" />}
                  </div>
                  <div className="flex-1 relative bg-black overflow-hidden">
                    {selectedEmp.status === 'Working' && screenFrame ? (
                      <img
                        src={screenFrame}
                        alt="Screen Stream"
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 p-6 text-center">
                        <Monitor className="h-12 w-12 mb-3 stroke-1 text-gray-600" />
                        <p className="text-sm">
                          {selectedEmp.status === 'Working'
                            ? 'Awaiting first screen packet…'
                            : `Employee is ${selectedEmp.status?.toLowerCase() || 'offline'}. Feed unavailable.`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-8 text-center dark:border-gray-700 dark:bg-gray-900/20">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                <AlertCircle className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                {loading ? 'Loading...' : 'No Employee Selected'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                {loading ? 'Please wait while we load the roster...' : 'Select an employee from the directory panel to view their live streams and timing details.'}
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .custom-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scroll::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.3);
          border-radius: 10px;
        }
        .custom-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(148, 163, 184, 0.5);
        }
        .dark .custom-scroll::-webkit-scrollbar-thumb {
          background: rgba(71, 85, 105, 0.3);
        }
        .dark .custom-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(71, 85, 105, 0.5);
        }
      `}</style>
    </div>
  )
}

export default LiveMonitor
