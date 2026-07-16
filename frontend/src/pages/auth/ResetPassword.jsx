import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Lock, Loader2, ArrowLeft, CheckCircle2, AlertCircle, Shield } from 'lucide-react'
import toast from 'react-hot-toast'
import { authAPI } from '../../api/auth'
import { Button, PasswordInput, inputClassName } from '../../components/ui'

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
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        <p className="text-sm text-gray-600 dark:text-gray-400">Verifying your reset link...</p>
      </div>
    )
  }

  if (!tokenValid || tokenError) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </button>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-600">Reset link</p>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">Link expired</h2>
          <p className="text-sm leading-6 text-gray-600 dark:text-gray-400">
            {tokenError || 'This password reset link is invalid or has expired.'}
          </p>
        </div>

        <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-300" />
          <p className="text-sm text-red-700 dark:text-red-300">
            This link may have expired or already been used. Please request a new reset link.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            to="/forgot-password"
            className="flex w-full items-center justify-center rounded-xl bg-primary-600 px-4 py-3 font-medium text-white transition-colors hover:bg-primary-700"
          >
            Request new reset link
          </Link>
          <Link
            to="/login"
            className="flex w-full items-center justify-center rounded-xl border border-surface-border bg-white px-4 py-3 font-medium text-gray-900 transition-colors hover:bg-gray-50 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  if (resetSuccess) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">Password reset complete</h2>
          <p className="text-sm leading-6 text-gray-600 dark:text-gray-400">
            Your password has been successfully reset. You&apos;ll be redirected to the login page soon.
          </p>
        </div>
        <Link
          to="/login"
          className="flex w-full items-center justify-center rounded-xl bg-primary-600 px-4 py-3 font-medium text-white transition-colors hover:bg-primary-700"
        >
          Go to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate('/login')}
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to sign in
      </button>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-600">Set new password</p>
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">Create new password</h2>
        <p className="max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
          Enter a strong password and confirm it to restore access.
        </p>
      </div>

      <form onSubmit={handleResetPassword} className="space-y-4">
        <PasswordInput
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            className={inputClassName}
            placeholder="Enter new password"
            leftIcon={<Lock className="h-5 w-5" aria-hidden="true" />}
          />
        <p className="text-xs text-gray-500 dark:text-gray-400">Password must be at least 8 characters long.</p>

        <PasswordInput
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            className={inputClassName}
            placeholder="Confirm new password"
            leftIcon={<Lock className="h-5 w-5" aria-hidden="true" />}
            toggleLabel="password confirmation"
          />
        {confirmPassword && newPassword !== confirmPassword ? (
          <p className="text-xs text-red-500 dark:text-red-400">Passwords do not match.</p>
        ) : null}

        <Button
          type="submit"
          loading={loading}
          disabled={newPassword.length < 8 || newPassword !== confirmPassword}
          className="w-full"
          size="lg"
        >
          <Shield className="h-5 w-5" />
          Reset password
        </Button>
      </form>
    </div>
  )
}

export default ResetPassword
