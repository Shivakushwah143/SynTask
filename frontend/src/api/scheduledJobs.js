import api from './axios'

export const scheduledJobsAPI = {
  listJobs: async (filters = {}) => {
    const params = new URLSearchParams()
    if (filters.status) params.append('status', filters.status)
    if (filters.search) params.append('search', filters.search)
    if (filters.skip) params.append('skip', filters.skip)
    if (filters.limit) params.append('limit', filters.limit)

    const query = params.toString()
    const response = await api.get(query ? `/scheduled-jobs/?${query}` : '/scheduled-jobs/')
    return response.data
  },

  scheduleJob: async (jobData) => {
    const response = await api.post('/scheduled-jobs/', jobData)
    return response.data
  },

  updateSchedule: async (jobId, data) => {
    const response = await api.patch(`/scheduled-jobs/${jobId}`, data)
    return response.data
  },

  cancelSchedule: async (jobId) => {
    const response = await api.post(`/scheduled-jobs/${jobId}/cancel`)
    return response.data
  },

  retryJob: async (jobId) => {
    const response = await api.post(`/scheduled-jobs/${jobId}/retry`)
    return response.data
  },

  deleteJob: async (jobId) => {
    const response = await api.delete(`/scheduled-jobs/${jobId}`)
    return response.data
  },
}
