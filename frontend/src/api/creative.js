import api from './axios'

export const creativeAPI = {
  createProjectReview: (projectId, payload = {}) => api.post(`/creative/projects/${projectId}/creative-reviews`, payload),
  listProjectReviews: (projectId, params = {}) => api.get(`/creative/projects/${projectId}/creative-reviews`, { params }),
  getReview: (reviewId) => api.get(`/creative/creative-reviews/${reviewId}`),
  rerunReview: (reviewId) => api.post(`/creative/creative-reviews/${reviewId}/rerun`),
  submitFeedback: (reviewId, payload = {}) => api.post(`/creative/creative-reviews/${reviewId}/feedback`, payload),
  approveReview: (reviewId) => api.post(`/creative/creative-reviews/${reviewId}/approve`),
  overrideReview: (reviewId, payload = {}) => api.post(`/creative/creative-reviews/${reviewId}/override`, payload),
  listCampaignReviews: (projectId, params = {}) => api.get(`/creative/projects/${projectId}/campaign-reviews`, { params }),
  createCampaignReview: (projectId, payload = {}) => api.post(`/creative/projects/${projectId}/campaign-reviews`, payload),
}

