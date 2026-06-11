import { create } from 'zustand'

export const useAuthStore = create(
  (set, get) => ({
    user: null,
    token: null,
    refreshToken: null,
    isAuthenticated: false,

    setAuth: (user, token, refreshToken) =>
      set({
        user,
        token,
        refreshToken,
        isAuthenticated: true,
      }),

    updateUser: (userData) =>
      set((state) => ({
        user: { ...state.user, ...userData },
      })),

    clearAuth: () =>
      set({
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
      }),

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

    getToken: () => get().token,

    getUser: () => get().user,
  })
)

