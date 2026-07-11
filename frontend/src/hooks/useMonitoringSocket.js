import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { attendanceAPI } from '../api/attendance'
import { monitoringManager } from '../services/monitoring/MonitoringManager'
import toast from 'react-hot-toast'

const STANDARD_WORK_SECONDS = 8 * 3600 // 28800

function computeWorkType(totalSeconds) {
  if (totalSeconds >= STANDARD_WORK_SECONDS + 60) {
    return {
      workType: 'Overtime',
      overtimeSeconds: totalSeconds - STANDARD_WORK_SECONDS,
      regularSeconds: STANDARD_WORK_SECONDS,
    }
  } else if (totalSeconds >= STANDARD_WORK_SECONDS - 60) {
    return { workType: 'Full Time', overtimeSeconds: 0, regularSeconds: totalSeconds }
  }
  return { workType: 'Under Time', overtimeSeconds: 0, regularSeconds: totalSeconds }
}

export const useMonitoringSocket = () => {
  const { token } = useAuthStore()

  const [isConnected, setIsConnected] = useState(false)
  const [status, setStatus] = useState('Offline')
  const [workingSeconds, setWorkingSeconds] = useState(0)
  const [breakSeconds, setBreakSeconds] = useState(0)
  const [cameraStatus, setCameraStatus] = useState('Denied')
  const [screenStatus, setScreenStatus] = useState('Denied')
  const [workType, setWorkType] = useState('Under Time')
  const [overtimeSeconds, setOvertimeSeconds] = useState(0)
  const [loginTime, setLoginTime] = useState(null)
  const [isLate, setIsLate] = useState(false)

  // Stream refs — exposed so Attendance.jsx can attach to <video> without duplicate getUserMedia
  const [cameraStream, setCameraStream] = useState(null)
  const [screenStream, setScreenStream] = useState(null)

  const socketRef = useRef(null)
  const timerRef = useRef(null)
  const heartbeatIntervalRef = useRef(null)
  const actionPendingRef = useRef(false)
  // Keep stable refs for status to avoid stale closure issues in callbacks
  const statusRef = useRef('Offline')
  const workingSecondsRef = useRef(0)

  // Keep refs in sync with state
  useEffect(() => { statusRef.current = status }, [status])
  useEffect(() => { workingSecondsRef.current = workingSeconds }, [workingSeconds])

  // ─── Tick ─────────────────────────────────────────────────────────────────
  const startTimerTick = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      const currentStatus = statusRef.current
      if (currentStatus === 'Working') {
        setWorkingSeconds(prev => {
          const next = prev + 1
          const wt = computeWorkType(next)
          setWorkType(wt.workType)
          setOvertimeSeconds(wt.overtimeSeconds)
          return next
        })
      } else if (currentStatus === 'On Break') {
        setBreakSeconds(prev => prev + 1)
      }
    }, 1000)
  }, [])

  // ─── Server Sync ──────────────────────────────────────────────────────────
  const restoreStreams = useCallback(async () => {
    try {
      const granted = await monitoringManager.requestPermissions()
      if (granted) {
        await monitoringManager.startCapture({
          onFrame: (framePayload) => {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify(framePayload))
            }
          },
          onStop: (reason) => {
            const label = reason === 'screen_sharing_ended' ? 'Screen sharing stopped' : 'Camera stopped'
            toast.error(`${label}. Session will continue without this feed.`)
            if (reason === 'screen_sharing_ended') setScreenStatus('Stopped')
            if (reason === 'camera_ended') setCameraStatus('Disabled')
          }
        })
        setCameraStream(monitoringManager.getCameraStream())
        setScreenStream(monitoringManager.getScreenStream())
        setCameraStatus(monitoringManager.getCameraStatus())
        setScreenStatus(monitoringManager.getScreenStatus())
        toast.success('Monitoring streams restored.')
      } else {
        toast.error('Permissions required to restore monitoring streams.')
      }
    } catch (err) {
      console.error('Failed to restore streams:', err)
    }
  }, [])

  const syncWithServer = useCallback(async () => {
    try {
      const res = await attendanceAPI.getTodayAttendance()
      const data = res?.data  // API returns { success, data: {...} }
      if (data && data.status !== 'Offline') {
        const totalSec = Math.floor(data.total_working_hours ?? 0)
        const breakSec = Math.floor(data.break_duration ?? 0)
        setStatus(data.status)
        setWorkingSeconds(totalSec)
        setBreakSeconds(breakSec)
        setCameraStatus(data.camera_permission_status ?? 'Denied')
        setScreenStatus(data.screen_sharing_status ?? 'Denied')
        setLoginTime(data.login_time ?? null)
        setIsLate(data.is_late ?? false)
        const wt = computeWorkType(totalSec)
        setWorkType(wt.workType)
        setOvertimeSeconds(wt.overtimeSeconds)
        statusRef.current = data.status
        workingSecondsRef.current = totalSec

        // Attempt to auto-restore streams if status is Working but streams are inactive
        if (data.status === 'Working' && !monitoringManager.getCameraStream() && !monitoringManager.getScreenStream()) {
          restoreStreams().catch(() => {})
        }
      } else {
        setStatus('Offline')
        setWorkingSeconds(0)
        setBreakSeconds(0)
        setCameraStatus('Denied')
        setScreenStatus('Denied')
        setWorkType('Under Time')
        setOvertimeSeconds(0)
        setLoginTime(null)
        setIsLate(false)
      }
    } catch (e) {
      console.error('Failed to sync attendance with server:', e)
    }
  }, [restoreStreams])

  // ─── WebSocket Connection ─────────────────────────────────────────────────
  const connectSocket = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return

    const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const cleanUrl = apiBaseUrl.replace(/^https?:\/\//, '')
    const wsUrl = `${wsProto}//${cleanUrl}/attendance/ws?token=${token}`

    const ws = new WebSocket(wsUrl)
    socketRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      heartbeatIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'heartbeat' }))
        }
      }, 30000)
    }

    ws.onmessage = async (event) => {
      let msg
      try { msg = JSON.parse(event.data) } catch { return }

      if (msg.type === 'start_work_ack') {
        // Seed timers from server data (fixes stale timer on reconnect)
        const seedSeconds = Math.floor(msg.total_working_seconds ?? 0)
        const seedBreak = Math.floor(msg.break_seconds ?? 0)
        setWorkingSeconds(seedSeconds)
        setBreakSeconds(seedBreak)
        setStatus('Working')
        setLoginTime(msg.login_time ?? null)
        setIsLate(msg.is_late ?? false)
        const wt = computeWorkType(seedSeconds)
        setWorkType(wt.workType)
        setOvertimeSeconds(wt.overtimeSeconds)
        statusRef.current = 'Working'
        workingSecondsRef.current = seedSeconds

        toast.success('Work session started. Monitoring is active.')

        // Start streaming frames — properly awaited, no stale closure for stopWork
        try {
          await monitoringManager.startCapture({
            onFrame: (framePayload) => {
              if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify(framePayload))
              }
            },
            onStop: (reason) => {
              const label = reason === 'screen_sharing_ended' ? 'Screen sharing stopped' : 'Camera stopped'
              toast.error(`${label}. Session will continue without this feed.`)
              const mediaStatusPayload = { type: 'media_status' }
              if (reason === 'screen_sharing_ended') {
                setScreenStatus('Stopped')
                setScreenStream(null)
                mediaStatusPayload.screen_share_status = 'Stopped'
              }
              if (reason === 'camera_ended') {
                setCameraStatus('Disabled')
                setCameraStream(null)
                mediaStatusPayload.camera_status = 'Disabled'
              }
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(mediaStatusPayload))
              }
            }
          })
          // Expose live streams to the UI
          setCameraStream(monitoringManager.getCameraStream())
          setScreenStream(monitoringManager.getScreenStream())
          setCameraStatus(monitoringManager.getCameraStatus())
          setScreenStatus(monitoringManager.getScreenStatus())
        } catch (err) {
          console.error('startCapture failed:', err)
        } finally {
          actionPendingRef.current = false
        }
      }

      else if (msg.type === 'pause_work_ack') {
        actionPendingRef.current = false
        const totalSec = Math.floor(msg.total_working_seconds ?? workingSecondsRef.current)
        setWorkingSeconds(totalSec)
        setStatus('On Break')
        statusRef.current = 'On Break'
        const wt = computeWorkType(totalSec)
        setWorkType(wt.workType)
        setOvertimeSeconds(wt.overtimeSeconds)
        monitoringManager.pauseCapture()
        toast.success('Session paused. You are now on break.')
      }

      else if (msg.type === 'resume_work_ack') {
        actionPendingRef.current = false
        setBreakSeconds(Math.floor(msg.break_seconds ?? 0))
        setStatus('Working')
        statusRef.current = 'Working'
        monitoringManager.resumeCapture()
        toast.success('Session resumed. Monitoring resumed.')
      }

      else if (msg.type === 'stop_work_ack') {
        actionPendingRef.current = false
        const totalSec = Math.floor(msg.total_working_seconds ?? workingSecondsRef.current)
        const wt = computeWorkType(totalSec)
        setWorkingSeconds(totalSec)
        setStatus('Offline')
        setWorkType(wt.workType)
        setOvertimeSeconds(wt.overtimeSeconds)
        statusRef.current = 'Offline'
        monitoringManager.stopCapture()
        setCameraStream(null)
        setScreenStream(null)
        setCameraStatus('Denied')
        setScreenStatus('Denied')
        toast.success('Work session stopped.')
      }

      else if (msg.type === 'heartbeat_ack') {
        // Silently acknowledge
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      socketRef.current = null
      actionPendingRef.current = false
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current)
    }

    ws.onerror = (err) => {
      console.error('Attendance WebSocket error:', err)
    }
  }, [token])

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (token) {
      connectSocket()
      syncWithServer()
      startTimerTick()
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current)
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }
      monitoringManager.stopCapture()
      setCameraStream(null)
      setScreenStream(null)
    }
  }, [token, connectSocket, syncWithServer, startTimerTick])

  // ─── Workflow Triggers ────────────────────────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (statusRef.current === 'Working' || statusRef.current === 'On Break') {
        try {
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: 'stop_work' }))
          }
        } catch {
          // Browser unload is best effort only.
        }
        monitoringManager.stopCapture()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  const startWork = async () => {
    if (actionPendingRef.current || statusRef.current !== 'Offline') return
    actionPendingRef.current = true
    const granted = await monitoringManager.requestPermissions()
    if (!granted) {
      actionPendingRef.current = false
      toast.error('Camera and Screen Share permissions are required to start work.')
      return
    }

    const sendStart = () => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'start_work',
          camera_permission: monitoringManager.getCameraStatus(),
          screen_share_permission: monitoringManager.getScreenStatus(),
        }))
        return true
      }
      return false
    }

    if (!sendStart()) {
      connectSocket()
      setTimeout(() => {
        if (!sendStart()) {
          actionPendingRef.current = false
          toast.error('Failed to connect to the tracking server. Please try again.')
        }
      }, 600)
    }
  }

  const pauseWork = () => {
    setStatus('On Break')
    statusRef.current = 'On Break'
    monitoringManager.pauseCapture()
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      actionPendingRef.current = true
      socketRef.current.send(JSON.stringify({ type: 'pause_work' }))
    }
  }

  const resumeWork = () => {
    setStatus('Working')
    statusRef.current = 'Working'
    monitoringManager.resumeCapture()
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      actionPendingRef.current = true
      socketRef.current.send(JSON.stringify({ type: 'resume_work' }))
    }
  }

  const stopWork = () => {
    setStatus('Offline')
    statusRef.current = 'Offline'
    monitoringManager.stopCapture()
    setCameraStream(null)
    setScreenStream(null)
    setCameraStatus('Denied')
    setScreenStatus('Denied')

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'stop_work' }))
    }
  }

  return {
    isConnected,
    status,
    workingSeconds,
    breakSeconds,
    cameraStatus,
    screenStatus,
    workType,
    overtimeSeconds,
    loginTime,
    isLate,
    cameraStream,
    screenStream,
    startWork,
    stopWork,
    pauseWork,
    resumeWork,
    syncWithServer,
    restoreStreams,
  }
}

export default useMonitoringSocket
