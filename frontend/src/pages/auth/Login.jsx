import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mail, Lock, Shield } from 'lucide-react'
import toast from 'react-hot-toast'
import { authAPI } from '../../api/auth'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import { Button, PasswordInput, inputClassName } from '../../components/ui'
import GoogleLoginButton from '../../components/auth/GoogleLoginButton'

const Login = () => {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    remember_me: false,
  })

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    useUIStore.getState().setLoading(true)

    try {
      const response = await authAPI.login(formData.email, formData.password, formData.remember_me)
      setAuth(response.user, response.access_token, response.refresh_token, formData.remember_me)
      toast.success('Login successful!')
      navigate('/dashboard')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
      useUIStore.getState().setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-600">Welcome back</p>
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">Sign in to SynTask</h2>
        <p className="max-w-md text-sm leading-6 text-gray-600 dark:text-gray-400">
          Continue to your workspace, reviews, and operational workflows.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className={`${inputClassName} pl-11`}
            placeholder="Enter your email"
          />
        </div>

        <PasswordInput
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            className={inputClassName}
            placeholder="Enter your password"
            leftIcon={<Lock className="h-5 w-5" aria-hidden="true" />}
          />

        <div className="flex items-center justify-between gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              id="remember_me"
              name="remember_me"
              checked={formData.remember_me}
              onChange={handleChange}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Remember me
          </label>
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-primary-600 transition-colors hover:text-primary-700"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" loading={loading} className="w-full" size="lg">
          <Shield className="h-5 w-5" />
          Sign in
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-surface-border" />
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">or</span>
        <div className="h-px flex-1 bg-surface-border" />
      </div>

      <GoogleLoginButton rememberMe={formData.remember_me} onSuccess={() => navigate('/dashboard')} />

      <Link
        to="/admin-request"
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-surface-border bg-white px-4 py-3 font-semibold text-gray-900 transition-colors hover:border-primary-300 hover:bg-gray-50 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900"
      >
        <span aria-hidden="true">👤</span>
        Request admin account
      </Link>

      <p className="text-center text-sm text-gray-600 dark:text-gray-400">
        Need access? Request an account from your admin.
      </p>

      <div className="flex gap-3 rounded-2xl border border-primary-100 bg-primary-50/70 p-4 dark:border-primary-900/40 dark:bg-primary-950/30">
        <Shield className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary-600 dark:text-primary-300" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Secure enterprise access</h3>
          <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-400">
            Protected with modern authentication and role-based permissions.
          </p>
        </div>
      </div>
    </div>
  )
}

export default Login
