import api from './axios'

export const changelogApi = {
  getChangelog: (taskId, params = {}) => {
    return api.get(`/changelog/tasks/${taskId}/changelog`, { params })
  },
}


