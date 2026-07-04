import { useEffect, useRef } from 'react'
import {
  Play, Square, Coffee, RefreshCw, Video, Monitor,
  Clock, TrendingUp, AlertTriangle, CheckCircle2, Timer
} from 'lucide-react'
import { PageHeader, Button, Badge } from '../../components/ui'
import { useMonitoringSocket } from '../../hooks/useMonitoringSocket'
import { format, parseISO } from 'date-fns'

const formatTime = (totalSeconds) => {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hrs = Math.floor(s / 3600).toString().padStart(2, '0')
  const mins = Math.floor((s % 3600) / 60).toString().padStart(2, '0')
  const secs = (s % 60).toString().padStart(2, '0')
  return `${hrs}:${mins}:${secs}`
}

const WorkTypeBadge = ({ workType, overtimeSeconds }) => {
  if (workType === 'Overtime') {
    const extraHrs = Math.floor(overtimeSeconds / 3600)
    const extraMins = Math.floor((overtimeSeconds % 3600) / 60)
    return (
      <div className="flex items-center space-x-2">
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
          <TrendingUp className="h-3 w-3 mr-1" />
          Overtime +{extraHrs}h {extraMins}m
        </span>
      </div>
    )
  }
  if (workType === 'Full Time') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Full Time
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-300 dark:border-rose-700">
      <Timer className="h-3 w-3 mr-1" />
      Under Time
    </span>
  )
}

