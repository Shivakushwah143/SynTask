import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Users, Video, Monitor, AlertCircle, RefreshCw,
  Search, SlidersHorizontal, User
} from 'lucide-react'
import { PageHeader, Button, Badge } from '../../components/ui'
import { attendanceAPI } from '../../api/attendance'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'

const formatTime = (totalSeconds) => {
  if (!totalSeconds) return '00:00:00'
  const hrs = Math.floor(totalSeconds / 3600).toString().padStart(2, '0')
  const mins = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0')
  const secs = (totalSeconds % 60).toString().padStart(2, '0')
  return `${hrs}:${mins}:${secs}`
}

const LiveMonitor = () => {
  const { token } = useAuthStore()
  const [employees, setEmployees] = useState([])
  const [selectedEmp, setSelectedEmp] = useState(null)
  const [loading, setLoading] = useState(true)
  
  // Real-time stream frames
  const [cameraFrame, setCameraFrame] = useState(null)
  const [screenFrame, setScreenFrame] = useState(null)
  
  const socketRef = useRef(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  // Load initial list from REST endpoint
  const loadEmployees = useCallback(async () => {
    try {
      setLoading(true)
      const res = await attendanceAPI.getLiveMonitoring()
      if (res && res.data) {
        setEmployees(res.data)
      }
    } catch (e) {
      toast.error('Failed to load live employee roster')
    } finally {
      setLoading(false)
    }
  }, [])

  // Start incrementing stopwatch locally for all active employees every second
  useEffect(() => {
    const interval = setInterval(() => {
      setEmployees(prev =>
        prev.map(emp => {
          if (emp.status === 'Working') {
            return { ...emp, total_working_hours: (emp.total_working_hours || 0) + 1 }
          } else if (emp.status === 'On Break') {
            return { ...emp, break_duration: (emp.break_duration || 0) + 1 }
          }
          return emp
        })
      )
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // WebSocket Connection
  useEffect(() => {
    if (!token) return

    const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const cleanUrl = apiBaseUrl.replace(/^https?:\/\//, '')
    const wsUrl = `${wsProto}//${cleanUrl}/attendance/ws?token=${token}`

    const ws = new WebSocket(wsUrl)
    socketRef.current = ws

    ws.onopen = () => {
      // If an employee was already selected, subscribe immediately on reconnect
      if (selectedEmp) {
        ws.send(JSON.stringify({ type: 'subscribe_employee', employee_id: selectedEmp.employee_id }))
      }
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)

      // Employee status transitions
      if (msg.type === 'status_changed') {
        setEmployees(prev =>
          prev.map(emp => {
            if (emp.employee_id === msg.employee_id) {
              return {
                ...emp,
                status: msg.status,
                camera_permission_status: msg.camera_status || emp.camera_permission_status,
                screen_sharing_status: msg.screen_share_status || emp.screen_sharing_status
              }
            }
            return emp
          })
        )

        // Clear frames if the selected employee stops working or goes on break
        if (selectedEmp && selectedEmp.employee_id === msg.employee_id) {
          if (msg.status !== 'Working') {
            setCameraFrame(null)
            setScreenFrame(null)
          }
        }
      }
      
      // Live snapshot frame payloads
      else if (msg.type === 'camera_update' && selectedEmp && msg.employee_id === selectedEmp.employee_id) {
        setCameraFrame(msg.data)
      }

      else if (msg.type === 'screen_update' && selectedEmp && msg.employee_id === selectedEmp.employee_id) {
        setScreenFrame(msg.data)
      }
    }

    ws.onclose = () => {
      socketRef.current = null
    }

    return () => {
      if (ws) ws.close()
    }
  }, [token, selectedEmp])

  // Handle Employee Click
  const handleSelectEmployee = (emp) => {
    if (selectedEmp && selectedEmp.employee_id === emp.employee_id) return

    // Unsubscribe from previous stream
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && selectedEmp) {
      socketRef.current.send(JSON.stringify({ type: 'unsubscribe_employee', employee_id: selectedEmp.employee_id }))
    }

    // Clear frames
    setCameraFrame(null)
    setScreenFrame(null)
    setSelectedEmp(emp)

    // Subscribe to new stream
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'subscribe_employee', employee_id: emp.employee_id }))
    }
  }

  useEffect(() => {
    loadEmployees()
  }, [loadEmployees])

  // Filter & Search Logic
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          emp.department.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === 'All' || emp.status === statusFilter
    
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6 h-full flex flex-col">
      <PageHeader
        title="Live Monitoring Dashboard"
        description="Monitor active workspaces, status changes, and live camera or screen captures."
        actions={
          <Button variant="secondary" size="sm" onClick={loadEmployees}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3 flex-1 min-h-[500px]">
        {/* SIDEBAR: Employee Directory */}
        <div className="lg:col-span-1 card p-4 bg-white dark:bg-gray-900 border border-surface-border/80 dark:border-gray-800 shadow-sm flex flex-col overflow-hidden h-[620px]">
          {/* Search and Filters */}
          <div className="space-y-3 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search employees..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-800 dark:text-gray-200"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <SlidersHorizontal className="h-4 w-4 text-gray-400" />
              <select
                className="text-xs bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-1.5 text-gray-600 dark:text-gray-400 focus:outline-none"
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

          {/* Directory List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {loading ? (
              <div className="py-8 text-center text-gray-400">Loading roster...</div>
            ) : filteredEmployees.length === 0 ? (
              <div className="py-8 text-center text-gray-400">No employees match filters.</div>
            ) : (
              filteredEmployees.map(emp => {
                const isSelected = selectedEmp?.employee_id === emp.employee_id
                return (
                  <button
                    key={emp.employee_id}
                    onClick={() => handleSelectEmployee(emp)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-950/20'
                        : 'border-gray-100 hover:border-gray-200 dark:border-gray-850 dark:hover:bg-gray-850 bg-white dark:bg-gray-900'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <p className="font-semibold text-sm text-gray-800 dark:text-gray-200 truncate">
                          {emp.employee_name}
                        </p>
                        <Badge label={emp.status} colorKey={emp.status} />
                      </div>
                      <p className="text-xs text-gray-450 truncate">{emp.department} • {emp.role.replace('_', ' ')}</p>
                      <p className="text-[11px] text-gray-400 mt-1.5 font-mono">
                        Work: {formatTime(emp.total_working_hours)} | Break: {formatTime(emp.break_duration)}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* MAIN VIEW: Live Streams */}
        <div className="lg:col-span-2 flex flex-col space-y-6">
          {selectedEmp ? (
            <div className="flex-1 flex flex-col justify-between">
              {/* Selected Header */}
              <div className="card p-4 bg-white dark:bg-gray-900 border border-surface-border/80 dark:border-gray-800 shadow-sm flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 dark:text-gray-100 leading-tight">
                      {selectedEmp.employee_name}
                    </h3>
                    <p className="text-xs text-gray-450 mt-0.5">{selectedEmp.email} • {selectedEmp.department}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Badge label={`Camera: ${selectedEmp.camera_permission_status}`} colorKey={selectedEmp.camera_permission_status === 'Connected' ? 'completed' : 'rejected'} />
                  <Badge label={`Screen: ${selectedEmp.screen_sharing_status}`} colorKey={selectedEmp.screen_sharing_status === 'Sharing' ? 'completed' : 'rejected'} />
                </div>
              </div>

              {/* Viewfinders Grid */}
              <div className="grid gap-6 md:grid-cols-2 flex-1">
                {/* Camera Feed */}
                <div className="card bg-slate-950 border border-slate-900 text-white rounded-2xl overflow-hidden flex flex-col justify-between h-[480px] shadow-lg relative">
                  <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between z-10">
                    <span className="text-[11px] font-bold uppercase tracking-wider flex items-center">
                      <Video className="mr-2 h-4 w-4 text-emerald-400 animate-pulse" />
                      Employee Video Feed
                    </span>
                    {cameraFrame && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
                  </div>

                  <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-black">
                    {selectedEmp.status === 'Working' && cameraFrame ? (
                      <img
                        src={cameraFrame}
                        alt="Employee Camera Stream"
                        className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
                      />
                    ) : (
                      <div className="text-center p-6 space-y-3 text-slate-500">
                        <Video className="h-12 w-12 mx-auto stroke-1" />
                        <p className="text-sm">
                          {selectedEmp.status === 'Working' 
                            ? 'Awaiting camera stream packet...' 
                            : `Employee is currently ${selectedEmp.status.toLowerCase()}. Feed unavailable.`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Screen Feed */}
                <div className="card bg-slate-950 border border-slate-900 text-white rounded-2xl overflow-hidden flex flex-col justify-between h-[480px] shadow-lg relative">
                  <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between z-10">
                    <span className="text-[11px] font-bold uppercase tracking-wider flex items-center">
                      <Monitor className="mr-2 h-4 w-4 text-sky-400" />
                      Employee Screen Feed
                    </span>
                    {screenFrame && <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />}
                  </div>

                  <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-black">
                    {selectedEmp.status === 'Working' && screenFrame ? (
                      <img
                        src={screenFrame}
                        alt="Employee Screen Stream"
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-center p-6 space-y-3 text-slate-500">
                        <Monitor className="h-12 w-12 mx-auto stroke-1" />
                        <p className="text-sm">
                          {selectedEmp.status === 'Working' 
                            ? 'Awaiting screen capture packet...' 
                            : `Employee is currently ${selectedEmp.status.toLowerCase()}. Feed unavailable.`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl flex flex-col items-center justify-center p-8 text-center text-gray-400 bg-white/50 dark:bg-gray-900/50">
              <AlertCircle className="h-12 w-12 mb-3 text-gray-300" />
              <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-1">No Employee Selected</h3>
              <p className="text-sm max-w-xs">Select an employee from the directory panel to view their live streams and timing details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LiveMonitor
