import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Video, Monitor, AlertCircle, RefreshCw,
  Search, SlidersHorizontal, User, Clock, TrendingUp, AlertTriangle
} from 'lucide-react'
import { PageHeader, Button, Badge } from '../../components/ui'
import { attendanceAPI } from '../../api/attendance'
import { useAuthStore } from '../../store/authStore'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'

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
    'Overtime': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    'Full Time': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    'Under Time': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${map[workType] || map['Under Time']}`}>
      {workType === 'Overtime' && <TrendingUp className="h-2.5 w-2.5 mr-0.5" />}
      {workType}
    </span>
  )
}

const LiveMonitor = () => {
  const { token } = useAuthStore()
  const [employees, setEmployees] = useState([])
  const [selectedEmp, setSelectedEmp] = useState(null)
  const [loading, setLoading] = useState(true)

  const [cameraFrame, setCameraFrame] = useState(null)
  const [screenFrame, setScreenFrame] = useState(null)

  const socketRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const selectedEmpRef = useRef(null)  // stable ref so WS onmessage always sees current selection
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
      const res = await attendanceAPI.getLiveMonitoring()
      if (res?.data) setEmployees(res.data)
    } catch {
      toast.error('Failed to load live employee roster')
    } finally {
      setLoading(false)
    }
  }, [])

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

  // ─── WebSocket (stable — never torn down due to selectedEmp changes) ───────
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
      // Re-subscribe to whichever employee was selected when connection (re)opens
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

      // Exponential backoff reconnect (max 30s)
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
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }
    }
  }, [token, connectSocket, loadEmployees])

  // ─── Employee Selection ───────────────────────────────────────────────────
  const handleSelectEmployee = (emp) => {
    if (selectedEmpRef.current?.employee_id === emp.employee_id) return
    const ws = socketRef.current

    // Unsubscribe previous
    if (ws?.readyState === WebSocket.OPEN && selectedEmpRef.current) {
      ws.send(JSON.stringify({ type: 'unsubscribe_employee', employee_id: selectedEmpRef.current.employee_id }))
    }

    setCameraFrame(null)
    setScreenFrame(null)
    setSelectedEmp(emp)

    // Subscribe new
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe_employee', employee_id: emp.employee_id }))
    }
  }

  // Filtered list
  const filteredEmployees = employees.filter(emp => {
    const term = searchTerm.toLowerCase()
    const matchesSearch =
      emp.employee_name.toLowerCase().includes(term) ||
      emp.email.toLowerCase().includes(term) ||
      (emp.department || '').toLowerCase().includes(term)
    const matchesStatus = statusFilter === 'All' || emp.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6 h-full flex flex-col bg-surface-muted text-text-primary dark:bg-black dark:text-text-primary">
      <PageHeader
        title="Live Monitoring Dashboard"
        description="Monitor active workspaces, status changes, and live camera or screen captures."
        actions={
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded-full ${
              isWsConnected
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'bg-surface-muted text-text-muted dark:bg-black/70 dark:text-text-secondary'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${isWsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-text-muted'}`} />
              {isWsConnected ? 'Live' : 'Reconnecting…'}
            </span>
            <Button variant="secondary" size="sm" onClick={loadEmployees}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3 flex-1 min-h-[500px]">
        {/* SIDEBAR: Employee Directory */}
        <div className="lg:col-span-1 card p-4 bg-surface dark:bg-black/90 border border-border shadow-sm flex flex-col overflow-hidden h-[640px]">
          <div className="space-y-3 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search employees..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-surface-muted dark:bg-black/70 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary dark:text-text-primary"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-2">
              <SlidersHorizontal className="h-4 w-4 text-text-muted shrink-0" />
              <select
                className="text-xs bg-surface-muted dark:bg-black/70 border border-border rounded-lg p-1.5 text-text-secondary dark:text-text-secondary focus:outline-none"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="Working">Working</option>
                <option value="On Break">On Break</option>
                <option value="Offline">Offline</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {loading ? (
              <div className="py-8 text-center text-text-muted">Loading roster...</div>
            ) : filteredEmployees.length === 0 ? (
              <div className="py-8 text-center text-text-muted">No employees match filters.</div>
            ) : (
              filteredEmployees.map(emp => {
                const isSelected = selectedEmp?.employee_id === emp.employee_id
                return (
                  <button
                    key={emp.employee_id}
                    onClick={() => handleSelectEmployee(emp)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-950/20'
                        : 'border-border hover:border-border dark:border-border dark:hover:bg-white/5 bg-surface dark:bg-black/80'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-semibold text-sm text-text-primary dark:text-text-primary truncate mr-2">
                        {emp.employee_name}
                      </p>
                      <Badge label={emp.status} colorKey={emp.status} />
                    </div>
                    <div className="flex items-center space-x-2 mb-1.5">
                      <p className="text-xs text-text-muted truncate">{emp.department} • {emp.role.replace('_', ' ')}</p>
                      {emp.is_late && (
                        <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 shrink-0">
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Late
                        </span>
                      )}
                    </div>
                    {emp.login_time && (
                      <p className="text-[10px] text-text-muted mb-1 flex items-center">
                        <Clock className="h-2.5 w-2.5 mr-1" />
                        {format(parseISO(emp.login_time), 'hh:mm a')}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-text-muted font-mono">
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
              <div className="card p-4 bg-surface dark:bg-black/90 border border-border shadow-sm flex items-center justify-between mb-4 rounded-2xl">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-300">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-text-primary dark:text-text-primary leading-tight">
                      {selectedEmp.employee_name}
                    </h3>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <p className="text-xs text-text-muted">{selectedEmp.email}</p>
                      {selectedEmp.is_late && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Late
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2 flex-wrap justify-end gap-1">
                  <Badge label={selectedEmp.status} colorKey={selectedEmp.status} />
                  {selectedEmp.work_type && <WorkTypePill workType={selectedEmp.work_type} />}
                  <Badge
                    label={`Cam: ${selectedEmp.camera_permission_status}`}
                    colorKey={selectedEmp.camera_permission_status === 'Connected' ? 'completed' : 'rejected'}
                  />
                  <Badge
                    label={`Screen: ${selectedEmp.screen_sharing_status}`}
                    colorKey={selectedEmp.screen_sharing_status === 'Sharing' ? 'completed' : 'rejected'}
                  />
                </div>
              </div>

              {/* Working time summary */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="card p-3 bg-surface dark:bg-black/80 border border-border text-center rounded-xl">
                  <p className="text-[10px] font-semibold text-text-muted uppercase">Working</p>
                  <p className="text-lg font-black font-mono text-text-primary dark:text-text-primary">
                    {formatTime(selectedEmp.total_working_hours)}
                  </p>
                </div>
                <div className="card p-3 bg-surface dark:bg-black/80 border border-border text-center rounded-xl">
                  <p className="text-[10px] font-semibold text-text-muted uppercase">Break</p>
                  <p className="text-lg font-black font-mono text-text-secondary dark:text-text-secondary">
                    {formatTime(selectedEmp.break_duration)}
                  </p>
                </div>
                <div className="card p-3 bg-surface dark:bg-black/80 border border-border text-center rounded-xl">
                  <p className="text-[10px] font-semibold text-text-muted uppercase">Overtime</p>
                  <p className={`text-lg font-black font-mono ${
                    (selectedEmp.overtime_seconds || 0) > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-text-muted dark:text-gray-600'
                  }`}>
                    +{formatTime(selectedEmp.overtime_seconds || 0)}
                  </p>
                </div>
              </div>

              {/* Viewfinders Grid */}
              <div className="grid gap-5 md:grid-cols-2 flex-1">
                {/* Camera Feed */}
                <div className="card bg-black border border-border text-white rounded-2xl overflow-hidden flex flex-col h-[420px] shadow-lg">
                  <div className="p-3 bg-black/90 border-b border-border flex items-center justify-between shrink-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider flex items-center">
                      <Video className="mr-2 h-4 w-4 text-emerald-400 animate-pulse" />
                      Camera Feed
                    </span>
                    {cameraFrame && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
                  </div>
                  <div className="flex-1 relative bg-black overflow-hidden">
                    {selectedEmp.status === 'Working' && cameraFrame ? (
                      <img
                        src={cameraFrame}
                        alt="Camera Stream"
                        className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                        <Video className="h-12 w-12 mb-3 stroke-1 text-text-muted" />
                        <p className="text-sm">
                          {selectedEmp.status === 'Working'
                            ? 'Awaiting first frame packet…'
                            : `Employee is ${selectedEmp.status.toLowerCase()}. Feed unavailable.`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Screen Feed */}
                <div className="card bg-black border border-border text-white rounded-2xl overflow-hidden flex flex-col h-[420px] shadow-lg">
                  <div className="p-3 bg-black/90 border-b border-border flex items-center justify-between shrink-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider flex items-center">
                      <Monitor className="mr-2 h-4 w-4 text-sky-400" />
                      Screen Feed
                    </span>
                    {screenFrame && <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />}
                  </div>
                  <div className="flex-1 relative bg-black overflow-hidden">
                    {selectedEmp.status === 'Working' && screenFrame ? (
                      <img
                        src={screenFrame}
                        alt="Screen Stream"
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                        <Monitor className="h-12 w-12 mb-3 stroke-1 text-text-muted" />
                        <p className="text-sm">
                          {selectedEmp.status === 'Working'
                            ? 'Awaiting first screen packet…'
                            : `Employee is ${selectedEmp.status.toLowerCase()}. Feed unavailable.`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 border border-dashed border-border rounded-2xl flex flex-col items-center justify-center p-8 text-center text-text-muted bg-surface/50 dark:bg-black/50">
              <AlertCircle className="h-12 w-12 mb-3 text-text-muted" />
              <h3 className="font-semibold text-text-primary dark:text-text-primary mb-1">No Employee Selected</h3>
              <p className="text-sm max-w-xs">Select an employee from the directory panel to view their live streams and timing details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LiveMonitor
