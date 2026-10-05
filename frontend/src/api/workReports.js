import api from './axios'

export const workReportsAPI = {
  tasks: async (params = {}) => (await api.get('/reports/tasks', { params })).data,
  projects: async (params = {}) => (await api.get('/reports/projects', { params })).data,
}
