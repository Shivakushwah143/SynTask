import { MonitoringProvider } from './MonitoringProvider'

export class BrowserMonitoringProvider extends MonitoringProvider {
  constructor() {
    super()
    this.cameraStream = null
    this.screenStream = null
    this.frameInterval = null
    this.onFrameCallback = null
    this.onStopCallback = null
    this.isPaused = false
    
    // Status states
    this.cameraStatus = 'Denied'
    this.screenStatus = 'Denied'
  }

  async requestPermissions() {
    try {
      // 1. Request Camera Permission
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, frameRate: 10 },
        audio: false // audio is not required in Phase 1
      })
      this.cameraStatus = 'Connected'

      // 2. Request Screen Sharing Permission
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 640, height: 480, frameRate: 5 },
        audio: false
      })
      this.screenStatus = 'Sharing'

      // Wire up track-ended listeners so we know when sharing is stopped via browser control bar
      this.screenStream.getVideoTracks().forEach(track => {
        track.onended = () => {
          this.screenStatus = 'Stopped'
          if (this.onStopCallback) this.onStopCallback('screen_sharing_ended')
        }
      })

      this.cameraStream.getVideoTracks().forEach(track => {
        track.onended = () => {
          this.cameraStatus = 'Disabled'
          if (this.onStopCallback) this.onStopCallback('camera_ended')
        }
      })

      return true
    } catch (error) {
      console.error('Permission request failed:', error)
      this.stopCapture()
      return false
    }
  }

  async startCapture({ onFrame, onStop }) {
    this.onFrameCallback = onFrame
    this.onStopCallback = onStop
    this.isPaused = false

    // Create offscreen video elements to draw onto offscreen canvases
    const cameraVideo = document.createElement('video')
    cameraVideo.srcObject = this.cameraStream
    cameraVideo.muted = true
    cameraVideo.setAttribute('playsinline', 'true')
    cameraVideo.play().catch(() => {})

    const screenVideo = document.createElement('video')
    screenVideo.srcObject = this.screenStream
    screenVideo.muted = true
    screenVideo.setAttribute('playsinline', 'true')
    screenVideo.play().catch(() => {})

    // Offscreen canvases for resizing and capturing snapshots
    const cameraCanvas = document.createElement('canvas')
    const screenCanvas = document.createElement('canvas')

    cameraCanvas.width = 160
    cameraCanvas.height = 120

    screenCanvas.width = 320
    screenCanvas.height = 240

    const camCtx = cameraCanvas.getContext('2d')
    const screenCtx = screenCanvas.getContext('2d')

    // Periodic capture loop (every 3 seconds)
    this.frameInterval = setInterval(() => {
      if (this.isPaused) return

      try {
        // Capture Camera Frame
        if (this.cameraStream && this.cameraStream.active && cameraVideo.readyState === cameraVideo.HAVE_ENOUGH_DATA) {
          camCtx.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height)
          const camBase64 = cameraCanvas.toDataURL('image/jpeg', 0.4)
          if (this.onFrameCallback) {
            this.onFrameCallback({ type: 'camera_frame', data: camBase64 })
          }
        }
      } catch (e) {
        console.error('Camera canvas capture failed:', e)
      }

      try {
        // Capture Screen Frame
        if (this.screenStream && this.screenStream.active && screenVideo.readyState === screenVideo.HAVE_ENOUGH_DATA) {
          screenCtx.drawImage(screenVideo, 0, 0, screenCanvas.width, screenCanvas.height)
          const screenBase64 = screenCanvas.toDataURL('image/jpeg', 0.4)
          if (this.onFrameCallback) {
            this.onFrameCallback({ type: 'screen_frame', data: screenBase64 })
          }
        }
      } catch (e) {
        console.error('Screen canvas capture failed:', e)
      }
    }, 3000)

    return true
  }

  pauseCapture() {
    this.isPaused = true
  }

  resumeCapture() {
    this.isPaused = false
  }

  stopCapture() {
    if (this.frameInterval) {
      clearInterval(this.frameInterval)
      this.frameInterval = null
    }

    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop())
      this.cameraStream = null
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop())
      this.screenStream = null
    }

    this.cameraStatus = 'Denied'
    this.screenStatus = 'Denied'
    this.isPaused = false
  }

  getCameraStatus() {
    return this.cameraStatus
  }

  getScreenStatus() {
    return this.screenStatus
  }
}
