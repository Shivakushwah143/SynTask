import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mail, Loader2, ArrowLeft } from 'lucide-react'
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
    <div>
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Login
        </button>
        <h2 className="text-2xl font-bold text-gray-900">Forgot Password</h2>
        <p className="text-gray-600 mt-1">
          {emailSent 
            ? 'Check your email for password reset instructions' 
            : 'Enter your registered email address to receive a password reset link'}
        </p>
      </div>

      {!emailSent ? (
        <form onSubmit={handleRequestReset} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input pl-10"
                placeholder="your@email.com"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full flex items-center justify-center"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin mr-2 h-5 w-5" />
                Sending...
              </>
            ) : (
              'Send Reset Link'
            )}
          </button>
        </form>
      ) : (
        <div className="text-center space-y-4">
          <div className="p-4 bg-green-50 rounded-lg">
            <p className="text-sm text-green-800">
              A password reset link has been sent to <strong>{email}</strong>
            </p>
            <p className="text-xs text-green-600 mt-2">
              Please check your email and click the link to reset your password.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEmailSent(false)
              setEmail('')
            }}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            Send another email
          </button>
        </div>
      )}

      <div className="mt-6 text-center">
        <Link to="/login" className="text-sm text-primary-600 hover:text-primary-700">
          Back to Login
        </Link>
      </div>
    </div>
  )
}

export default ForgotPassword
