import api from './axios'

export const authAPI = {
  login: async (email, password, rememberMe = false) => {
    const response = await api.post('/auth/login', { 
      email, 
      password, 
      remember_me: rememberMe 
    }, {
      skipAuth: true,
      skipAuthRefresh: true,
    })
    return response.data
  },

  googleLogin: async (idToken, rememberMe = false) => {
    const response = await api.post('/auth/google', {
      id_token: idToken,
      remember_me: rememberMe,
    })
    return response.data
  },

  logout: async (refreshToken, accessToken) => {
    const response = await api.post('/auth/logout', refreshToken ? {
      refresh_token: refreshToken,
    } : undefined, {
      skipAuthRefresh: true,
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    })
    return response.data
  },

  getMe: async () => {
    const response = await api.get('/auth/me')
    return response.data
  },

  changePassword: async (oldPassword, newPassword) => {
    const response = await api.post('/auth/change-password', {
      old_password: oldPassword,
      new_password: newPassword,
    })
    return response.data
  },

  refreshToken: async (refreshToken) => {
    const response = await api.post('/auth/refresh', {
      refresh_token: refreshToken,
    })
    return response.data
  },

  enable2FA: async (password) => {
    const formData = new FormData()
    formData.append('password', password)
    const response = await api.post('/auth/2fa/enable-2fa', formData)
    return response.data
  },

  disable2FA: async (password) => {
    const formData = new FormData()
    formData.append('password', password)
    const response = await api.post('/auth/2fa/disable-2fa', formData)
    return response.data
  },

  verify2FA: async (code) => {
    const formData = new FormData()
    formData.append('code', code)
    const response = await api.post('/auth/2fa/verify-2fa', formData)
    return response.data
  },

  forgotPassword: async (email) => {
    const formData = new FormData()
    formData.append('email', email)
    const response = await api.post('/auth/forgot-password', formData)
    return response.data
  },

  verifyResetToken: async (token) => {
    const response = await api.get(`/auth/verify-reset-token?token=${encodeURIComponent(token)}`)
    return response.data
  },

  resetPassword: async (token, newPassword) => {
    const formData = new FormData()
    formData.append('token', token)
    formData.append('new_password', newPassword)
    const response = await api.post('/auth/reset-password', formData)
    return response.data
  },

  updateNotificationPreferences: async (preferences) => {
    const response = await api.put('/auth/notification-preferences', preferences)
    return response.data
  },

  // ============================================================
  // ✅ FIXED: Avatar endpoints - match backend routes
  // ============================================================
  uploadAvatar: async (file) => {
    const formData = new FormData()
    formData.append('file', file) // ✅ Must match backend field name
    
    try {
      const response = await api.post('/files/avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      console.log('📤 Avatar upload response:', response.data)
      return response.data
    } catch (error) {
      console.error('❌ Avatar upload error:', error)
      throw error
    }
  },

  deleteAvatar: async () => {
    try {
      const response = await api.delete('/files/avatar')
      console.log('🗑️ Avatar delete response:', response.data)
      return response.data
    } catch (error) {
      console.error('❌ Avatar delete error:', error)
      throw error
    }
  },
}