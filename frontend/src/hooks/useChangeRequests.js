/**
 * Employee Detail Change Request — React Query hooks.
 *
 * Provides hooks for:
 * - Creating change requests (employee self-service)
 * - Listing own change requests
 * - Review queue (admin/manager)
 * - Approve/reject/cancel mutations
 */
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { employeesApi } from '../api/employees'

export const CHANGE_REQUEST_KEYS = {
  myRequests: (params) => ['change-requests', 'mine', params].filter(Boolean),
  reviewQueue: (params) => ['change-requests', 'review', params].filter(Boolean),
  detail: (id) => ['change-requests', 'detail', id],
}

/**
 * Create a change request for the current user's own profile.
 */
export function useCreateChangeRequest() {
  const queryClient = useQueryClient()
  return useMutation(
    (payload) => employeesApi.createMyChangeRequest(payload).then((r) => r.data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(CHANGE_REQUEST_KEYS.myRequests())
      },
    },
  )
}

/**
 * List the current user's own change requests.
 */
export function useMyChangeRequests(params = {}, options = {}) {
  return useQuery(
    CHANGE_REQUEST_KEYS.myRequests(params),
    () => employeesApi.listMyChangeRequests(params).then((r) => r.data),
    options,
  )
}

/**
 * List change requests pending review (admin/manager scope).
 */
export function useReviewQueue(params = {}, options = {}) {
  return useQuery(
    CHANGE_REQUEST_KEYS.reviewQueue(params),
    () => employeesApi.listReviewQueue(params).then((r) => r.data),
    options,
  )
}

/**
 * Get full details of a single change request.
 */
export function useChangeRequestDetail(id, options = {}) {
  return useQuery(
    CHANGE_REQUEST_KEYS.detail(id),
    () => employeesApi.getChangeRequest(id).then((r) => r.data),
    { enabled: !!id, ...options },
  )
}

/**
 * Approve a pending change request.
 */
export function useApproveChangeRequest() {
  const queryClient = useQueryClient()
  return useMutation(
    ({ id, comment }) => employeesApi.approveChangeRequest(id, { comment }).then((r) => r.data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(CHANGE_REQUEST_KEYS.reviewQueue())
        queryClient.invalidateQueries(CHANGE_REQUEST_KEYS.myRequests())
        queryClient.invalidateQueries(['employees'])
        queryClient.invalidateQueries(['my-hr', 'profile'])
        queryClient.invalidateQueries(['my-hr', 'summary'])
      },
    },
  )
}

/**
 * Reject a pending change request.
 */
export function useRejectChangeRequest() {
  const queryClient = useQueryClient()
  return useMutation(
    ({ id, reason, comment }) =>
      employeesApi.rejectChangeRequest(id, { reason, comment }).then((r) => r.data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(CHANGE_REQUEST_KEYS.reviewQueue())
        queryClient.invalidateQueries(CHANGE_REQUEST_KEYS.myRequests())
      },
    },
  )
}

/**
 * Cancel a pending change request (requester only).
 */
export function useCancelChangeRequest() {
  const queryClient = useQueryClient()
  return useMutation(
    (id) => employeesApi.cancelChangeRequest(id).then((r) => r.data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(CHANGE_REQUEST_KEYS.myRequests())
      },
    },
  )
}
