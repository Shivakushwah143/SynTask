import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { PageHeader, Badge, Skeleton } from '../../components/ui';
import { hrDashboardApi } from '../../api/hrReports';
import { useAuthStore } from '../../store/authStore';
import { hasCompanyAdminAccess, isManagerRole } from '../../utils/roles';

// ── Colour palette (consistent with SynTask theme) ───────────────────────────
const COLORS = {
  present: '#22c55e',
  absent: '#ef4444',
  on_leave: '#f59e0b',
  half_day: '#f97316',
  holiday: '#8b5cf6',
  week_off: '#6366f1',
  in_progress: '#06b6d4',
  no_record: '#94a3b8',
  primary: '#6366f1',
  secondary: '#8b5cf6',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#06b6d4',
};

const PIE_COLORS = [
  COLORS.present, COLORS.absent, COLORS.on_leave, COLORS.half_day,
  COLORS.holiday, COLORS.week_off, COLORS.in_progress, COLORS.no_record,
];

// ── Metric Card ──────────────────────────────────────────────────────────────
function MetricCard({ label, value, sublabel, color = 'text-text-primary', link, loading }) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-surface-border bg-surface p-5 dark:border-gray-800 dark:bg-gray-950">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-8 w-16" />
      </div>
    );
  }
  const content = (
    <div className="rounded-2xl border border-surface-border bg-surface p-5 transition hover:-translate-y-0.5 hover:shadow-card dark:border-gray-800 dark:bg-gray-950">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${color}`}>{value ?? '—'}</p>
      {sublabel && <p className="mt-1 text-xs text-text-muted">{sublabel}</p>}
    </div>
  );
  return link ? <Link to={link}>{content}</Link> : content;
}

// ── Section Error Boundary ───────────────────────────────────────────────────
function SectionFallback({ name, error }) {
  return (
    <div className="rounded-2xl border border-dashed border-yellow-300 bg-yellow-50/50 p-6 text-center dark:border-yellow-800 dark:bg-yellow-950/20">
      <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">{name} unavailable</p>
      <p className="mt-1 text-xs text-yellow-600/70 dark:text-yellow-400/60">Please try again later.</p>
    </div>
  );
}

// ── Attention Items Panel ────────────────────────────────────────────────────
function AttentionPanel({ items, loading }) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-surface-border bg-surface p-6 dark:border-gray-800 dark:bg-gray-950">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      </div>
    );
  }
  if (!items || items.length === 0) {
    return (
      <div className="rounded-2xl border border-surface-border bg-surface p-6 text-center dark:border-gray-800 dark:bg-gray-950">
        <p className="text-sm text-text-muted">No items need attention.</p>
      </div>
    );
  }

  const severityColor = {
    critical: 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20',
    warning: 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20',
    info: 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20',
  };

  return (
    <div className="rounded-2xl border border-surface-border bg-surface p-6 dark:border-gray-800 dark:bg-gray-950">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Needs Attention</h3>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <Link
            key={idx}
            to={item.route}
            className={`flex items-center justify-between rounded-xl border-l-4 px-4 py-3 transition hover:opacity-80 ${severityColor[item.severity] || severityColor.info}`}
          >
            <span className="text-sm font-medium text-text-primary">{item.label}</span>
            <span className="text-xs font-semibold text-text-muted">{item.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Donut Chart for Attendance ────────────────────────────────────────────────
function AttendanceDonut({ data, loading }) {
  if (loading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (!data) return null;

  const chartData = [
    { name: 'Present', value: data.present || 0, color: COLORS.present },
    { name: 'On Leave', value: data.on_leave || 0, color: COLORS.on_leave },
    { name: 'Absent', value: data.absent || 0, color: COLORS.absent },
    { name: 'Half Day', value: data.half_day || 0, color: COLORS.half_day },
    { name: 'Holiday', value: data.holiday || 0, color: COLORS.holiday },
    { name: 'Week Off', value: data.week_off || 0, color: COLORS.week_off },
    { name: 'In Progress', value: data.in_progress || 0, color: COLORS.in_progress },
  ].filter(d => d.value > 0);

  if (chartData.length === 0) {
    return (
      <div className="rounded-2xl border border-surface-border bg-surface p-6 dark:border-gray-800 dark:bg-gray-950">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Attendance Today</h3>
        <p className="text-sm text-text-muted text-center py-8">No attendance data for today.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-surface-border bg-surface p-6 dark:border-gray-800 dark:bg-gray-950">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Attendance Today</h3>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => <span className="text-xs text-text-muted">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Bar Chart for Department Distribution ─────────────────────────────────────
function DepartmentBar({ data, loading }) {
  if (loading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (!data || data.length === 0) return null;

  return (
    <div className="rounded-2xl border border-surface-border bg-surface p-6 dark:border-gray-800 dark:bg-gray-950">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Headcount by Department</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data.slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis dataKey="department" type="category" width={120} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="count" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Bar Chart for Leave Usage by Type ────────────────────────────────────────
function LeaveUsageBar({ data, loading }) {
  if (loading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (!data || data.length === 0) return null;

  return (
    <div className="rounded-2xl border border-surface-border bg-surface p-6 dark:border-gray-800 dark:bg-gray-950">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Leave Usage by Type (This Month)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="type" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="units" fill={COLORS.secondary} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Payroll Summary Card ─────────────────────────────────────────────────────
function PayrollCard({ data, loading }) {
  if (loading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (!data) return null;

  const statusColors = {
    processed: 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-200',
    approved: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-200',
    draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
    calculated: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200',
  };

  return (
    <div className="rounded-2xl border border-surface-border bg-surface p-6 dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-primary">Latest Payroll</h3>
        {data.latest_period_status && (
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[data.latest_period_status] || statusColors.draft}`}>
            {data.latest_period_status}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <div>
          <p className="text-xs text-text-muted">Period</p>
          <p className="text-lg font-bold text-text-primary">{data.latest_period_label}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Employees</p>
          <p className="text-lg font-bold text-text-primary">{data.employee_count}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Net Payroll</p>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {data.currency} {Number(data.total_net).toLocaleString()}
          </p>
        </div>
      </div>
      <Link to="/hr/payroll" className="mt-4 inline-block text-xs font-medium text-primary-600 hover:underline">
        View Payroll →
      </Link>
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────
export default function HRDashboard() {
  const { user } = useAuthStore();
  const [hasPayrollAccess, setHasPayrollAccess] = useState(false);

  useEffect(() => {
    if (!user) return;
    const role = user.role;
    const capabilities = new Set(user.capabilities || user.permissions || []);
    setHasPayrollAccess(
      capabilities.has('payroll.view') || hasCompanyAdminAccess(role)
    );
  }, [user]);

  const {
    data: dashboard,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['hr-dashboard'],
    queryFn: async () => {
      const res = await hrDashboardApi.getDashboard();
      return res.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: 1,
  });

  if (error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader
          title="HR Dashboard"
          description="People operations overview"
        />
        <div className="mt-8 rounded-2xl border border-dashed border-red-300 bg-red-50/50 p-12 text-center dark:border-red-800 dark:bg-red-950/20">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">Failed to load HR Dashboard</p>
          <p className="mt-2 text-xs text-red-600/70 dark:text-red-400/60">Please check your connection and try again.</p>
        </div>
      </div>
    );
  }

  const emp = dashboard?.employee_summary || {};
  const att = dashboard?.attendance_today || {};
  const leave = dashboard?.leave_summary || {};
  const docs = dashboard?.document_summary || {};
  const life = dashboard?.lifecycle_summary || {};
  const recruitment = dashboard?.recruitment_summary;
  const payroll = dashboard?.payroll_summary;
  const attention = dashboard?.attention_items || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="HR Dashboard"
        description="People operations overview — what needs your attention right now."
      />

      {/* ── Top Metric Cards ────────────────────────────────────────────── */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <MetricCard
          label="Total Employees"
          value={emp.total}
          sublabel={`${emp.active || 0} active`}
          color="text-text-primary"
          link="/hr/employees"
          loading={isLoading}
        />
        <MetricCard
          label="Present Today"
          value={att.present}
          sublabel={att.date ? `as of ${att.date}` : ''}
          color="text-emerald-600 dark:text-emerald-400"
          link="/attendance"
          loading={isLoading}
        />
        <MetricCard
          label="On Leave Today"
          value={att.on_leave}
          sublabel={`${leave.pending_requests || 0} pending`}
          color="text-amber-600 dark:text-amber-400"
          link="/leaves"
          loading={isLoading}
        />
        <MetricCard
          label="Expiring Documents"
          value={(docs.expired || 0) + (docs.expiring_soon || 0)}
          sublabel={`${docs.expired || 0} expired, ${docs.expiring_soon || 0} soon`}
          color="text-rose-600 dark:text-rose-400"
          link="/hr/documents"
          loading={isLoading}
        />
      </div>

      {/* ── Second Row Metric Cards ──────────────────────────────────────── */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <MetricCard
          label="Probation"
          value={emp.probation || 0}
          sublabel={`${life.confirmations_due || 0} confirmations due`}
          color="text-indigo-600 dark:text-indigo-400"
          link="/hr/employees"
          loading={isLoading}
        />
        <MetricCard
          label="Notice Period"
          value={emp.notice_period || 0}
          sublabel={`${life.upcoming_exits || 0} upcoming exits`}
          color="text-orange-600 dark:text-orange-400"
          link="/hr/employees"
          loading={isLoading}
        />
        {recruitment && (
          <MetricCard
            label="Open Positions"
            value={recruitment.open_jobs}
            sublabel={`${recruitment.total_candidates || 0} candidates`}
            color="text-sky-600 dark:text-sky-400"
            link="/hr/recruitment"
            loading={isLoading}
          />
        )}
        {hasPayrollAccess && payroll && (
          <MetricCard
            label="Payroll Status"
            value={payroll.latest_period_status === 'processed' ? 'Processed' : payroll.latest_period_status || '—'}
            sublabel={payroll.latest_period_label || ''}
            color="text-emerald-600 dark:text-emerald-400"
            link="/hr/payroll"
            loading={isLoading}
          />
        )}
      </div>

      {/* ── Charts Row ───────────────────────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2">
        <AttendanceDonut data={att} loading={isLoading} />
        <DepartmentBar data={emp.department_distribution} loading={isLoading} />
      </div>

      {/* ── Leave & Attention Row ─────────────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2">
        <LeaveUsageBar data={leave.leave_by_type} loading={isLoading} />
        <AttentionPanel items={attention} loading={isLoading} />
      </div>

      {/* ── Payroll Summary (authorized users only) ──────────────────────── */}
      {hasPayrollAccess && (
        <PayrollCard data={payroll} loading={isLoading} />
      )}

      {/* ── Quick Links ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-surface-border bg-surface p-6 dark:border-gray-800 dark:bg-gray-950">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'Employees', href: '/hr/employees' },
            { label: 'Documents', href: '/hr/documents' },
            { label: 'Recruitment', href: '/hr/recruitment' },
            { label: 'Attendance', href: '/attendance' },
            { label: 'Leave', href: '/leaves' },
            { label: 'Reports', href: '/hr/reports' },
            ...(hasPayrollAccess ? [{ label: 'Payroll', href: '/hr/payroll' }] : []),
          ].map(link => (
            <Link
              key={link.href}
              to={link.href}
              className="rounded-xl border border-surface-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition hover:border-primary-300 hover:text-primary-600 dark:border-gray-800 dark:bg-gray-950"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
