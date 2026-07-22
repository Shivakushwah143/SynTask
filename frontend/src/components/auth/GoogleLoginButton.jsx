import { useState } from 'react'
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google'
import { Chrome, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { authAPI } from '../../api/auth'
import { useAuthStore } from '../../store/authStore'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

const GoogleLoginContent = ({ className = '', rememberMe = false, onSuccess }) => {
  const { setAuth } = useAuthStore()
  const [loading, setLoading] = useState(false)

  return (
    <div className={className}>
      <GoogleLogin
        onSuccess={async (credentialResponse) => {
          setLoading(true)
          try {
            const idToken = credentialResponse?.credential
            if (!idToken) {
              throw new Error('Missing Google credential')
            }
            const response = await authAPI.googleLogin(idToken, rememberMe)
            setAuth(response.user, response.access_token, response.refresh_token, rememberMe)
            toast.success('Google sign-in successful')
            onSuccess?.(response)
          } catch (error) {
            toast.error(error.response?.data?.detail || error.message || 'Google sign-in failed')
          } finally {
            setLoading(false)
          }
        }}
        onError={() => toast.error('Google sign-in failed')}
        useOneTap={false}
        logo_alignment="center"
        text="signin_with"
      />
      {loading ? <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Signing in...</div> : null}
    </div>
  )
}

const GoogleLoginButton = (props) => {
  if (!GOOGLE_CLIENT_ID) {
    return (
      <button
        type="button"
        disabled
        className={`flex min-h-11 w-full items-center justify-center rounded-xl border border-surface-border bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500 ${props.className || ''}`}
      >
        Google sign-in unavailable
      </button>
    )
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <GoogleLoginContent {...props} />
    </GoogleOAuthProvider>
  )
}

export default GoogleLoginButton
