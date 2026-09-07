// Phase 8 — My HR (Employee Self-Service) React Query hooks.
// Reuses the existing module APIs (attendance/leave/documents/payroll) with
// self-scoped keys; server state never lives in component state.
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { myHrApi } from '../api/myHr'
import { attendanceAPI } from '../api/attendance'
import { leavesAPI } from '../api/leaves'
import { hrDocumentsApi } from '../api/hrDocuments'
import { payrollAPI } from '../api/payroll'
import { lifecycleApi } from '../api/lifecycle'

export const MY_HR_KEYS = {
  profile: ['my-hr', 'profile'],
  summary: ['my-hr', 'summary'],
  salary: ['my-hr', 'salary'],
  attendanceToday: ['my-hr', 'attendance', 'today'],
  attendanceHistory: ['my-hr', 'attendance', 'history'],
  corrections: ['my-hr', 'attendance', 'corrections'],
  leaveBalances: ['my-hr', 'leave', 'balances'],
  leaveRequests: ['my-hr', 'leave', 'requests'],
  documents: ['my-hr', 'documents'],
  documentRequests: ['my-hr', 'document-requests'],
  payslips: ['my-hr', 'payslips'],
  lifecycle: ['my-hr', 'lifecycle'],
}

export const useMyProfile = (options) =>
  useQuery(MY_HR_KEYS.profile, () => myHrApi.getMyProfile(), {
    retry: false, // 404 → no Employee Profile for this account.
    ...options,
  })

export const useMySummary = (options) =>
  useQuery(MY_HR_KEYS.summary, () => myHrApi.getMySummary(), options)

export const useMySalary = (options) =>
  useQuery(MY_HR_KEYS.salary, () => myHrApi.getMySalary(), {
    enabled: false, // salary is sensitive — fetched only on the Payslips page
    ...options,
  })

export const useMyAttendanceToday = (options) =>
  useQuery(MY_HR_KEYS.attendanceToday, () => attendanceAPI.getTodayEnhanced(), {
    staleTime: 30_000,
    ...options,
  })

export const useMyAttendanceHistory = (options) =>
  useQuery(MY_HR_KEYS.attendanceHistory, () => attendanceAPI.getMyAttendanceHistory(), options)

export const useMyCorrections = (options) =>
  useQuery(MY_HR_KEYS.corrections, () => attendanceAPI.getMyCorrections(), options)

export const useMyLeaveBalances = (options) =>
  useQuery(MY_HR_KEYS.leaveBalances, () => leavesAPI.myBalances(), options)

export const useMyLeaveRequests = (options) =>
  useQuery(MY_HR_KEYS.leaveRequests, () => leavesAPI.myLeaves(), options)

export const useMyDocuments = (options) =>
  useQuery(MY_HR_KEYS.documents, () => hrDocumentsApi.listMyDocuments(), options)

/** My Documents status overview (required + uploadable types with states). */
export const useMyDocumentStatus = (options) =>
  useQuery(['my-hr', 'documents', 'status'], () => hrDocumentsApi.myDocumentStatus(), options)

/** Employee's own document requests. */
export const useMyDocumentRequests = (options) =>
  useQuery(MY_HR_KEYS.documentRequests, () => hrDocumentsApi.listMyDocumentRequests(), options)

export function useMyDocumentActions() {
  const queryClient = useQueryClient()
  return useMutation((formData) => hrDocumentsApi.uploadMyDocument(formData), {
    onSuccess: () => {
      // The new pending submission must be visible immediately.
      queryClient.invalidateQueries(MY_HR_KEYS.documents)
      queryClient.invalidateQueries(['my-hr', 'documents', 'status'])
      queryClient.invalidateQueries(MY_HR_KEYS.documentRequests)
      queryClient.invalidateQueries(MY_HR_KEYS.summary)
    },
  })
}

/** Upload a document against a specific document request. */
export function useUploadForDocumentRequest() {
  const queryClient = useQueryClient()
  return useMutation(
    ({ requestId, formData }) => hrDocumentsApi.uploadForDocumentRequest(requestId, formData),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(MY_HR_KEYS.documentRequests)
        queryClient.invalidateQueries(MY_HR_KEYS.documents)
        queryClient.invalidateQueries(['my-hr', 'documents', 'status'])
        queryClient.invalidateQueries(MY_HR_KEYS.summary)
      },
    },
  )
}

export const useMyPayslips = (options) =>
  useQuery(MY_HR_KEYS.payslips, () => payrollAPI.getMyPayslips(), options)

export const useMyLifecycle = (options) =>
  useQuery(MY_HR_KEYS.lifecycle, () => lifecycleApi.getMyLifecycle(), options)

// ── Mutations (invalidate the right self keys + navbar-attendance state) ──
export function useUpdateMyProfile() {
  const queryClient = useQueryClient()
  return useMutation((payload) => myHrApi.updateMyProfile(payload), {
    onSuccess: () => {
      queryClient.invalidateQueries(MY_HR_KEYS.profile)
      queryClient.invalidateQueries(MY_HR_KEYS.summary)
    },
  })
}

export function useMyAttendanceMutation() {
  const queryClient = useQueryClient()
  return useMutation(
    ({ action, ...payload }) => {
      if (action === 'check_in') return attendanceAPI.checkIn()
      if (action === 'start_break') return attendanceAPI.startBreak()
      if (action === 'end_break') return attendanceAPI.endBreak()
      if (action === 'check_out') return attendanceAPI.checkOut()
      if (action === 'correction') return attendanceAPI.requestCorrection(payload)
      if (action === 'cancel_correction') return attendanceAPI.cancelCorrection(payload.correction_id)
      throw new Error('Unknown attendance action')
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(MY_HR_KEYS.attendanceToday)
        queryClient.invalidateQueries(MY_HR_KEYS.attendanceHistory)
        queryClient.invalidateQueries(MY_HR_KEYS.corrections)
        queryClient.invalidateQueries(MY_HR_KEYS.summary)
      },
    },
  )
}

export function useMyLeaveActions() {
  const queryClient = useQueryClient()
  return useMutation(
    ({ action, ...payload }) => {
      if (action === 'request') return leavesAPI.create(payload)
      if (action === 'cancel') return leavesAPI.cancel(payload.leave_id)
      throw new Error('Unknown leave action')
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(MY_HR_KEYS.leaveBalances)
        queryClient.invalidateQueries(MY_HR_KEYS.leaveRequests)
        queryClient.invalidateQueries(MY_HR_KEYS.summary)
      },
    },
  )
}

export function useMyPayslipActions() {
  const queryClient = useQueryClient()
  return useMutation(
    ({ action, payslip_id }) => {
      if (action === 'generate') return payrollAPI.generatePayslip(payslip_id)
      throw new Error('Unknown payslip action')
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(MY_HR_KEYS.payslips)
        queryClient.invalidateQueries(MY_HR_KEYS.summary)
      },
    },
  )
}

export function useMyLifecycleActions() {
  const queryClient = useQueryClient()
  return useMutation(
    ({ action, ...payload }) => {
      if (action === 'submit_resignation') return lifecycleApi.submitMyResignation(payload)
      if (action === 'withdraw_resignation') return lifecycleApi.withdrawMyResignation(payload.separation_id)
      throw new Error('Unknown lifecycle action')
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(MY_HR_KEYS.lifecycle)
        queryClient.invalidateQueries(MY_HR_KEYS.profile)
        queryClient.invalidateQueries(MY_HR_KEYS.summary)
      },
    },
  )
}
