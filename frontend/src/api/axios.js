import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { getAccessToken, getRefreshToken, updateAccessToken } from '../utils/storage'
import { decodeBlobErrorMessage } from '../utils/download'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || '/api/v1'

const axiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  // NOTE: no global Content-Type default. Axios sets application/json
  // automatically when a request carries a JSON body, so GET/HEAD requests send
  // no Content-Type — that keeps requests CORS-simple (no preflight) whenever
  // VITE_API_URL points at a cross-origin dev backend. Previously the static
  // header forced a preflight round-trip on every API call.
})

// Singleton promise for concurrent refresh deduplication
let refreshPromise = null

/**
 * Mark the refresh endpoint itself so the response interceptor
 * never attempts another refresh when /auth/refresh returns 401.
 */
const REFRESH_URL = '/auth/refresh'

// Request interceptor - check storage for token
axiosInstance.interceptors.request.use(
  (config) => {
    config.headers = config.headers || {}

    // Never intercept the refresh endpoint itself
    if (config.url?.includes(REFRESH_URL)) {
      config._skipAuthRefresh = true
      return config
    }

    if (!config.skipAuth) {
      let token = useAuthStore.getState().token
      if (!token) {
        token = getAccessToken()
      }
      
      if (token) {
        if (typeof config.headers.set === 'function') {
          config.headers.set('Authorization', `Bearer ${token}`)
        } else {
          config.headers.Authorization = `Bearer ${token}`
        }
      } else if (!config.allowUnauthenticated) {
        // Mark this for suppression of auth errors if no token available
        config._unauthenticated = true
      }
    }
    
    // If FormData, let axios set Content-Type automatically
    if (config.data instanceof FormData) {
      if (typeof config.headers.delete === 'function') {
        config.headers.delete('Content-Type')
      } else {
        delete config.headers['Content-Type']
      }
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

const withDataCompatibility = (payload) => {
  if (payload && typeof payload === 'object' && !Object.prototype.hasOwnProperty.call(payload, 'data')) {
    Object.defineProperty(payload, 'data', {
      value: payload,
      enumerable: false,
      configurable: true,
    })
  }
  return payload
}

const extractErrorMessage = (value) => {
  if (!value) return 'An error occurred'
  if (typeof value === 'string' && /<html[\s>]/i.test(value)) {
    return 'Server temporarily unavailable. Please try again.'
  }
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((item) => extractErrorMessage(item?.msg || item?.message || item?.detail || item))
      .filter(Boolean)
      .join(', ')
  }
  if (typeof value === 'object') {
    return extractErrorMessage(value.detail || value.message || value.msg || value.errors || value.input)
  }
  return String(value)
}

// Response interceptor
axiosInstance.interceptors.response.use(
  (response) => {
    if (response.config?.responseType === 'blob') {
      return response
    }

    const payload = response.data
    if (payload && Object.prototype.hasOwnProperty.call(payload, 'success')) {
      if (!payload.success) {
        return Promise.reject(new Error(payload.message || 'Request failed'))
      }
      return withDataCompatibility(payload.data !== undefined ? payload.data : payload)
    }
    return withDataCompatibility(payload)
  },
  async (error) => {
    const originalRequest = error.config

    // ── Guard: never intercept the refresh endpoint itself ──────────────
    if (originalRequest?._skipAuthRefresh || originalRequest?.url?.includes(REFRESH_URL)) {
      return Promise.reject(error)
    }

    // If the error is 401 and we haven't retried yet, try to refresh
    if (
      error.response?.status === 401 &&
      !originalRequest?._retry &&
      !originalRequest?.skipAuthRefresh &&
      !useAuthStore.getState().isLoggingOut
    ) {
      // Skip retry if request was made without token (auth still initializing)
      if (originalRequest?._unauthenticated) {
        return Promise.reject(error)
      }

      originalRequest._retry = true

      try {
        // Try to get refresh token from state, then from storage
        let refreshToken = useAuthStore.getState().refreshToken
        if (!refreshToken) {
          refreshToken = getRefreshToken()
        }

        if (refreshToken || useAuthStore.getState().isAuthenticated) {
          // ── Concurrency-safe: only ONE refresh request at a time ──
          if (!refreshPromise) {
            refreshPromise = axios.post(`${API_URL}/auth/refresh`, refreshToken ? {
              refresh_token: refreshToken,
            } : undefined, {
              withCredentials: true,
              _skipAuthRefresh: true,
            }).finally(() => {
              refreshPromise = null
            })
          }

          const response = await refreshPromise
          const { access_token } = response.data

          const authState = useAuthStore.getState()

          // If logout happened during refresh, bail out
          if (authState.isLoggingOut) {
            return Promise.reject(error)
          }

          // Update token in storage
          updateAccessToken(access_token)

          // Update state — only setAuth if the token actually changed
          // to avoid unnecessary re-renders across all subscribers.
          if (authState.token !== access_token) {
            useAuthStore.getState().setAuth(
              authState.user,
              access_token,
              refreshToken,
              undefined,
            )
          }

          // Retry the original request with the fresh token
          originalRequest.headers = originalRequest.headers || {}
          if (typeof originalRequest.headers.set === 'function') {
            originalRequest.headers.set('Authorization', `Bearer ${access_token}`)
          } else {
            originalRequest.headers.Authorization = `Bearer ${access_token}`
          }
          return axiosInstance(originalRequest)
        }
      } catch (refreshError) {
        if (!useAuthStore.getState().isLoggingOut) {
          useAuthStore.getState().clearAuth()
          window.location.replace('/login')
          toast.error('Session expired. Please login again.')
        }
        return Promise.reject(refreshError)
      }
    }

    // Handle server unavailable errors
    if ([502, 503, 504].includes(error.response?.status)) {
      toast.error('Server temporarily unavailable. Please try again.')
      return Promise.reject(error)
    }

    // Handle other errors - suppress toasts for 401/403, unauthenticated
    // requests, and requests that opt out via `suppressGlobalToast` (their
    // caller shows a local notification instead, e.g. the invoice PDF download).
    if (![401, 403].includes(error.response?.status) && !originalRequest?._unauthenticated && !originalRequest?.suppressGlobalToast) {
      let errorMessage
      if (originalRequest?.responseType === 'blob') {
        // Blob responses hide the backend's JSON error; decode it for the toast.
        errorMessage = await decodeBlobErrorMessage(error, 'Request failed')
      } else {
        errorMessage = extractErrorMessage(
          error.response?.data?.detail ||
          error.response?.data?.message ||
          error.response?.data
        )
      }
      toast.error(errorMessage)
    }

    return Promise.reject(error)
  }
)

export default axiosInstance
