import { AlertCircle, Briefcase, UserRound } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'
import { useMyProfile } from '../../../hooks/useMyHr'
import { hasCompanyAdminAccess } from '../../../utils/roles'
import { useAuthStore } from '../../../store/authStore'
import { Skeleton } from '../../../components/ui'
import { EMPLOYMENT_STATUS_BADGES, EMPLOYMENT_STATUS_LABELS } from './myHrUtils'

/**
 * My HR shell — the employee-facing HR workspace header.
 * The in-page tab bar (Overview | My Profile | My Attendance | My Leave |
 * My Documents | My Payslips) comes from SectionTabs via the shared
 * navigation config; this layout only adds the employee context header and
 * the graceful "profile not set up" guard.
 */
const MyHRLayout = () => {
  const { user } = useAuthStore()
  const { data: profile, isLoading, isError, error } = useMyProfile()

  if (isLoading) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError || !profile) {
    const is404 = error?.response?.status === 404
    const isAdmin = hasCompanyAdminAccess(user?.role)
    return (
      <div className="p-4 md:p-6">
        <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
            <UserRound className="h-7 w-7 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {is404 ? 'Employee profile not available' : 'Unable to load your employee profile'}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
            {is404
              ? 'Your HR employee profile has not been set up yet. Please contact your administrator.'
              : 'Something went wrong while loading your HR profile. Please try again.'}
          </p>
          {isAdmin && (
            <Link
              to="/hr/employees"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
            >
              <Briefcase className="h-4 w-4" /> Open People → Employees
            </Link>
          )}
          {!is404 && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <AlertCircle className="h-4 w-4" /> Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  const statusBadge = EMPLOYMENT_STATUS_BADGES[profile.employment_status] || EMPLOYMENT_STATUS_BADGES.active

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Employee context header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center">
          {profile.avatar ? (
            <img
              src={profile.avatar}
              alt={profile.full_name}
              className="h-16 w-16 shrink-0 rounded-2xl border-2 border-white/30 object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-xl font-bold backdrop-blur-sm">
              {profile.full_name?.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold md:text-3xl">{profile.full_name}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge}`}>
                {EMPLOYMENT_STATUS_LABELS[profile.employment_status] || profile.employment_status}
              </span>
            </div>
            <p className="mt-1 text-indigo-100">
              {profile.employee_number || 'Employee'}
              {profile.designation ? ` · ${profile.designation}` : ''}
              {profile.department_name ? ` · ${profile.department_name}` : ''}
            </p>
          </div>
        </div>
      </div>

      <Outlet />
    </div>
  )
}

export default MyHRLayout
