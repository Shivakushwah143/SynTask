/**
 * Abstract class representing a Monitoring Provider
 * Decouples components from specific capture implementations (Browser, Desktop Agent, Chrome Extension)
 */
export class MonitoringProvider {
  /**
   * Request necessary camera and screen sharing permissions
   * @returns {Promise<boolean>} Resolves to true if all permissions are granted
   */
  async requestPermissions() {
    throw new Error('requestPermissions not implemented')
  }

  /**
   * Start capture streams and background tracking
   * @param {Object} options Configuration parameters
   * @param {Function} options.onFrame Callback triggered with frame capture payload { type: 'camera'|'screen', data: string (base64) }
   * @param {Function} options.onStop Callback triggered if capture is interrupted or revoked
   * @returns {Promise<boolean>} Resolves to true if streams successfully initialized
   */
  async startCapture() {
    throw new Error('startCapture not implemented')
  }

  /**
   * Pause stream processing (e.g. during a Break)
   */
  pauseCapture() {
    throw new Error('pauseCapture not implemented')
  }

  /**
   * Resume stream processing (e.g. after a Break)
   */
  resumeCapture() {
    throw new Error('resumeCapture not implemented')
  }

  /**
   * Stop all active captures and release resources
   */
  stopCapture() {
    throw new Error('stopCapture not implemented')
  }

  /**
   * Get current camera track/permission status
   * @returns {string} Status value: 'Connected' | 'Disabled' | 'Denied'
   */
  getCameraStatus() {
    throw new Error('getCameraStatus not implemented')
  }

  /**
   * Get current screen capture track/permission status
   * @returns {string} Status value: 'Sharing' | 'Stopped' | 'Denied'
   */
  getScreenStatus() {
    throw new Error('getScreenStatus not implemented')
  }
}
