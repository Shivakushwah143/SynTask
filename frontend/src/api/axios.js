import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { getAccessToken, getRefreshToken, updateAccessToken } from '../utils/storage'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

const axiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor - check storage for token
axiosInstance.interceptors.request.use(
  (config) => {
    // First try to get token from state, then from storage
    let token = useAuthStore.getState().token
    if (!token) {
      token = getAccessToken()
    }
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    
    // If FormData, let axios set Content-Type automatically
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
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
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.skipAuthRefresh) {
      originalRequest._retry = true

      try {
        // Try to get refresh token from state, then from storage
        let refreshToken = useAuthStore.getState().refreshToken
        if (!refreshToken) {
          refreshToken = getRefreshToken()
        }

        if (refreshToken) {
          const response = await axios.post(`${API_URL}/auth/refresh`, {
            refresh_token: refreshToken,
          })

          const { access_token } = response.data

          // Update token in storage
          updateAccessToken(access_token)
          
          // Update state
          useAuthStore.getState().setAuth(
            useAuthStore.getState().user,
            access_token,
            refreshToken
          )

          originalRequest.headers.Authorization = `Bearer ${access_token}`
          return axiosInstance(originalRequest)
        }
      } catch (refreshError) {
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
        toast.error('Session expired. Please login again.')
        return Promise.reject(refreshError)
      }
    }

    // Handle other errors
    const errorMessage =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      'An error occurred'

    if (error.response?.status !== 401) {
      toast.error(errorMessage)
    }

    return Promise.reject(error)
  }
)

export default axiosInstance

