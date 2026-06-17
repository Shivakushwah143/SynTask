import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Lock, Loader2, ArrowLeft, CheckCircle2, AlertCircle, Eye, EyeOff, Shield } from 'lucide-react'
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
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
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
      <div className="flex flex-col gap-8 items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        <p className="text-gray-600 dark:text-gray-400">Verifying your reset link...</p>
      </div>
    )
  }

  if (!tokenValid || tokenError) {
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

        {/* Error Message */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Link Expired</h2>
          <p className="text-gray-600 dark:text-gray-400">{tokenError || 'This password reset link is invalid or has expired.'}</p>
        </div>

        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">
              This link may have expired or already been used. Please request a new password reset link.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Link
            to="/forgot-password"
            className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-200"
          >
            Request New Reset Link
          </Link>
          <Link
            to="/login"
            className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white font-semibold rounded-lg hover:border-purple-500 dark:hover:border-purple-400 transition-all duration-200 text-center"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    )
  }

  if (resetSuccess) {
    return (
      <div className="flex flex-col gap-8 items-center">
        {/* Success Icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
        </div>

        {/* Success Message */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Password Reset Complete</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Your password has been successfully reset. You'll be redirected to the login page soon.
          </p>
        </div>

        <Link
          to="/login"
          className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-200"
        >
          Go to Sign In
        </Link>
      </div>
    )
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

      {/* Header */}
      <div className="text-left">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Create New Password</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Enter your new password below. Make sure it's strong and secure.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleResetPassword} className="space-y-4">
        {/* New Password */}
        <div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-3 pl-12 pr-12 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Enter new password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Password must be at least 8 characters long
          </p>
        </div>

        {/* Confirm Password */}
        <div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-3 pl-12 pr-12 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Confirm new password"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {showConfirm ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-2">Passwords do not match</p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || newPassword.length < 8 || newPassword !== confirmPassword}
          className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin h-5 w-5" />
              Resetting Password...
            </>
          ) : (
            <>
              <Shield className="h-5 w-5" />
              Reset Password
            </>
          )}
        </button>
      </form>
    </div>
  )
}

export default ResetPassword


