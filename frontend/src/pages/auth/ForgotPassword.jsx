import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { authAPI } from '../../api/auth'
import { Button, inputClassName } from '../../components/ui'

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

      if (response.reset_link) {
        console.log('Reset link for development:', response.reset_link)
        toast(`Reset Link: ${response.reset_link} (Dev mode)`, {
          icon: '🔗',
          duration: 20000,
          style: { background: '#3b82f6', color: '#fff' },
        })
      }

      setEmailSent(true)
    } catch (error) {
      console.error('Request reset error:', error)

      let errorMessage = 'Failed to send reset link'
      if (error.response?.data) {
        const errorData = error.response.data
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
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate('/login')}
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to sign in
      </button>

      {!emailSent ? (
        <>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-600">Reset access</p>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">Reset password</h2>
            <p className="max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
              Enter your email address and we&apos;ll send you a secure reset link.
            </p>
          </div>

          <form onSubmit={handleRequestReset} className="space-y-4">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={`${inputClassName} pl-11`}
                placeholder="Enter your email"
              />
            </div>

            <Button type="submit" loading={loading} className="w-full" size="lg">
              Send reset link
            </Button>
          </form>
        </>
      ) : (
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Check your email</h3>
            <p className="text-sm leading-6 text-gray-600 dark:text-gray-400">
              We&apos;ve sent a password reset link to <strong>{email}</strong>.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              The link will expire in 24 hours. If you don&apos;t see it, check your spam folder.
            </p>
          </div>
          <div className="space-y-3">
            <Button type="button" variant="secondary" className="w-full" onClick={() => { setEmailSent(false); setEmail('') }}>
              Try another email
            </Button>
            <Link
              to="/login"
              className="flex w-full items-center justify-center rounded-xl bg-primary-600 px-4 py-3 font-medium text-white transition-colors hover:bg-primary-700"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

export default ForgotPassword
