import api from './axios'

export const salaryAPI = {
  // ── Salary Structures (company-wide list) ────────────────────────────
  listStructures: async () => {
    const response = await api.get('/salary/structures')
    return response.data
  },

  // ── Salary Components ──────────────────────────────────────────────────
  listComponents: async (includeInactive = false, componentType = null) => {
    const params = new URLSearchParams()
    if (includeInactive) params.append('include_inactive', 'true')
    if (componentType) params.append('component_type', componentType)
    const response = await api.get(`/salary/components?${params.toString()}`)
    return response.data
  },
  createComponent: async (payload) => {
    const response = await api.post('/salary/components', payload)
    return response.data
  },
  updateComponent: async (componentId, payload) => {
    const response = await api.patch(`/salary/components/${componentId}`, payload)
    return response.data
  },
  deleteComponent: async (componentId) => {
    const response = await api.delete(`/salary/components/${componentId}`)
    return response.data
  },

  // ── Phase 8 self-service ───────────────────────────────────────────────
  getMySalary: async () => {
    const response = await api.get('/salary/me')
    return response
  },

  // ── Employee Salary ────────────────────────────────────────────────────
  getEmployeeSalary: async (employeeId) => {
    const response = await api.get(`/salary/employees/${employeeId}/salary`)
    return response.data
  },
  getEmployeeSalaryHistory: async (employeeId) => {
    const response = await api.get(`/salary/employees/${employeeId}/salary/history`)
    return response.data
  },
  assignSalary: async (employeeId, payload) => {
    const response = await api.post(`/salary/employees/${employeeId}/salary`, payload)
    return response.data
  },
  reviseSalary: async (employeeId, payload) => {
    const response = await api.post(`/salary/employees/${employeeId}/salary/revisions`, payload)
    return response.data
  },
  getPayrollSnapshot: async (employeeId, effectiveDate) => {
    const params = new URLSearchParams({ effective_date: effectiveDate })
    const response = await api.get(`/salary/employees/${employeeId}/salary/payroll-snapshot?${params.toString()}`)
    return response.data
  },
}
