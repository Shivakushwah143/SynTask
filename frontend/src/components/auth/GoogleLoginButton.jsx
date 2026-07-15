import { useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import toast from 'react-hot-toast'
import { authAPI } from '../../api/auth'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

const GoogleLoginButton = ({ rememberMe = false, onSuccess, className = '' }) => {
  const { setAuth } = useAuthStore()
  const [loading, setLoading] = useState(false)

  const handleGoogleSuccess = async (credentialResponse) => {
    const idToken = credentialResponse?.credential
    if (!idToken) {
      toast.error('Google did not return a valid sign-in token')
      return
    }

    setLoading(true)
    useUIStore.getState().setLoading(true)
    try {
      const response = await authAPI.googleLogin(idToken, rememberMe)
      setAuth(response.user, response.access_token, response.refresh_token, rememberMe)
      toast.success('Google login successful!')
      onSuccess?.(response)
    } catch (error) {
      const message = error.response?.data?.detail || error.message || 'Google login failed'
      toast.error(message)
    } finally {
      setLoading(false)
      useUIStore.getState().setLoading(false)
    }
  }

  if (!GOOGLE_CLIENT_ID) {
    return (
      <button
        type="button"
        disabled
        className={`flex min-h-11 w-full items-center justify-center rounded-xl border border-surface-border bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500 ${className}`}
      >
        Google sign-in unavailable
      </button>
    )
  }

  return (
    <div className={`relative ${loading ? 'pointer-events-none opacity-70' : ''} ${className}`}>
      <GoogleLogin
        onSuccess={handleGoogleSuccess}
        onError={() => toast.error('Google verification failed')}
        text="continue_with"
        shape="rectangular"
        size="large"
        theme="outline"
        width="100%"
        useOneTap={false}
      />
    </div>
  )
}

export default GoogleLoginButton
