import { useEffect, useRef } from 'react'
import {
  Play, Square, Coffee, RefreshCw, Video, Monitor,
  Clock, TrendingUp, AlertTriangle, CheckCircle2, Timer,
  User, Calendar, Zap, Award, Activity, BarChart3
} from 'lucide-react'
import { PageHeader, Button, Badge } from '../../components/ui'
import { useMonitoringSocket } from '../../hooks/useMonitoringSocket'
import { timeService } from '@/services/timeService'

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
        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 dark:from-amber-900/40 dark:to-orange-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-sm">
          <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
          Overtime +{extraHrs}h {extraMins}m
        </span>
      </div>
    )
  }
  if (workType === 'Full Time') {
    return (
      <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-800 dark:from-emerald-900/40 dark:to-teal-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shadow-sm">
        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
        Full Time
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-rose-100 to-pink-100 text-rose-700 dark:from-rose-900/40 dark:to-pink-900/40 dark:text-rose-300 border border-rose-300 dark:border-rose-700 shadow-sm">
      <Timer className="h-3.5 w-3.5 mr-1.5" />
      Under Time
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
    restoreStreams,
  } = useMonitoringSocket()

  const cameraVideoRef = useRef(null)
  const screenVideoRef = useRef(null)

  // Attach the streams provided by the hook directly
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

  // Calculate stats
  const totalWorkingHours = Math.floor(workingSeconds / 3600)
  const totalBreakHours = Math.floor(breakSeconds / 3600)

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
              <User className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">Attendance & Monitoring</h1>
              <p className="mt-1 text-indigo-100">Clock in, manage breaks, and verify active device permissions.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={syncWithServer}
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
            >
              <RefreshCw className="h-4 w-4" />
              Sync Server
            </button>
            {status === 'Working' && (!cameraStream || !screenStream) && (
              <button
                onClick={restoreStreams}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <RefreshCw className="h-4 w-4" />
                Restore Streams
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Working Hours"
          value={formatTime(workingSeconds)}
          icon={Clock}
          color="indigo"
          subtitle={`${totalWorkingHours}h total`}
        />
        <StatCard
          label="Break Time"
          value={formatTime(breakSeconds)}
          icon={Coffee}
          color="amber"
          subtitle={`${totalBreakHours}h break`}
        />
        <StatCard
          label="Status"
          value={status}
          icon={Activity}
          color={status === 'Working' ? 'emerald' : status === 'On Break' ? 'amber' : 'rose'}
          subtitle={status === 'Working' ? 'Active' : status === 'On Break' ? 'Paused' : 'Offline'}
        />
        <StatCard
          label="Overtime"
          value={formatTime(overtimeSeconds)}
          icon={TrendingUp}
          color="rose"
          subtitle={overtimeSeconds > 0 ? 'Extra hours' : 'No overtime'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT COLUMN: Controls & Stopwatches */}
        <div className="space-y-4 lg:col-span-1">

          {/* Main Control Card */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Current Status</span>
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

            <h3 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-0.5">{status}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{timeService.formatLongWeekdayDate(timeService.now())}</p>

            {/* Login time + late indicator */}
            {loginTime && (
              <div className="flex items-center space-x-2 mb-3">
                <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Clocked in at {timeService.formatDateTimeWithSeconds(loginTime)}
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
                  <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="8" className="text-gray-100 dark:text-gray-700" />
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
                  <span className="text-2xl font-black font-mono text-gray-800 dark:text-white leading-none">
                    {formatTime(workingSeconds)}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">working</span>
                </div>
              </div>
            </div>

            {/* Break Duration */}
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl px-4 py-2.5 border border-gray-100 dark:border-gray-700 text-center mb-5">
              <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Break</div>
              <div className="text-xl font-bold font-mono text-gray-500 dark:text-gray-400">{formatTime(breakSeconds)}</div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              {status === 'Offline' && (
                <button
                  className="w-full rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700"
                  onClick={startWork}
                >
                  <Play className="mr-2 h-5 w-5 inline fill-current" />
                  Start Work
                </button>
              )}

              {status === 'Working' && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="flex items-center justify-center rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-300 dark:hover:bg-amber-950/40"
                    onClick={pauseWork}
                  >
                    <Coffee className="mr-2 h-5 w-5" />
                    Break
                  </button>
                  <button
                    className="flex items-center justify-center rounded-lg bg-rose-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:bg-rose-600"
                    onClick={stopWork}
                  >
                    <Square className="mr-2 h-5 w-5 fill-current" />
                    Stop
                  </button>
                </div>
              )}

              {status === 'On Break' && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="flex items-center justify-center rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700"
                    onClick={resumeWork}
                  >
                    <Play className="mr-2 h-5 w-5 fill-current" />
                    Resume
                  </button>
                  <button
                    className="flex items-center justify-center rounded-lg bg-rose-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:bg-rose-600"
                    onClick={stopWork}
                  >
                    <Square className="mr-2 h-5 w-5 fill-current" />
                    Stop
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Device Access Card */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Device Access Status</h4>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700">
                <div className="flex items-center">
                  <Video className="h-4.5 w-4.5 text-gray-400 mr-2.5" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Camera</span>
                </div>
                <Badge
                  label={cameraStatus}
                  colorKey={cameraStatus === 'Connected' ? 'completed' : cameraStatus === 'Disabled' ? 'hold' : 'rejected'}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700">
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
            <div className="rounded-2xl bg-gradient-to-b from-gray-900 to-gray-950 border border-gray-700 text-white overflow-hidden flex flex-col h-[360px] shadow-xl">
              <div className="px-4 py-3 bg-gray-950/80 border-b border-gray-800/60 flex items-center justify-between shrink-0">
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
                  <div className="text-center p-6 space-y-3 text-gray-500 z-10">
                    <Video className="h-12 w-12 mx-auto stroke-1" />
                    <p className="text-sm">
                      {status === 'Working' ? 'Initializing camera...' : 'Click Start Work to activate camera feed.'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Screen Share Viewfinder */}
            <div className="rounded-2xl bg-gradient-to-b from-gray-900 to-gray-950 border border-gray-700 text-white overflow-hidden flex flex-col h-[360px] shadow-xl">
              <div className="px-4 py-3 bg-gray-950/80 border-b border-gray-800/60 flex items-center justify-between shrink-0">
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
                  <div className="text-center p-6 space-y-3 text-gray-500 z-10">
                    <Monitor className="h-12 w-12 mx-auto stroke-1" />
                    <p className="text-sm">
                      {status === 'Working' ? 'Awaiting screen stream...' : 'Click Start Work to share your screen.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Overtime Highlight Panel */}
          {workType === 'Overtime' && (
            <div className="rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 p-4 border border-amber-300 dark:from-amber-950/20 dark:to-orange-950/20 dark:border-amber-800 flex items-center justify-between shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
                  <TrendingUp className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
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
