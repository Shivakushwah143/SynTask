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
    this.isStopping = false

    // Offscreen video elements (reused across start/stop)
    this._cameraVideo = null
    this._screenVideo = null

    // Status states
    this.cameraStatus = 'Denied'
    this.screenStatus = 'Denied'
  }

  async requestPermissions() {
    try {
      this.stopCapture()

      // 1. Request Camera Permission
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, frameRate: 10 },
        audio: false
      })
      this.cameraStatus = 'Connected'

      // 2. Request Screen Sharing Permission
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1280, height: 720, frameRate: 5 },
        audio: false
      })
      this.screenStatus = 'Sharing'

      // Wire up track-ended listeners
      this.screenStream.getVideoTracks().forEach(track => {
        track.onended = () => {
          this.screenStatus = 'Stopped'
          this.screenStream = null
          if (!this.isStopping && this.onStopCallback) this.onStopCallback('screen_sharing_ended')
        }
      })

      this.cameraStream.getVideoTracks().forEach(track => {
        track.onended = () => {
          this.cameraStatus = 'Disabled'
          this.cameraStream = null
          if (!this.isStopping && this.onStopCallback) this.onStopCallback('camera_ended')
        }
      })

      return true
    } catch (error) {
      console.error('Permission request failed:', error)
      this.stopCapture()
      return false
    }
  }

  /**
   * Wait for a video element to have enough data to draw frames.
   * Resolves immediately if already ready, otherwise waits for loadedmetadata + canplay.
   */
  _waitForVideoReady(videoEl) {
    return new Promise(resolve => {
      if (videoEl.readyState >= videoEl.HAVE_ENOUGH_DATA) {
        resolve()
        return
      }
      const onReady = () => {
        videoEl.removeEventListener('canplay', onReady)
        videoEl.removeEventListener('loadedmetadata', onReady)
        resolve()
      }
      videoEl.addEventListener('canplay', onReady)
      videoEl.addEventListener('loadedmetadata', onReady)
      // Fallback timeout — do not block forever
      setTimeout(resolve, 3000)
    })
  }

  async startCapture({ onFrame, onStop }) {
    if (this.frameInterval) {
      clearInterval(this.frameInterval)
      this.frameInterval = null
    }

    this.onFrameCallback = onFrame
    this.onStopCallback = onStop
    this.isPaused = false

    // Create and wire up offscreen video elements
    const cameraVideo = document.createElement('video')
    cameraVideo.srcObject = this.cameraStream
    cameraVideo.muted = true
    cameraVideo.playsInline = true
    this._cameraVideo = cameraVideo

    const screenVideo = document.createElement('video')
    screenVideo.srcObject = this.screenStream
    screenVideo.muted = true
    screenVideo.playsInline = true
    this._screenVideo = screenVideo

    // Start playback
    await Promise.allSettled([
      cameraVideo.play().catch(() => {}),
      screenVideo.play().catch(() => {})
    ])

    // Wait until videos have decoded enough data to paint first frame
    await Promise.allSettled([
      this._waitForVideoReady(cameraVideo),
      this._waitForVideoReady(screenVideo)
    ])

    // Offscreen canvases for resizing and capturing snapshots
    const cameraCanvas = document.createElement('canvas')
    const screenCanvas = document.createElement('canvas')
    cameraCanvas.width = 160
    cameraCanvas.height = 120
    screenCanvas.width = 640
    screenCanvas.height = 360

    const camCtx = cameraCanvas.getContext('2d')
    const screenCtx = screenCanvas.getContext('2d')

    // Periodic capture loop (every 3 seconds)
    this.frameInterval = setInterval(() => {
      if (this.isPaused) return

      try {
        if (
          this.cameraStream?.active &&
          cameraVideo.readyState >= cameraVideo.HAVE_CURRENT_DATA &&
          cameraVideo.videoWidth > 0
        ) {
          camCtx.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height)
          const camBase64 = cameraCanvas.toDataURL('image/jpeg', 0.5)
          if (this.onFrameCallback) {
            this.onFrameCallback({ type: 'camera_frame', data: camBase64 })
          }
        }
      } catch (e) {
        console.error('Camera canvas capture failed:', e)
      }

      try {
        if (
          this.screenStream?.active &&
          screenVideo.readyState >= screenVideo.HAVE_CURRENT_DATA &&
          screenVideo.videoWidth > 0
        ) {
          screenCtx.drawImage(screenVideo, 0, 0, screenCanvas.width, screenCanvas.height)
          const screenBase64 = screenCanvas.toDataURL('image/jpeg', 0.45)
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
    this.isStopping = true

    if (this.frameInterval) {
      clearInterval(this.frameInterval)
      this.frameInterval = null
    }

    if (this._cameraVideo) {
      this._cameraVideo.srcObject = null
      this._cameraVideo = null
    }
    if (this._screenVideo) {
      this._screenVideo.srcObject = null
      this._screenVideo = null
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
    this.onFrameCallback = null
    this.onStopCallback = null
    this.isStopping = false
  }

  getCameraStatus() { return this.cameraStatus }
  getScreenStatus() { return this.screenStatus }

  /** Returns the live MediaStream for camera (for attaching to <video> elements) */
  getCameraStream() { return this.cameraStream }

  /** Returns the live MediaStream for screen share (for attaching to <video> elements) */
  getScreenStream() { return this.screenStream }
}
