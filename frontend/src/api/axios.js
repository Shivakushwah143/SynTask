import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { getAccessToken, getRefreshToken, updateAccessToken } from '../utils/storage'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || '/api/v1'

const axiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

let refreshPromise = null

// Request interceptor - check storage for token
axiosInstance.interceptors.request.use(
  (config) => {
    config.headers = config.headers || {}

    // First try to get token from state, then from storage
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

    // If the error is 401 and we haven't retried yet
    if (
      error.response?.status === 401 &&
      !originalRequest?._retry &&
      !originalRequest?.skipAuthRefresh &&
      !useAuthStore.getState().isLoggingOut
    ) {
      originalRequest._retry = true

      try {
        // Try to get refresh token from state, then from storage
        let refreshToken = useAuthStore.getState().refreshToken
        if (!refreshToken) {
          refreshToken = getRefreshToken()
        }

        if (refreshToken) {
          if (!refreshPromise) {
            refreshPromise = axios.post(`${API_URL}/auth/refresh`, {
              refresh_token: refreshToken,
            }, {
              withCredentials: true,
            }).finally(() => {
              refreshPromise = null
            })
          }

          const response = await refreshPromise
          const { access_token } = response.data

          const authState = useAuthStore.getState()
          if (
            authState.isLoggingOut ||
            authState.refreshToken !== refreshToken ||
            getRefreshToken() !== refreshToken
          ) {
            return Promise.reject(error)
          }

          // Update token in storage
          updateAccessToken(access_token)
          
          // Update state
          useAuthStore.getState().setAuth(
            authState.user,
            access_token,
            refreshToken,
          )

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

    // Handle other errors
    const errorMessage = extractErrorMessage(
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.response?.data
    )

    if (error.response?.status !== 401) {
      toast.error(errorMessage)
    }

    return Promise.reject(error)
  }
)

export default axiosInstance

