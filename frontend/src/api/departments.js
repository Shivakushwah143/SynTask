import api from './axios'

export const DEPARTMENTS_CHANGED_EVENT = 'syntask:departments-changed'

export const notifyDepartmentsChanged = (detail = {}) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(DEPARTMENTS_CHANGED_EVENT, { detail }))
}

export const departmentsAPI = {
  listDepartments: async () => {
    const response = await api.get('/departments/')
    return response.data
  },

  createDepartment: async (payload) => {
    const response = await api.post('/departments/', payload)
    return response.data
  },

  updateDepartment: async (departmentId, payload) => {
    const response = await api.put(`/departments/${departmentId}`, payload)
    return response.data
  },

  deleteDepartment: async (departmentId) => {
    const response = await api.delete(`/departments/${departmentId}`)
    return response.data
  },
}

