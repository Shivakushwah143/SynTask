import api from "./axios";

export const recruitmentApi = {
  getDashboard: (params) => api.get("/recruitment/dashboard", { params }),
  getJobDashboard: () => api.get("/recruitment/jobs/dashboard"),
  getCareerPage: () => api.get("/recruitment/career-page"),
  getJobs: (params) => api.get("/recruitment/jobs", { params }),
  getJob: (id) => api.get(`/recruitment/jobs/${id}`),
  getJobApplications: (id) => api.get(`/recruitment/jobs/${id}/applications`),
  createJob: (payload) => api.post("/recruitment/jobs", payload),
  updateJob: (id, payload) => api.patch(`/recruitment/jobs/${id}`, payload),
  publishJob: (id) => api.post(`/recruitment/jobs/${id}/publish`),
  pauseJob: (id) => api.post(`/recruitment/jobs/${id}/pause`),
  closeJob: (id) => api.post(`/recruitment/jobs/${id}/close`),
  archiveJob: (id) => api.post(`/recruitment/jobs/${id}/archive`),
  restoreJob: (id) => api.post(`/recruitment/jobs/${id}/restore`),
  duplicateJob: (id) => api.post(`/recruitment/jobs/${id}/duplicate`),
  submitJobForApproval: (id) => api.post(`/recruitment/jobs/${id}/submit-for-approval`),
  approveJob: (id) => api.post(`/recruitment/jobs/${id}/approve`),
  rejectJob: (id, payload) => api.post(`/recruitment/jobs/${id}/reject`, payload),
  setJobStatus: (id, status) => api.post(`/recruitment/jobs/${id}/status`, { status }),
  getInbox: (params) => api.get("/recruitment/inbox", { params }),
  getInboxItem: (id) => api.get(`/recruitment/inbox/${id}`),
  importInbox: (payload) => api.post("/recruitment/inbox/import", payload),
  syncInboxNow: () => api.post("/recruitment/inbox/sync-now"),
  getInboxSyncStatus: () => api.get("/recruitment/inbox/sync-status"),
  retryInbox: (id) => api.post(`/recruitment/inbox/${id}/retry`),
  ignoreInbox: (id) => api.post(`/recruitment/inbox/${id}/ignore`),
  getCandidates: (params) => api.get("/recruitment/candidates", { params }),
  getCandidate: (id) => api.get(`/recruitment/candidates/${id}`),
  assignJobToCandidate: (candidateId, payload) => api.post(`/recruitment/candidates/${candidateId}/assign-job`, payload),
  getEmployees: (params) => api.get("/recruitment/employees", { params }),
  convertCandidate: (id, payload) => api.post(`/recruitment/candidates/${id}/convert`, payload),
  markCandidateJoined: (id, payload) => api.post(`/recruitment/candidates/${id}/mark-joined`, payload),
  moveCandidate: (id, payload) => api.post(`/recruitment/candidates/${id}/move`, payload),
  rejectCandidate: (id, payload) => api.post(`/recruitment/candidates/${id}/reject`, payload),
  updateCandidate: (id, payload) => api.patch(`/recruitment/candidates/${id}`, payload),
  assignCandidate: (id, payload) => api.post(`/recruitment/candidates/${id}/assign`, payload),
  moveCandidate: (id, status) => api.post(`/recruitment/candidates/${id}/move`, { status }),
  rejectCandidate: (id, reason = "Rejected from job details") => api.post(`/recruitment/candidates/${id}/reject`, { reason }),
  archiveCandidate: (id) => api.post(`/recruitment/candidates/${id}/archive`),
  restoreCandidate: (id) => api.post(`/recruitment/candidates/${id}/restore`),
  addCandidateNote: (id, payload) => api.post(`/recruitment/candidates/${id}/note`, payload),
  addCandidateAttachment: (id, file) => {
    const data = new FormData();
    data.append("file", file);
    return api.post(`/recruitment/candidates/${id}/attachment`, data);
  },
  uploadCandidateResume: (id, file) => {
    const data = new FormData();
    data.append("file", file);
    return api.post(`/recruitment/candidates/${id}/resumes`, data);
  },
  processResume: (id, force = false) => api.post(`/recruitment/resumes/${id}/process`, null, { params: { force } }),
  getResumeStatus: (id) => api.get(`/recruitment/resumes/${id}/status`),
  getParsedProfile: (id) => api.get(`/recruitment/resumes/${id}/parsed-profile`),
  updateParsedProfile: (id, payload) => api.patch(`/recruitment/resumes/${id}/parsed-profile`, payload),
  extractJobRequirements: (id) => api.post(`/recruitment/jobs/${id}/extract-requirements`),
  getJobRequirements: (id) => api.get(`/recruitment/jobs/${id}/requirements`),
  updateJobRequirements: (id, payload) => api.patch(`/recruitment/jobs/${id}/requirements`, payload),
  scoreCandidates: (id) => api.post(`/recruitment/jobs/${id}/score-candidates`),
  getCandidateRankings: (id, params) => api.get(`/recruitment/jobs/${id}/candidate-rankings`, { params }),
  getCandidateJobScore: (candidateId, jobId) => api.get(`/recruitment/candidates/${candidateId}/job-score/${jobId}`),
  shortlistCandidates: (jobId, payload) => api.post(`/recruitment/jobs/${jobId}/shortlist`, payload),
  getCandidateTimeline: (id) => api.get(`/recruitment/candidates/${id}/timeline`),
  getResumePool: (params) => api.get("/recruitment/resume-pool", { params }),
  getInterviews: (params) => api.get("/recruitment/interviews", { params }),
  getInterview: (id) => api.get(`/recruitment/interviews/${id}`),
  createCandidate: (payload) => api.post("/recruitment/candidates", payload),
  createInterview: (payload) => api.post("/recruitment/interviews", payload),
  getInterviewAvailability: (payload) => api.post("/recruitment/interviews/availability", payload),
  proposeInterviewSlots: (payload) => api.post("/recruitment/interviews/propose-slots", payload),
  scheduleInterviewWithTeams: (payload) => api.post("/recruitment/interviews/schedule", payload),
  bulkScheduleInterviews: (payload) => api.post("/recruitment/interviews/bulk-schedule", payload),
  startInterview: (id) => api.post(`/recruitment/interviews/${id}/start`),
  completeInterview: (id) => api.post(`/recruitment/interviews/${id}/complete`),
  updateInterview: (id, payload) => api.patch(`/recruitment/interviews/${id}`, payload),
  rescheduleInterview: (id, payload) => api.post(`/recruitment/interviews/${id}/reschedule`, payload),
  cancelInterview: (id, payload) => api.post(`/recruitment/interviews/${id}/cancel`, payload),
  submitInterviewFeedback: (id, payload) => api.post(`/recruitment/interviews/${id}/feedback`, payload),
  recordInterviewDecision: (id, payload) => api.post(`/recruitment/interviews/${id}/decision`, payload),
  getInterviewAttendeeStatus: (id) => api.get(`/recruitment/interviews/${id}/attendee-status`),
  connectMicrosoft: (payload) => api.post("/recruitment/integrations/microsoft/connect", payload),
  getMicrosoftAuthorizeUrl: (params) => api.get("/recruitment/integrations/microsoft/authorize-url", { params }),
  getMicrosoftStatus: () => api.get("/recruitment/integrations/microsoft/status"),
  disconnectMicrosoft: () => api.post("/recruitment/integrations/microsoft/disconnect"),
  testMicrosoft: () => api.post("/recruitment/integrations/microsoft/test"),
  sendRecruitmentTestEmail: (payload) => api.post("/recruitment/email/test", payload),
  createOffer: (payload) => api.post("/recruitment/offers", payload),
  getOffers: (params) => api.get("/recruitment/offers", { params }),
  getOffer: (id) => api.get(`/recruitment/offers/${id}`),
  updateOffer: (id, payload) => api.patch(`/recruitment/offers/${id}`, payload),
  submitOfferForApproval: (id) => api.post(`/recruitment/offers/${id}/submit-for-approval`),
  approveOffer: (id, payload) => api.post(`/recruitment/offers/${id}/approve`, payload),
  rejectOfferApproval: (id, payload) => api.post(`/recruitment/offers/${id}/reject-approval`, payload),
  previewOffer: (id) => api.post(`/recruitment/offers/${id}/preview`),
  generateOfferPdf: (id) => api.post(`/recruitment/offers/${id}/generate-pdf`),
  uploadOfferLetter: (id, file) => {
    const data = new FormData();
    data.append("file", file);
    return api.post(`/recruitment/offers/${id}/upload-letter`, data);
  },
  sendOffer: (id) => api.post(`/recruitment/offers/${id}/send`),
  withdrawOffer: (id, payload) => api.post(`/recruitment/offers/${id}/withdraw`, payload),
  resendOffer: (id) => api.post(`/recruitment/offers/${id}/resend`),
  getOfferHistory: (id) => api.get(`/recruitment/offers/${id}/history`),
  getReportsOverview: (params) => api.get("/recruitment/reports", { params }),
  getReportFunnel: (params) => api.get("/recruitment/reports/funnel", { params }),
  getReportJobs: (params) => api.get("/recruitment/reports/jobs", { params }),
  getReportDepartments: (params) => api.get("/recruitment/reports/departments", { params }),
  getReportRecruiters: (params) => api.get("/recruitment/reports/recruiters", { params }),
  getReportInterviews: (params) => api.get("/recruitment/reports/interviews", { params }),
  getReportOffers: (params) => api.get("/recruitment/reports/offers", { params }),
  getReportTrends: (params) => api.get("/recruitment/reports/trends", { params }),
};

