import { create } from 'zustand'
import {
  saveAuthTokens,
  saveUserData,
  getAccessToken,
  getRefreshToken,
  getUserData,
  clearAuthStorage,
  updateAccessToken,
  hasAuthData,
} from '../utils/storage'

export const useAuthStore = create(
  (set, get) => ({
    user: null,
    token: null,
    refreshToken: null,
    isAuthenticated: false,

    setAuth: (user, token, refreshToken, rememberMe = false) => {
      // Save tokens to storage (localStorage + cookies)
      saveAuthTokens(token, refreshToken, rememberMe)
      // Save user data to localStorage
      saveUserData(user)
      
      set({
        user,
        token,
        refreshToken,
        isAuthenticated: true,
      })
    },

    updateUser: (userData) =>
      set((state) => ({
        user: { ...state.user, ...userData },
      })),

    clearAuth: () => {
      // Clear from storage
      clearAuthStorage()
      
      set({
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
      })
    },

    logout: async () => {
      const { refreshToken } = get()
      try {
        const { authAPI } = await import('../api/auth')
        await authAPI.logout(refreshToken)
      } catch (e) {
        // Always clear client state, even if server-side revocation fails.
      }
      get().clearAuth()
    },

    // Initialize auth from stored tokens
    initializeAuth: () => {
      if (hasAuthData()) {
        const token = getAccessToken()
        const refreshToken = getRefreshToken()
        const user = getUserData()
        
        set({
          user,
          token,
          refreshToken,
          isAuthenticated: true,
        })
        return true
      }
      return false
    },

    getToken: () => get().token,

    getUser: () => get().user,
  })
)

