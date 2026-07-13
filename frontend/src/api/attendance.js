import api from './axios'

export const attendanceAPI = {
  // Fetch today's attendance status and timers
  getTodayAttendance: async () => {
    const response = await api.get('/attendance/today')
    return response.data
  },

  // Fetch enriched attendance summary for Timesheet page
  getTimesheetSummary: async (date = null) => {
    const response = await api.get('/attendance/timesheet-summary', {
      params: date ? { date_filter: date } : {},
    })
    return response.data
  },

  // Fetch live tracking list for managers/leads
  getLiveMonitoring: async () => {
    const response = await api.get('/attendance/live')
    return response.data
  },

  // Fetch attendance history logs
  getAttendanceHistory: async (startDate = null, endDate = null, employeeId = null) => {
    const params = new URLSearchParams()
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)
    if (employeeId) params.append('employee_id', employeeId)
    const response = await api.get(`/attendance/history?${params.toString()}`)
    return response.data
  },

  // Get aggregated dashboard statistics counters
  getDashboardStats: async () => {
    const response = await api.get('/attendance/dashboard-stats')
    return response.data
  },

  // Export report to CSV
  exportAttendanceReport: async (startDate = null, endDate = null, employeeId = null) => {
    const params = new URLSearchParams()
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)
    if (employeeId) params.append('employee_id', employeeId)
    const response = await api.get(`/attendance/reports/export?${params.toString()}`, {
      responseType: 'blob'
    })
    return response
  }
}
