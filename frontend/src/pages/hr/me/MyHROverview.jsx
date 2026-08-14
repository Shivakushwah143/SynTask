import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  RefreshCw,
  UserRound,
  Wallet,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMySummary } from '../../../hooks/useMyHr'
import { Button, EmptyState, Skeleton } from '../../../components/ui'
import { HR_STATUS_META } from '../../../features/attendance/attendanceStatus'
import {
  EMPLOYMENT_STATUS_BADGES,
  EMPLOYMENT_STATUS_LABELS,
  formatCurrency,
  formatDate,
  formatDuration,
  formatTime,
} from './myHrUtils'

const MyHROverview = () => {
  const { data: summary, isLoading, isError, error, refetch } = useMySummary()

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-44 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !summary) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Unable to load your HR overview"
        description={error?.response?.data?.detail || 'Please try again in a moment.'}
        action={<Button variant="secondary" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Retry</Button>}
      />
    )
  }

  const profile = summary.profile || {}
  const attendance = summary.attendance_today || {}
  const leave = summary.leave || { balances: [], pending_count: 0 }
  const documents = summary.documents || { total: 0, expiring_soon: 0, expired: 0 }
  const payslip = summary.latest_payslip || null
  const hrStatusMeta = HR_STATUS_META[attendance.hr_status] || HR_STATUS_META.no_record
  const statusBadge = EMPLOYMENT_STATUS_BADGES[profile.employment_status] || EMPLOYMENT_STATUS_BADGES.active

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* Profile */}
        <OverviewCard
          title="Profile"
          icon={UserRound}
          to="/hr/me/profile"
        >
          <div className="flex items-center gap-3">
            {profile.avatar ? (
              <img src={profile.avatar} alt="" className="h-11 w-11 rounded-xl object-cover" />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-sm font-bold text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
                {profile.full_name?.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-900 dark:text-white">{profile.full_name}</p>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                {profile.employee_number || 'No employee number'}
              </p>
            </div>
            <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadge}`}>
              {EMPLOYMENT_STATUS_LABELS[profile.employment_status] || profile.employment_status}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-gray-400">Department</p>
              <p className="font-medium text-gray-700 dark:text-gray-300">{profile.department_name || '-'}</p>
            </div>
            <div>
              <p className="text-gray-400">Designation</p>
              <p className="truncate font-medium text-gray-700 dark:text-gray-300">{profile.designation || '-'}</p>
            </div>
            <div>
              <p className="text-gray-400">Manager</p>
              <p className="truncate font-medium text-gray-700 dark:text-gray-300">{profile.manager_name || '-'}</p>
            </div>
            <div>
              <p className="text-gray-400">Joined</p>
              <p className="font-medium text-gray-700 dark:text-gray-300">{formatDate(profile.joining_date)}</p>
            </div>
          </div>
        </OverviewCard>

        {/* Attendance today */}
        <OverviewCard
          title="Attendance Today"
          icon={Clock}
          to="/hr/me/attendance"
        >
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${hrStatusMeta.badge}`}>
              <hrStatusMeta.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">{hrStatusMeta.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {attendance.is_holiday && attendance.holiday_name
                  ? `${attendance.holiday_name} (holiday)`
                  : attendance.is_week_off
                    ? 'Week off'
                    : `${formatDate(attendance.attendance_date)}`}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-gray-50 px-2 py-2 dark:bg-gray-900/50">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Check-in</p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{formatTime(attendance.check_in_at)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 px-2 py-2 dark:bg-gray-900/50">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Check-out</p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{formatTime(attendance.check_out_at)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 px-2 py-2 dark:bg-gray-900/50">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Worked</p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{formatDuration(attendance.total_work_seconds)}</p>
            </div>
          </div>
        </OverviewCard>

        {/* Leave balance */}
        <OverviewCard
          title="Leave Balance"
          icon={CalendarDays}
          to="/hr/me/leave"
          badge={leave.pending_count > 0 ? `${leave.pending_count} pending` : null}
        >
          {leave.balances.length === 0 ? (
            <p className="text-sm text-gray-400">No leave types available.</p>
          ) : (
            <div className="space-y-2">
              {leave.balances.slice(0, 4).map((balance) => (
                <div key={balance.leave_type_id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">{balance.name}</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {balance.available}<span className="ml-1 text-xs font-normal text-gray-400">days left</span>
                  </span>
                </div>
              ))}
              {leave.balances.length > 4 && (
                <p className="text-xs text-gray-400">+{leave.balances.length - 4} more types</p>
              )}
            </div>
          )}
        </OverviewCard>

        {/* Documents */}
        <OverviewCard
          title="My Documents"
          icon={FileText}
          to="/hr/me/documents"
        >
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-gray-50 px-2 py-3 dark:bg-gray-900/50">
              <p className="text-xl font-bold text-gray-900 dark:text-white">{documents.total}</p>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Total</p>
            </div>
            <div className="rounded-lg bg-amber-50 px-2 py-3 dark:bg-amber-950/30">
              <p className="text-xl font-bold text-amber-700 dark:text-amber-300">{documents.expiring_soon}</p>
              <p className="text-[10px] uppercase tracking-wide text-amber-500">Expiring</p>
            </div>
            <div className="rounded-lg bg-red-50 px-2 py-3 dark:bg-red-950/30">
              <p className="text-xl font-bold text-red-700 dark:text-red-300">{documents.expired}</p>
              <p className="text-[10px] uppercase tracking-wide text-red-500">Expired</p>
            </div>
          </div>
        </OverviewCard>

        {/* Latest payslip */}
        <OverviewCard
          title="Latest Payslip"
          icon={Wallet}
          to="/hr/me/payslips"
        >
          {payslip ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {payslip.period?.label || `${payslip.month || ''} ${payslip.year || ''}`.trim() || 'Payslip'}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Net: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{formatCurrency(payslip.net)}</span>
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-400 dark:bg-gray-800">
                <Clock className="h-5 w-5" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">No Payslips have been generated yet.</p>
            </div>
          )}
        </OverviewCard>
      </div>
    </div>
  )
}

function OverviewCard({ title, icon: Icon, to, badge, children }) {
  return (
    <Link
      to={to}
      className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {badge ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {badge}
            </span>
          ) : null}
          <ArrowRight className="h-4 w-4 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </Link>
  )
}

export default MyHROverview
