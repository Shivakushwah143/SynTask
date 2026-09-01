import api from './axios'

export const payrollAPI = {
  // ── Periods ────────────────────────────────────────────────────────────
  listPeriods: async (statusFilter = null) => {
    const params = new URLSearchParams()
    if (statusFilter) params.append('status', statusFilter)
    const response = await api.get(`/payroll/periods?${params.toString()}`)
    return response.data
  },
  createPeriod: async (payload) => {
    const response = await api.post('/payroll/periods', payload)
    return response.data
  },
  getPeriod: async (periodId) => {
    const response = await api.get(`/payroll/periods/${periodId}`)
    return response.data
  },

  // ── Lifecycle ──────────────────────────────────────────────────────────
  calculatePeriod: async (periodId) => {
    const response = await api.post(`/payroll/periods/${periodId}/calculate`)
    return response.data
  },
  reviewPeriod: async (periodId) => {
    const response = await api.post(`/payroll/periods/${periodId}/review`)
    return response.data
  },
  approvePeriod: async (periodId) => {
    const response = await api.post(`/payroll/periods/${periodId}/approve`)
    return response.data
  },
  processPeriod: async (periodId) => {
    const response = await api.post(`/payroll/periods/${periodId}/process`)
    return response.data
  },

  // ── Records ────────────────────────────────────────────────────────────
  getPeriodRecords: async (periodId, statusFilter = null, skip = 0, limit = 100) => {
    const params = new URLSearchParams()
    if (statusFilter) params.append('status', statusFilter)
    params.append('skip', skip)
    params.append('limit', limit)
    const response = await api.get(`/payroll/periods/${periodId}/records?${params.toString()}`)
    return response.data
  },
  getRecord: async (recordId) => {
    const response = await api.get(`/payroll/records/${recordId}`)
    return response.data
  },

  // ── Phase 7: Payslips ──────────────────────────────────────────────────
  generatePayslip: async (recordId) => {
    const response = await api.post(`/payroll/records/${recordId}/payslip`)
    return response.data
  },
  generatePeriodPayslips: async (periodId, regenerate = false) => {
    const params = new URLSearchParams()
    if (regenerate) params.append('regenerate', 'true')
    const response = await api.post(`/payroll/periods/${periodId}/payslips/generate?${params.toString()}`)
    return response.data
  },
  getRecordPayslips: async (recordId) => {
    const response = await api.get(`/payroll/records/${recordId}/payslips`)
    return response.data
  },
  getPayslip: async (payslipId) => {
    const response = await api.get(`/payroll/payslips/${payslipId}`)
    return response.data
  },
  regeneratePayslip: async (payslipId) => {
    const response = await api.post(`/payroll/payslips/${payslipId}/regenerate`)
    return response.data
  },
  getMyPayslips: async () => {
    const response = await api.get('/payroll/me/payslips')
    return response.data
  },
}

/** Authorized payslip file access — fetched as blobs so previews/downloads
 *  carry the auth headers and payslips are never exposed through raw URLs. */
export const payrollFiles = {
  preview: (payslipId) => api.get(`/payroll/payslips/${payslipId}/preview`, {
    responseType: 'blob',
    suppressGlobalToast: true,
  }),
  download: (payslipId) => api.get(`/payroll/payslips/${payslipId}/download`, {
    responseType: 'blob',
    suppressGlobalToast: true,
  }),
}

export default payrollAPI
