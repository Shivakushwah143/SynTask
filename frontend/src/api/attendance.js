import api from './axios'

export const attendanceAPI = {
  // ── Core Attendance (existing, preserved) ─────────────────────────────────
  getTodayAttendance: async () => {
    const response = await api.get('/attendance/me/today')
    return response.data
  },
  checkIn: async () => (await api.post('/attendance/check-in')).data,
  startBreak: async () => (await api.post('/attendance/break/start')).data,
  endBreak: async () => (await api.post('/attendance/break/end')).data,
  checkOut: async () => (await api.post('/attendance/check-out')).data,
  getMyAttendanceHistory: async (startDate = null, endDate = null) => {
    const params = new URLSearchParams()
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)
    const response = await api.get(`/attendance/me/history?${params.toString()}`)
    return response.data
  },
  getTimesheetSummary: async (date = null) => {
    const response = await api.get('/attendance/timesheet-summary', {
      params: date ? { date_filter: date } : {},
    })
    return response.data
  },
  getLiveMonitoring: async () => {
    const response = await api.get('/attendance/live')
    return response.data
  },
  getAttendanceHistory: async (startDate = null, endDate = null, employeeId = null) => {
    const params = new URLSearchParams()
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)
    if (employeeId) params.append('employee_id', employeeId)
    const response = await api.get(`/attendance/history?${params.toString()}`)
    return response.data
  },
  getDashboardStats: async () => {
    const response = await api.get('/attendance/dashboard-stats')
    return response.data
  },
  exportAttendanceReport: async (startDate = null, endDate = null, employeeId = null) => {
    const params = new URLSearchParams()
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)
    if (employeeId) params.append('employee_id', employeeId)
    const response = await api.get(`/attendance/reports/export?${params.toString()}`, {
      responseType: 'blob'
    })
    return response
  },

  // ── Phase 4: Enhanced Today (policy-aware) ──────────────────────────────
  getTodayEnhanced: async () => {
    const response = await api.get('/attendance/me/today-enhanced')
    return response.data
  },

  // ── Phase 4: Attendance Policy ──────────────────────────────────────────
  getPolicy: async () => {
    const response = await api.get('/attendance/policy')
    return response.data
  },
  listPolicies: async (includeInactive = false) => {
    const params = new URLSearchParams()
    if (includeInactive) params.append('include_inactive', 'true')
    const response = await api.get(`/attendance/policies?${params.toString()}`)
    return response.data
  },
  createPolicy: async (payload) => {
    const response = await api.post('/attendance/policy', payload)
    return response.data
  },
  updatePolicy: async (policyId, payload) => {
    const response = await api.patch(`/attendance/policy/${policyId}`, payload)
    return response.data
  },
  deletePolicy: async (policyId) => {
    const response = await api.delete(`/attendance/policy/${policyId}`)
    return response.data
  },

  // ── Phase 4: Holidays ───────────────────────────────────────────────────
  getHolidays: async (year = null, includeInactive = false) => {
    const params = new URLSearchParams()
    if (year) params.append('year', year)
    if (includeInactive) params.append('include_inactive', 'true')
    const response = await api.get(`/attendance/holidays?${params.toString()}`)
    return response.data
  },
  createHoliday: async (payload) => {
    const response = await api.post('/attendance/holidays', payload)
    return response.data
  },
  updateHoliday: async (holidayId, payload) => {
    const response = await api.patch(`/attendance/holidays/${holidayId}`, payload)
    return response.data
  },
  deleteHoliday: async (holidayId) => {
    const response = await api.delete(`/attendance/holidays/${holidayId}`)
    return response.data
  },

  // ── Phase 4: Corrections ────────────────────────────────────────────────
  requestCorrection: async (payload) => {
    const response = await api.post('/attendance/corrections', payload)
    return response.data
  },
  getMyCorrections: async (statusFilter = null, skip = 0, limit = 50) => {
    const params = new URLSearchParams()
    if (statusFilter) params.append('status', statusFilter)
    params.append('skip', skip)
    params.append('limit', limit)
    const response = await api.get(`/attendance/corrections/me?${params.toString()}`)
    return response.data
  },
  getAllCorrections: async (filters = {}) => {
    const params = new URLSearchParams()
    if (filters.status) params.append('status', filters.status)
    if (filters.employeeId) params.append('employee_id', filters.employeeId)
    if (filters.startDate) params.append('start_date', filters.startDate)
    if (filters.endDate) params.append('end_date', filters.endDate)
    if (filters.skip) params.append('skip', filters.skip)
    if (filters.limit) params.append('limit', filters.limit)
    const response = await api.get(`/attendance/corrections?${params.toString()}`)
    return response.data
  },
  approveCorrection: async (correctionId, comment = null) => {
    const response = await api.post(`/attendance/corrections/${correctionId}/approve`, { comment })
    return response.data
  },
  rejectCorrection: async (correctionId, comment) => {
    const response = await api.post(`/attendance/corrections/${correctionId}/reject`, { comment })
    return response.data
  },
  cancelCorrection: async (correctionId) => {
    const response = await api.post(`/attendance/corrections/${correctionId}/cancel`)
    return response.data
  },

  // ── Phase 4: Payroll Summary ────────────────────────────────────────────
  getPayrollSummary: async (startDate, endDate, employeeId = null) => {
    const params = new URLSearchParams()
    params.append('start_date', startDate)
    params.append('end_date', endDate)
    if (employeeId) params.append('employee_id', employeeId)
    const response = await api.get(`/attendance/payroll-summary?${params.toString()}`)
    return response.data
  },

  // ── eTimeOffice biometric attendance integration ───────────────────────
  syncEtimeOffice: async (fromDate = null, toDate = null) => {
    const params = new URLSearchParams()
    if (fromDate) params.append('from_date', fromDate)
    if (toDate) params.append('to_date', toDate)
    const response = await api.post(`/attendance/integrations/etimeoffice/sync?${params.toString()}`)
    return response.data
  },
  getEtimeOfficeStatus: async () => {
    const response = await api.get('/attendance/integrations/etimeoffice/status')
    return response.data
  },

  // ── eTimeOffice employee mapping (company admins and managers) ──────────
  getEtimeOfficeMappings: async (refreshDirectory = false) => {
    const params = new URLSearchParams()
    if (refreshDirectory) params.append('refresh', 'true')
    const response = await api.get(`/attendance/integrations/etimeoffice/mappings?${params.toString()}`)
    return response.data
  },
  mapEtimeOfficeEmployee: async (externalCode, employeeId) => {
    const response = await api.put(`/attendance/integrations/etimeoffice/mappings/${encodeURIComponent(externalCode)}`, {
      employee_id: employeeId || null,
    })
    return response.data
  },
  removeEtimeOfficeMapping: async (externalCode) => {
    const response = await api.delete(`/attendance/integrations/etimeoffice/mappings/${encodeURIComponent(externalCode)}`)
    return response.data
  },
}
