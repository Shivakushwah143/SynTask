import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { attendanceAPI } from '../api/attendance'
import { monitoringManager } from '../services/monitoring/MonitoringManager'
import toast from 'react-hot-toast'

export const useMonitoringSocket = () => {
  const { token, user } = useAuthStore()
  const [isConnected, setIsConnected] = useState(false)
  const [status, setStatus] = useState('Offline')
  const [workingSeconds, setWorkingSeconds] = useState(0)
  const [breakSeconds, setBreakSeconds] = useState(0)
  const [cameraStatus, setCameraStatus] = useState('Denied')
  const [screenStatus, setScreenStatus] = useState('Denied')
  
  const socketRef = useRef(null)
  const timerRef = useRef(null)
  const heartbeatIntervalRef = useRef(null)

  // Fetch initial state from DB and synchronize timer on mount
  const syncWithServer = useCallback(async () => {
    try {
      const res = await attendanceAPI.getTodayAttendance()
      if (res && res.status !== 'Offline') {
        setStatus(res.status)
        setWorkingSeconds(Math.floor(res.total_working_hours))
        setBreakSeconds(Math.floor(res.break_duration))
        setCameraStatus(res.camera_permission_status)
        setScreenStatus(res.screen_sharing_status)
      } else {
        setStatus('Offline')
        setWorkingSeconds(0)
        setBreakSeconds(0)
        setCameraStatus('Denied')
        setScreenStatus('Denied')
      }
    } catch (e) {
      console.error('Failed to sync attendance timer with server:', e)
    }
  }, [])

  // Start ticking depending on active status
  const startTimerTick = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    
    timerRef.current = setInterval(() => {
      setStatus(prevStatus => {
        if (prevStatus === 'Working') {
          setWorkingSeconds(prev => prev + 1)
        } else if (prevStatus === 'On Break') {
          setBreakSeconds(prev => prev + 1)
        }
        return prevStatus
      })
    }, 1000)
  }, [])

  // WebSocket Connection
  const connectSocket = useCallback(() => {
    if (socketRef.current) return

    const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const cleanUrl = apiBaseUrl.replace(/^https?:\/\//, '')
    const wsUrl = `${wsProto}//${cleanUrl}/attendance/ws?token=${token}`

    const ws = new WebSocket(wsUrl)
    socketRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      // Start heartbeat
      heartbeatIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'heartbeat' }))
        }
      }, 30000)
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      
      if (msg.type === 'start_work_ack') {
        setStatus('Working')
        toast.success('Work session started. Monitoring is active.')
        // Start streaming frames
        monitoringManager.startCapture({
          onFrame: (framePayload) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(framePayload))
            }
          },
          onStop: (reason) => {
            toast.error(`Permission revoked or capture stopped: ${reason.replace('_', ' ')}`)
            stopWork()
          }
        })
      }
      
      else if (msg.type === 'pause_work_ack') {
        setStatus('On Break')
        monitoringManager.pauseCapture()
        toast.success('Session paused. You are now on break.')
      }
      
      else if (msg.type === 'resume_work_ack') {
        setStatus('Working')
        monitoringManager.resumeCapture()
        toast.success('Session resumed. Monitoring resumed.')
      }
      
      else if (msg.type === 'stop_work_ack') {
        setStatus('Offline')
        monitoringManager.stopCapture()
        setCameraStatus('Denied')
        setScreenStatus('Denied')
        toast.success('Work session stopped.')
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      socketRef.current = null
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }
    }

    ws.onerror = (err) => {
      console.error('Attendance WebSocket error:', err)
    }
  }, [token])

  // Lifecycle Hook
  useEffect(() => {
    if (token && user?.role === 'employee') {
      connectSocket()
      syncWithServer()
      startTimerTick()
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current)
      if (socketRef.current) {
        socketRef.current.close()
      }
    }
  }, [token, user, connectSocket, syncWithServer, startTimerTick])

  // Workflow Triggers
  const startWork = async () => {
    // 1. Request permissions via MonitoringManager
    const granted = await monitoringManager.requestPermissions()
    if (!granted) {
      toast.error('Permissions denied. Both Camera and Screen Share are required to start work.')
      return
    }

    setCameraStatus(monitoringManager.getCameraStatus())
    setScreenStatus(monitoringManager.getScreenStatus())

    // 2. Open connection if closed
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      connectSocket()
      // Give connection a tiny window to resolve
      setTimeout(() => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: 'start_work',
            camera_permission: 'Granted',
            screen_share_permission: 'Granted'
          }))
        } else {
          toast.error('Failed to connect to the tracking server. Please try again.')
        }
      }, 500)
    } else {
      socketRef.current.send(JSON.stringify({
        type: 'start_work',
        camera_permission: 'Granted',
        screen_share_permission: 'Granted'
      }))
    }
  }

  const pauseWork = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'pause_work' }))
    }
  }

  const resumeWork = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'resume_work' }))
    }
  }

  const stopWork = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'stop_work' }))
    } else {
      // Offline fallback
      setStatus('Offline')
      monitoringManager.stopCapture()
      setCameraStatus('Denied')
      setScreenStatus('Denied')
    }
  }

  return {
    isConnected,
    status,
    workingSeconds,
    breakSeconds,
    cameraStatus,
    screenStatus,
    startWork,
    stopWork,
    pauseWork,
    resumeWork,
    syncWithServer
  }
}
export default useMonitoringSocket
