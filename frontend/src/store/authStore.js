import { create } from 'zustand'
import {
  saveAuthTokens,
  saveUserData,
  clearAuthStorage,
  getStoredAuthData,
} from '../utils/storage'

const getInitialAuthState = () => {
  const storedAuth = getStoredAuthData()
  if (!storedAuth) {
    return {
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
    }
  }

  return {
    user: storedAuth.user,
    token: storedAuth.token,
    refreshToken: storedAuth.refreshToken,
    isAuthenticated: true,
  }
}

export const useAuthStore = create(
  (set, get) => ({
    ...getInitialAuthState(),

    setAuth: (user, token, refreshToken, rememberMe) => {
      saveAuthTokens(token, refreshToken, rememberMe)
      saveUserData(user)
      
      set({
        user,
        token,
        refreshToken,
        isAuthenticated: true,
      })
    },

    updateUser: (userData) =>
      set((state) => {
        const user = { ...state.user, ...userData }
        saveUserData(user)
        return { user }
      }),

    clearAuth: () => {
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

    initializeAuth: () => {
      const storedAuth = getStoredAuthData()
      if (!storedAuth) {
        get().clearAuth()
        return false
      }

      set({
        user: storedAuth.user,
        token: storedAuth.token,
        refreshToken: storedAuth.refreshToken,
        isAuthenticated: true,
      })
      return true
    },

    getToken: () => get().token,

    getUser: () => get().user,
  })
)

