import { useEffect, useRef } from 'react'
import {
  Play, Square, Coffee, RefreshCw, Video, Monitor,
  CheckCircle, AlertTriangle, HelpCircle
} from 'lucide-react'
import { PageHeader, Button, Badge } from '../../components/ui'
import { useMonitoringSocket } from '../../hooks/useMonitoringSocket'
import { format } from 'date-fns'

const formatTime = (totalSeconds) => {
  const hrs = Math.floor(totalSeconds / 3600).toString().padStart(2, '0')
  const mins = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0')
  const secs = (totalSeconds % 60).toString().padStart(2, '0')
  return `${hrs}:${mins}:${secs}`
}

const Attendance = () => {
  const {
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
  } = useMonitoringSocket()

  const cameraVideoRef = useRef(null)
  const screenVideoRef = useRef(null)

  // Attach local media streams to video elements for previews
  useEffect(() => {
    let active = true

    const attachStreams = async () => {
      // Small timeout to allow video DOM elements to mount
      await new Promise(r => setTimeout(r, 100))
      if (!active) return

      try {
        // Find existing media tracks
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter(d => d.kind === 'videoinput')
        
        if (status === 'Working' && cameraVideoRef.current && !cameraVideoRef.current.srcObject) {
          // Attempt to get active streams from browser
          const streams = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
          if (cameraVideoRef.current) {
            cameraVideoRef.current.srcObject = streams
          }
        }
      } catch (e) {
        // Stream attachment might fail if user blocks or isn't active
      }

      try {
        if (status === 'Working' && screenVideoRef.current && !screenVideoRef.current.srcObject) {
          const screens = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
          if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = screens
          }
        }
      } catch (e) {}
    }

    if (status === 'Working') {
      attachStreams()
    } else {
      if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null
      if (screenVideoRef.current) screenVideoRef.current.srcObject = null
    }

    return () => {
      active = false
    }
  }, [status])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance & Monitoring"
        description="Clock in, manage your break durations, and verify active device permissions."
        actions={
          <Button variant="secondary" size="sm" onClick={syncWithServer}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Sync Server
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT COLUMN: Controls & Stopwatches */}
        <div className="space-y-6 lg:col-span-1">
          {/* Main Control Card */}
          <div className="card p-6 bg-white dark:bg-gray-900 border border-surface-border/80 dark:border-gray-800 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">Current Status</span>
                <span className="relative flex h-3 w-3">
                  {status === 'Working' && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  {status === 'On Break' && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${
                    status === 'Working' ? 'bg-emerald-500' :
                    status === 'On Break' ? 'bg-amber-500' : 'bg-gray-400'
                  }`}></span>
                </span>
              </div>
              
              <div className="mb-6">
                <h3 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 mb-1">{status}</h3>
                <p className="text-xs text-gray-500">Today: {format(new Date(), 'eeee, MMMM dd')}</p>
              </div>

              {/* Stopwatch Display */}
              <div className="space-y-4 mb-8">
                <div className="bg-gray-50 dark:bg-gray-950 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Working Timer</div>
                  <div className="text-4xl font-black font-mono text-gray-800 dark:text-gray-200">
                    {formatTime(workingSeconds)}
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-950 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Break Duration</div>
                  <div className="text-3xl font-bold font-mono text-gray-600 dark:text-gray-400">
                    {formatTime(breakSeconds)}
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic Operations buttons */}
            <div className="space-y-2 mt-auto">
              {status === 'Offline' && (
                <Button variant="primary" size="lg" className="w-full flex justify-center py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold" onClick={startWork}>
                  <Play className="mr-2 h-5 w-5 fill-current" />
                  Start Work
                </Button>
              )}

              {status === 'Working' && (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" size="lg" className="flex justify-center text-amber-700 border-amber-300 dark:text-amber-300 dark:border-gray-700 bg-amber-50 dark:bg-amber-950/20" onClick={pauseWork}>
                    <Coffee className="mr-2 h-5 w-5" />
                    Pause (Break)
                  </Button>
                  <Button variant="danger" size="lg" className="flex justify-center" onClick={stopWork}>
                    <Square className="mr-2 h-5 w-5 fill-current" />
                    Stop Work
                  </Button>
                </div>
              )}

              {status === 'On Break' && (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="primary" size="lg" className="flex justify-center bg-emerald-600 hover:bg-emerald-700 text-white" onClick={resumeWork}>
                    <Play className="mr-2 h-5 w-5 fill-current" />
                    Resume
                  </Button>
                  <Button variant="danger" size="lg" className="flex justify-center" onClick={stopWork}>
                    <Square className="mr-2 h-5 w-5 fill-current" />
                    Stop Work
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Permissions / Hardware Monitor Card */}
          <div className="card p-5 bg-white dark:bg-gray-900 border border-surface-border/80 dark:border-gray-800 shadow-sm">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4">Device Access Status</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800">
                <div className="flex items-center">
                  <Video className="h-5 w-5 text-gray-400 mr-3" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Camera Permission</span>
                </div>
                {cameraStatus === 'Connected' ? (
                  <Badge label="Connected" colorKey="completed" />
                ) : cameraStatus === 'Disabled' ? (
                  <Badge label="Disabled" colorKey="hold" />
                ) : (
                  <Badge label="Denied" colorKey="rejected" />
                )}
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800">
                <div className="flex items-center">
                  <Monitor className="h-5 w-5 text-gray-400 mr-3" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Screen Sharing</span>
                </div>
                {screenStatus === 'Sharing' ? (
                  <Badge label="Sharing" colorKey="completed" />
                ) : screenStatus === 'Stopped' ? (
                  <Badge label="Stopped" colorKey="hold" />
                ) : (
                  <Badge label="Denied" colorKey="rejected" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Live Captures (Camera and Screen Viewfinders) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid gap-6 md:grid-cols-2 h-full">
            {/* Camera Viewfinder */}
            <div className="card bg-slate-900 border border-slate-800 text-white rounded-2xl overflow-hidden flex flex-col justify-between h-[380px] shadow-lg relative">
              <div className="p-4 bg-slate-950/60 border-b border-slate-800/60 flex items-center justify-between z-10">
                <span className="text-xs font-semibold uppercase tracking-wider flex items-center">
                  <Video className="mr-2 h-4 w-4 text-emerald-400 animate-pulse" />
                  Live Camera Preview
                </span>
                <span className={`h-2.5 w-2.5 rounded-full ${cameraStatus === 'Connected' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              </div>

              <div className="flex-1 flex items-center justify-center bg-slate-950 relative overflow-hidden">
                {status === 'Working' && cameraStatus === 'Connected' ? (
                  <video
                    ref={cameraVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
                  />
                ) : (
                  <div className="text-center p-6 space-y-3 z-10 text-slate-500">
                    <Video className="h-12 w-12 mx-auto stroke-1" />
                    <p className="text-sm">
                      {status === 'Working' ? 'Initializing stream...' : 'Stream inactive. Click Start Work to activate camera feed.'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Screen Capture Viewfinder */}
            <div className="card bg-slate-900 border border-slate-800 text-white rounded-2xl overflow-hidden flex flex-col justify-between h-[380px] shadow-lg relative">
              <div className="p-4 bg-slate-950/60 border-b border-slate-800/60 flex items-center justify-between z-10">
                <span className="text-xs font-semibold uppercase tracking-wider flex items-center">
                  <Monitor className="mr-2 h-4 w-4 text-sky-400" />
                  Live Screen Preview
                </span>
                <span className={`h-2.5 w-2.5 rounded-full ${screenStatus === 'Sharing' ? 'bg-sky-500' : 'bg-rose-500'}`} />
              </div>

              <div className="flex-1 flex items-center justify-center bg-slate-950 relative overflow-hidden">
                {status === 'Working' && screenStatus === 'Sharing' ? (
                  <video
                    ref={screenVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center p-6 space-y-3 z-10 text-slate-500">
                    <Monitor className="h-12 w-12 mx-auto stroke-1" />
                    <p className="text-sm">
                      {status === 'Working' ? 'Awaiting screen stream...' : 'Stream inactive. Click Start Work to share screen.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Attendance
