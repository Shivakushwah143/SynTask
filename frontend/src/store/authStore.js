import { create } from 'zustand'
import {
  saveAuthTokens,
  saveUserData,
  clearAuthStorage,
  getStoredAuthData,
} from '../utils/storage'
import { normalizeRole } from '../utils/roles'

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

    setAuth: (user, token, refreshToken, rememberMe) => {
      const normalizedUser = normalizeUser(user)
      saveAuthTokens(token, refreshToken, rememberMe)
      saveUserData(normalizedUser)
      
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
