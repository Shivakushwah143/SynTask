import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Lock, Loader2, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react'
import { authAPI } from '../../api/auth'
import toast from 'react-hot-toast'

const ResetPassword = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)
  const [tokenError, setTokenError] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)

  // Verify token on component mount
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setTokenError('Invalid or expired link.')
        setVerifying(false)
        return
      }

      try {
        await authAPI.verifyResetToken(token)
        setTokenValid(true)
        setTokenError('')
      } catch (error) {
        console.error('Token verification error:', error)
        
        let errorMessage = 'Invalid or expired link.'
        
        if (error.response?.data) {
          const errorData = error.response.data
          
          if (Array.isArray(errorData.detail)) {
            const firstError = errorData.detail[0]
            errorMessage = firstError?.msg || 'Invalid or expired link.'
          } else if (typeof errorData.detail === 'string') {
            errorMessage = errorData.detail
          }
        }
        
        setTokenError(errorMessage)
        setTokenValid(false)
      } finally {
        setVerifying(false)
      }
    }

    verifyToken()
  }, [token])

  const handleResetPassword = async (e) => {
    e.preventDefault()
    
    if (!newPassword || newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long')
      return
    }
    
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    try {
      setLoading(true)
      const response = await authAPI.resetPassword(token, newPassword)
      toast.success(response.message || 'Password reset successfully!')
      setResetSuccess(true)
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login')
      }, 3000)
    } catch (error) {
      console.error('Reset password error:', error)
      
      let errorMessage = 'Failed to reset password'
      
      if (error.response?.data) {
        const errorData = error.response.data
        
        if (Array.isArray(errorData.detail)) {
          const firstError = errorData.detail[0]
          errorMessage = firstError?.msg || 'Failed to reset password'
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail
        }
      }
      
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  if (verifying) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Reset Password</h2>
          <p className="text-gray-600 mt-1">Verifying reset link...</p>
        </div>
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      </div>
    )
  }

  if (!tokenValid || tokenError) {
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
          <h2 className="text-2xl font-bold text-gray-900">Invalid Reset Link</h2>
        </div>
        
        <div className="p-4 bg-red-50 rounded-lg mb-6">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-red-600 mr-2 mt-0.5" />
            <div>
              <p className="text-sm text-red-800 font-medium">{tokenError || 'Invalid or expired link.'}</p>
              <p className="text-xs text-red-600 mt-1">
                This link may have expired or already been used. Please request a new password reset link.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Link
            to="/forgot-password"
            className="btn btn-primary w-full flex items-center justify-center"
          >
            Request New Reset Link
          </Link>
          <Link
            to="/login"
            className="block text-center text-sm text-primary-600 hover:text-primary-700"
          >
            Back to Login
          </Link>
        </div>
      </div>
    )
  }

  if (resetSuccess) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Password Reset Successful</h2>
        </div>
        
        <div className="p-4 bg-green-50 rounded-lg mb-6">
          <div className="flex items-start">
            <CheckCircle2 className="h-5 w-5 text-green-600 mr-2 mt-0.5" />
            <div>
              <p className="text-sm text-green-800 font-medium">
                Your password has been successfully reset. Please log in with your new password.
              </p>
              <p className="text-xs text-green-600 mt-2">
                Redirecting to login page...
              </p>
            </div>
          </div>
        </div>

        <Link
          to="/login"
          className="btn btn-primary w-full flex items-center justify-center"
        >
          Go to Login
        </Link>
      </div>
    )
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
        <h2 className="text-2xl font-bold text-gray-900">Reset Password</h2>
        <p className="text-gray-600 mt-1">
          Enter your new password below
        </p>
      </div>

      <form onSubmit={handleResetPassword} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            New Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="input pl-10"
              placeholder="Enter new password"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Password must be at least 8 characters long
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Confirm Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="input pl-10"
              placeholder="Confirm new password"
            />
          </div>
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || newPassword.length < 8 || newPassword !== confirmPassword}
          className="btn btn-primary w-full flex items-center justify-center"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin mr-2 h-5 w-5" />
              Resetting Password...
            </>
          ) : (
            'Reset Password'
          )}
        </button>
      </form>

      <div className="mt-6 text-center">
        <Link to="/login" className="text-sm text-primary-600 hover:text-primary-700">
          Back to Login
        </Link>
      </div>
    </div>
  )
}

export default ResetPassword