export const publicOffersApi = {
  getOffer: (token) => api.get(`/public/offers/${token}`, { allowUnauthenticated: true, skipAuthRefresh: true }),
  requestOtp: (token) => api.post(`/public/offers/${token}/request-otp`, undefined, { allowUnauthenticated: true, skipAuthRefresh: true }),
  verifyOtp: (token, payload) => api.post(`/public/offers/${token}/verify-otp`, payload, { allowUnauthenticated: true, skipAuthRefresh: true }),
  accept: (token, payload) => api.post(`/public/offers/${token}/accept`, payload, { allowUnauthenticated: true, skipAuthRefresh: true }),
  reject: (token, payload) => api.post(`/public/offers/${token}/reject`, payload, { allowUnauthenticated: true, skipAuthRefresh: true }),
  pdfUrl: (token) => `/api/v1/public/offers/${token}/pdf`,
};

export const careersApi = {
  getCompanies: () => api.get("/careers", { allowUnauthenticated: true }),
  getPortal: (companySlug, params) => api.get(`/careers/${companySlug}`, { params, allowUnauthenticated: true }),
  getJobs: (companySlug, params) => api.get(`/careers/${companySlug}/jobs`, { params, allowUnauthenticated: true }),
  getJob: (companySlug, slug, params) => api.get(`/careers/${companySlug}/jobs/${slug}`, { params, allowUnauthenticated: true }),
  apply: (companySlug, jobId, payload) => api.post(`/careers/${companySlug}/jobs/${jobId}/apply`, payload, { allowUnauthenticated: true }),
  track: (trackingCode, trackingPin) => api.post("/careers/applications/track", { tracking_code: trackingCode, tracking_pin: trackingPin }, { allowUnauthenticated: true }),
  updateTrackedProfile: (payload) => api.patch("/careers/applications/track/profile", payload, { allowUnauthenticated: true }),
  uploadTrackedResume: (trackingCode, trackingPin, resume) => {
    const data = new FormData();
    data.append("tracking_code", trackingCode);
    data.append("tracking_pin", trackingPin);
    data.append("resume", resume);
    return api.post("/careers/applications/track/resume", data, { allowUnauthenticated: true });
  },
};