const Attendance = () => {
  const {
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
  } = useMonitoringSocket()

  const cameraVideoRef = useRef(null)
  const screenVideoRef = useRef(null)

  // Attach the streams provided by the hook directly — no second getUserMedia call
  useEffect(() => {
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = cameraStream ?? null
    }
  }, [cameraStream])

  useEffect(() => {
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = screenStream ?? null
    }
  }, [screenStream])

  // Progress toward 8h for the ring indicator
  const progressPct = Math.min(100, (workingSeconds / (8 * 3600)) * 100)
  const ringColor =
    workType === 'Overtime' ? '#f59e0b' :
    workType === 'Full Time' ? '#10b981' : '#ef4444'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance & Monitoring"
        description="Clock in, manage breaks, and verify active device permissions."
        actions={
          <Button variant="secondary" size="sm" onClick={syncWithServer}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Sync Server
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT COLUMN: Controls & Stopwatches */}
        <div className="space-y-4 lg:col-span-1">

          {/* Main Control Card */}
          <div className="card p-6 bg-white dark:bg-gray-900 border border-surface-border/80 dark:border-gray-800 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">Current Status</span>
              <span className="relative flex h-3 w-3">
                {status === 'Working' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                {status === 'On Break' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                )}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${
                  status === 'Working' ? 'bg-emerald-500' :
                  status === 'On Break' ? 'bg-amber-500' : 'bg-gray-400'
                }`} />
              </span>
            </div>

            <h3 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 mb-0.5">{status}</h3>
            <p className="text-xs text-gray-500 mb-1">{format(new Date(), 'eeee, MMMM dd')}</p>

            {/* Login time + late indicator */}
            {loginTime && (
              <div className="flex items-center space-x-2 mb-3">
                <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="text-xs text-gray-500">
                  Clocked in at {format(parseISO(loginTime), 'hh:mm:ss a')}
                </span>
                {isLate && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                    <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Late
                  </span>
                )}
              </div>
            )}

            {/* Work Type Badge */}
            {status !== 'Offline' && (
              <div className="mb-4">
                <WorkTypeBadge workType={workType} overtimeSeconds={overtimeSeconds} />
              </div>
            )}

            {/* Circular Progress + Stopwatch */}
            <div className="flex flex-col items-center my-4">
              <div className="relative w-36 h-36">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="8" className="text-gray-100 dark:text-gray-800" />
                  <circle
                    cx="60" cy="60" r="52" fill="none"
                    stroke={ringColor}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 52}`}
                    strokeDashoffset={`${2 * Math.PI * 52 * (1 - progressPct / 100)}`}
                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black font-mono text-gray-800 dark:text-gray-200 leading-none">
                    {formatTime(workingSeconds)}
                  </span>
                  <span className="text-[10px] text-gray-400 mt-0.5">working</span>
                </div>
              </div>
            </div>

            {/* Break Duration */}
            <div className="bg-gray-50 dark:bg-gray-950 rounded-xl px-4 py-2.5 border border-gray-100 dark:border-gray-800 text-center mb-5">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Break</div>
              <div className="text-xl font-bold font-mono text-gray-500 dark:text-gray-400">{formatTime(breakSeconds)}</div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              {status === 'Offline' && (
                <Button
                  variant="primary" size="lg"
                  className="w-full flex justify-center py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  onClick={startWork}
                >
                  <Play className="mr-2 h-5 w-5 fill-current" />
                  Start Work
                </Button>
              )}

              {status === 'Working' && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary" size="lg"
                    className="flex justify-center text-amber-700 border-amber-300 dark:text-amber-300 dark:border-gray-700 bg-amber-50 dark:bg-amber-950/20"
                    onClick={pauseWork}
                  >
                    <Coffee className="mr-2 h-5 w-5" />
                    Break
                  </Button>
                  <Button variant="danger" size="lg" className="flex justify-center" onClick={stopWork}>
                    <Square className="mr-2 h-5 w-5 fill-current" />
                    Stop
                  </Button>
                </div>
              )}

              {status === 'On Break' && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="primary" size="lg"
                    className="flex justify-center bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={resumeWork}
                  >
                    <Play className="mr-2 h-5 w-5 fill-current" />
                    Resume
                  </Button>
                  <Button variant="danger" size="lg" className="flex justify-center" onClick={stopWork}>
                    <Square className="mr-2 h-5 w-5 fill-current" />
                    Stop
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Device Access Card */}
          <div className="card p-5 bg-white dark:bg-gray-900 border border-surface-border/80 dark:border-gray-800 shadow-sm">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Device Access Status</h4>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800">
                <div className="flex items-center">
                  <Video className="h-4.5 w-4.5 text-gray-400 mr-2.5" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Camera</span>
                </div>
                <Badge
                  label={cameraStatus}
                  colorKey={cameraStatus === 'Connected' ? 'completed' : cameraStatus === 'Disabled' ? 'hold' : 'rejected'}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800">
                <div className="flex items-center">
                  <Monitor className="h-4.5 w-4.5 text-gray-400 mr-2.5" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Screen Share</span>
                </div>
                <Badge
                  label={screenStatus}
                  colorKey={screenStatus === 'Sharing' ? 'completed' : screenStatus === 'Stopped' ? 'hold' : 'rejected'}
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Live Captures */}
        <div className="lg:col-span-2 space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            {/* Camera Viewfinder */}
            <div className="card bg-slate-900 border border-slate-800 text-white rounded-2xl overflow-hidden flex flex-col h-[360px] shadow-lg">
              <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800/60 flex items-center justify-between shrink-0">
                <span className="text-xs font-semibold uppercase tracking-wider flex items-center">
                  <Video className="mr-2 h-4 w-4 text-emerald-400 animate-pulse" />
                  Live Camera Preview
                </span>
                <span className={`h-2.5 w-2.5 rounded-full transition-colors ${
                  cameraStatus === 'Connected' ? 'bg-emerald-500' :
                  cameraStatus === 'Disabled' ? 'bg-amber-500' : 'bg-rose-500'
                }`} />
              </div>

              <div className="flex-1 flex items-center justify-center bg-black relative overflow-hidden">
                {/* Always render the video element; srcObject is set/cleared via ref */}
                <video
                  ref={cameraVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 ${
                    cameraStream ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                {!cameraStream && (
                  <div className="text-center p-6 space-y-3 text-slate-500 z-10">
                    <Video className="h-12 w-12 mx-auto stroke-1" />
                    <p className="text-sm">
                      {status === 'Working' ? 'Initializing camera...' : 'Click Start Work to activate camera feed.'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Screen Share Viewfinder */}
            <div className="card bg-slate-900 border border-slate-800 text-white rounded-2xl overflow-hidden flex flex-col h-[360px] shadow-lg">
              <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800/60 flex items-center justify-between shrink-0">
                <span className="text-xs font-semibold uppercase tracking-wider flex items-center">
                  <Monitor className="mr-2 h-4 w-4 text-sky-400" />
                  Live Screen Preview
                </span>
                <span className={`h-2.5 w-2.5 rounded-full transition-colors ${
                  screenStatus === 'Sharing' ? 'bg-sky-500' :
                  screenStatus === 'Stopped' ? 'bg-amber-500' : 'bg-rose-500'
                }`} />
              </div>

              <div className="flex-1 flex items-center justify-center bg-black relative overflow-hidden">
                <video
                  ref={screenVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`absolute inset-0 w-full h-full object-contain ${
                    screenStream ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                {!screenStream && (
                  <div className="text-center p-6 space-y-3 text-slate-500 z-10">
                    <Monitor className="h-12 w-12 mx-auto stroke-1" />
                    <p className="text-sm">
                      {status === 'Working' ? 'Awaiting screen stream...' : 'Click Start Work to share your screen.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Overtime Highlight Panel (shown when overtime) */}
          {workType === 'Overtime' && (
            <div className="card p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800 rounded-2xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <TrendingUp className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="text-sm font-bold text-amber-800 dark:text-amber-300">You're in Overtime!</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">Extra time beyond 8 hours standard shift.</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black font-mono text-amber-700 dark:text-amber-300">
                  +{formatTime(overtimeSeconds)}
                </p>
                <p className="text-[10px] text-amber-500">overtime</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Attendance
