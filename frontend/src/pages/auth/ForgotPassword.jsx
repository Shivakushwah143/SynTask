import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mail, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { authAPI } from '../../api/auth'
import toast from 'react-hot-toast'

const ForgotPassword = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  const handleRequestReset = async (e) => {
    e.preventDefault()
    if (!email) {
      toast.error('Please enter your email address')
      return
    }

    try {
      setLoading(true)
      const response = await authAPI.forgotPassword(email)
      
      toast.success(response.message || 'Password reset link has been sent to your email')
      
      // For development - show reset link
      if (response.reset_link) {
        console.log('Reset link for development:', response.reset_link)
        toast(`Reset Link: ${response.reset_link} (Dev mode)`, { 
          icon: '🔗',
          duration: 20000,
          style: {
            background: '#3b82f6',
            color: '#fff',
          }
        })
      }
      
      setEmailSent(true)
    } catch (error) {
      console.error('Request reset error:', error)
      
      // Handle FastAPI validation errors (422)
      let errorMessage = 'Failed to send reset link'
      
      if (error.response?.data) {
        const errorData = error.response.data
        
        // FastAPI validation errors come as an array of objects
        if (Array.isArray(errorData.detail)) {
          const firstError = errorData.detail[0]
          errorMessage = firstError?.msg || 'Validation error'
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail
        } else if (errorData.message) {
          errorMessage = errorData.message
        }
      } else if (error.message) {
        errorMessage = error.message
      }
      
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Back Button */}
      <button
        type="button"
        onClick={() => navigate('/login')}
        className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm font-medium transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Sign In
      </button>

      {!emailSent ? (
        <>
          {/* Header */}
          <div className="text-left">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Reset Password</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleRequestReset} className="space-y-4">
            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 pl-12 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin h-5 w-5" />
                  Sending...
                </>
              ) : (
                'Send Reset Link'
              )}
            </button>
          </form>
        </>
      ) : (
        <div className="flex flex-col gap-8 items-center">
          {/* Success Icon */}
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
          </div>

          {/* Success Message */}
          <div className="text-center">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Check your email</h3>
            <p className="text-gray-600 dark:text-gray-400">
              We've sent a password reset link to <strong className="font-semibold">{email}</strong>
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              The link will expire in 24 hours. If you don't see it, check your spam folder.
            </p>
          </div>

          {/* Actions */}
          <div className="w-full space-y-2">
            <button
              type="button"
              onClick={() => {
                setEmailSent(false)
                setEmail('')
              }}
              className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-400 text-gray-900 dark:text-white font-semibold rounded-lg transition-all duration-200"
            >
              Try another email
            </button>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-semibold rounded-lg transition-all duration-200"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ForgotPassword
    </div>
  )
}

export default ForgotPassword
