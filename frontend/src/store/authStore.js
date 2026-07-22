import { create } from 'zustand'
import {
  saveAuthTokens,
  saveUserData,
  clearAuthStorage,
  getStoredAuthData,
} from '../utils/storage'
import { normalizeRole } from '../utils/roles'
import { queryClient } from '../api/queryClient'

const normalizeUser = (user) => {
  if (!user) return user
  return {
    ...user,
    role: normalizeRole(user.role),
  }
}

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
    user: normalizeUser(storedAuth.user),
    token: storedAuth.token,
    refreshToken: storedAuth.refreshToken,
    isAuthenticated: true,
  }
}

export const useAuthStore = create(
  (set, get) => ({
    ...getInitialAuthState(),
    isLoggingOut: false,

    setAuth: (user, token, refreshToken, rememberMe) => {
      const normalizedUser = normalizeUser(user)
      saveAuthTokens(token, refreshToken, rememberMe)
      saveUserData(normalizedUser, rememberMe)
      
      set({
        user: normalizedUser,
        token,
        refreshToken,
        isAuthenticated: true,
      })
    },

    updateUser: (userData) =>
      set((state) => {
        const user = normalizeUser({ ...state.user, ...userData })
        saveUserData(user)
        return { user }
      }),

    clearAuth: () => {
      clearAuthStorage()
      queryClient.clear()
      
      set({
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
      })
    },

    logout: async () => {
      const { token, refreshToken, isLoggingOut } = get()
      if (isLoggingOut) return

      set({ isLoggingOut: true })
      get().clearAuth()

      try {
        const { authAPI } = await import('../api/auth')
        if (token) {
          await authAPI.logout(refreshToken, token)
        }
      } catch (e) {
        // Client state is already cleared; an unavailable API must not trap the user.
      } finally {
        set({ isLoggingOut: false })
      }
    },

    initializeAuth: () => {
      const storedAuth = getStoredAuthData()
      if (!storedAuth) {
        get().clearAuth()
        return false
      }

      set({
        user: normalizeUser(storedAuth.user),
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
