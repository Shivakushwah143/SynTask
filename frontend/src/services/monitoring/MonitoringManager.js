import { BrowserMonitoringProvider } from './BrowserMonitoringProvider'

class MonitoringManager {
  constructor() {
    // Phase 1 defaults to Browser provider
    this.provider = new BrowserMonitoringProvider()
  }

  /**
   * Allows hot-swapping providers in the future (Desktop Agent, Chrome Extension)
   * @param {MonitoringProvider} providerInstance
   */
  setProvider(providerInstance) {
    if (this.provider) {
      this.provider.stopCapture()
    }
    this.provider = providerInstance
  }

  async requestPermissions() {
    return await this.provider.requestPermissions()
  }

  async startCapture({ onFrame, onStop }) {
    return await this.provider.startCapture({ onFrame, onStop })
  }

  pauseCapture() {
    this.provider.pauseCapture()
  }

  resumeCapture() {
    this.provider.resumeCapture()
  }

  stopCapture() {
    this.provider.stopCapture()
  }

  getCameraStatus() {
    return this.provider.getCameraStatus()
  }

  getScreenStatus() {
    return this.provider.getScreenStatus()
  }
}

// Singleton export
export const monitoringManager = new MonitoringManager()
export default monitoringManager
