import api from './axios'

/**
 * Phase 10 — HR Dashboard & Reports API client.
 * All calls go to the backend /hr/dashboard and /hr/reports/* endpoints.
 */
export const hrDashboardApi = {
  getDashboard: () => api.get('/hr/dashboard'),
}

export const hrReportsApi = {
  // Employee Reports
  getEmployeeDirectory: (params = {}) => api.get('/hr/reports/employees/directory', { params }),
  getHeadcount: (params = {}) => api.get('/hr/reports/employees/headcount', { params }),
  getJoiningExitTrend: (params = {}) => api.get('/hr/reports/employees/joining-exit', { params }),
  
  // Attendance Reports
  getAttendanceSummary: (params = {}) => api.get('/hr/reports/attendance/summary', { params }),
  getLateArrivals: (params = {}) => api.get('/hr/reports/attendance/late', { params }),
  getAbsences: (params = {}) => api.get('/hr/reports/attendance/absence', { params }),
  
  // Leave Reports
  getLeaveBalances: (params = {}) => api.get('/hr/reports/leave/balances', { params }),
  getLeaveUsage: (params = {}) => api.get('/hr/reports/leave/usage', { params }),
  
  // Document Reports
  getDocumentExpiry: (params = {}) => api.get('/hr/reports/documents/expiry', { params }),
  
  // Lifecycle Reports
  getLifecycleEvents: (params = {}) => api.get('/hr/reports/lifecycle/events', { params }),
  getProbationReport: (params = {}) => api.get('/hr/reports/lifecycle/probation', { params }),
  getNoticePeriodReport: (params = {}) => api.get('/hr/reports/lifecycle/notice', { params }),
  
  // Payroll Reports (requires payroll.view permission)
  getPayrollSummary: (params = {}) => api.get('/hr/reports/payroll/summary', { params }),
  getEmployeePayroll: (params = {}) => api.get('/hr/reports/payroll/employees', { params }),
}

export const hrExportsApi = {
  // CSV Export endpoints — return Blob responses
  exportEmployeeDirectory: (params = {}) => api.get('/hr/reports/employees/directory/export', { params, responseType: 'blob' }),
  exportAttendanceSummary: (params = {}) => api.get('/hr/reports/attendance/summary/export', { params, responseType: 'blob' }),
  exportLeaveBalances: (params = {}) => api.get('/hr/reports/leave/balances/export', { params, responseType: 'blob' }),
  exportPayrollSummary: (params = {}) => api.get('/hr/reports/payroll/summary/export', { params, responseType: 'blob' }),
  exportDocumentExpiry: (params = {}) => api.get('/hr/reports/documents/expiry/export', { params, responseType: 'blob' }),
}

export default { hrDashboardApi, hrReportsApi, hrExportsApi }
