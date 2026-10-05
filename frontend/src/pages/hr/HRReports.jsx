import { useState, useCallback, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from 'react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import { PageHeader, Badge, Skeleton, Table } from '../../components/ui';
import { hrReportsApi, hrExportsApi } from '../../api/hrReports';
import { departmentsAPI } from '../../api/departments';
import { useAuthStore } from '../../store/authStore';
import { hasCompanyAdminAccess } from '../../utils/roles';
import { downloadBlob } from '../../utils/download';

const COLORS = {
  primary: '#6366f1',
  secondary: '#8b5cf6',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
};

// ── Report Category Sidebar ──────────────────────────────────────────────────
const REPORT_CATEGORIES = [
  {
    id: 'employees',
    label: 'Employees',
    reports: [
      { id: 'directory', label: 'Employee Directory', path: '/hr/reports/employees/directory' },
      { id: 'headcount', label: 'Headcount', path: '/hr/reports/employees/headcount' },
      { id: 'joining-exit', label: 'Joining / Exit Trend', path: '/hr/reports/employees/joining-exit' },
    ],
  },
  {
    id: 'attendance',
    label: 'Attendance',
    reports: [
      { id: 'summary', label: 'Attendance Summary', path: '/hr/reports/attendance/summary' },
      { id: 'late', label: 'Late Arrival', path: '/hr/reports/attendance/late' },
      { id: 'absence', label: 'Absence', path: '/hr/reports/attendance/absence' },
    ],
  },
  {
    id: 'leave',
    label: 'Leave',
    reports: [
      { id: 'balances', label: 'Leave Balances', path: '/hr/reports/leave/balances' },
      { id: 'usage', label: 'Leave Usage', path: '/hr/reports/leave/usage' },
    ],
  },
  {
    id: 'documents',
    label: 'Documents',
    reports: [
      { id: 'expiry', label: 'Document Expiry', path: '/hr/reports/documents/expiry' },
    ],
  },
  {
    id: 'lifecycle',
    label: 'Lifecycle',
    reports: [
      { id: 'events', label: 'Lifecycle Events', path: '/hr/reports/lifecycle/events' },
      { id: 'probation', label: 'Probation / Confirmation', path: '/hr/reports/lifecycle/probation' },
      { id: 'notice', label: 'Notice Period', path: '/hr/reports/lifecycle/notice' },
    ],
  },
  {
    id: 'payroll',
    label: 'Payroll',
    requiresPayroll: true,
    reports: [
      { id: 'payroll-summary', label: 'Payroll Summary', path: '/hr/reports/payroll/summary' },
      { id: 'payroll-employees', label: 'Employee Payroll', path: '/hr/reports/payroll/employees' },
    ],
  },
];

// ── Filter Panel ─────────────────────────────────────────────────────────────
function FilterPanel({ filters, onChange, reportType }) {
  const departmentsQuery = useQuery(['departments-list'], () => departmentsAPI.listDepartments(), {
    staleTime: 5 * 60 * 1000,
  })
  const departments = Array.isArray(departmentsQuery.data) ? departmentsQuery.data : (departmentsQuery.data?.data || [])

  return (
    <div className="flex flex-wrap gap-3 items-end">
      {reportType !== 'joining-exit' && (
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">From</label>
          <input
            type="date"
            value={filters.date_from || ''}
            onChange={e => onChange({ ...filters, date_from: e.target.value })}
            className="rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
      )}
      {reportType !== 'joining-exit' && (
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">To</label>
          <input
            type="date"
            value={filters.date_to || ''}
            onChange={e => onChange({ ...filters, date_to: e.target.value })}
            className="rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">Department</label>
        <select
          value={filters.department || ''}
          onChange={e => onChange({ ...filters, department: e.target.value || undefined })}
          className="rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <option value="">All Departments</option>
          {departments.map((dept) => (
            <option key={dept.id || dept._id} value={dept.id || dept._id}>{dept.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">Status</label>
        <select
          value={filters.employment_status || ''}
          onChange={e => onChange({ ...filters, employment_status: e.target.value || undefined })}
          className="rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="probation">Probation</option>
          <option value="notice_period">Notice Period</option>
          <option value="onboarding">Onboarding</option>
          <option value="exited">Exited</option>
        </select>
      </div>
    </div>
  );
}

// ── Generic Report Table ─────────────────────────────────────────────────────
function ReportTable({ columns, data, loading, emptyMessage = 'No data found.' }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-surface-border p-12 text-center">
        <p className="text-sm text-text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-border">
            {columns.map(col => (
              <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx} className="border-b border-surface-border/50 hover:bg-surface-hover/50">
              {columns.map(col => (
                <td key={col.key} className="px-4 py-3 text-text-primary">
                  {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Export Button ────────────────────────────────────────────────────────────
function ExportButton({ onClick, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="rounded-xl border border-surface-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition hover:border-primary-300 hover:text-primary-600 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900"
    >
      {loading ? 'Exporting...' : 'Export CSV'}
    </button>
  );
}

// ── Employee Directory Report ────────────────────────────────────────────────
function EmployeeDirectoryReport({ filters }) {
  const { data, isLoading } = useQuery({
    queryKey: ['hr-report', 'employees', 'directory', filters],
    queryFn: async () => {
      const res = await hrReportsApi.getEmployeeDirectory(filters);
      return res.data;
    },
  });

  const handleExport = async () => {
    const res = await hrExportsApi.exportEmployeeDirectory(filters);
    downloadBlob(res.data, 'employee-directory.csv');
  };

  const columns = [
    { key: 'employee_number', label: 'Emp. No.' },
    { key: 'full_name', label: 'Name' },
    { key: 'department', label: 'Department' },
    { key: 'designation', label: 'Designation' },
    { key: 'manager_name', label: 'Manager' },
    { key: 'employment_type', label: 'Type' },
    { key: 'joining_date', label: 'Joining Date', render: v => v ? new Date(v).toLocaleDateString() : '—' },
    { key: 'employment_status', label: 'Status', render: v => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        v === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-200' :
        v === 'probation' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200' :
        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
      }`}>{v}</span>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Employee Directory</h3>
        <ExportButton onClick={handleExport} loading={false} />
      </div>
      <ReportTable columns={columns} data={data?.items} loading={isLoading} />
    </div>
  );
}

// ── Headcount Report ─────────────────────────────────────────────────────────
function HeadcountReport({ filters }) {
  const { data, isLoading } = useQuery({
    queryKey: ['hr-report', 'employees', 'headcount', filters],
    queryFn: async () => {
      const res = await hrReportsApi.getHeadcount(filters);
      return res.data;
    },
  });

  const summary = data?.summary || {};

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">Headcount by Department</h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[
          { label: 'Total', value: summary.total },
          { label: 'Active', value: summary.active },
          { label: 'Probation', value: summary.probation },
          { label: 'Notice Period', value: summary.notice_period },
          { label: 'Exited', value: summary.exited },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-surface-border bg-surface p-3 text-center">
            <p className="text-xs text-text-muted">{s.label}</p>
            <p className="text-xl font-bold text-text-primary">{s.value ?? 0}</p>
          </div>
        ))}
      </div>
      {data?.items && data.items.length > 0 && (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.items}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="department" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Joining / Exit Trend Report ──────────────────────────────────────────────
function JoiningExitReport() {
  const [months, setMonths] = useState(6);
  const { data, isLoading } = useQuery({
    queryKey: ['hr-report', 'employees', 'joining-exit', months],
    queryFn: async () => {
      const res = await hrReportsApi.getJoiningExitTrend({ months });
      return res.data;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Joining / Exit Trend</h3>
        <select
          value={months}
          onChange={e => setMonths(Number(e.target.value))}
          className="rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
        </select>
      </div>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : data?.items ? (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.items}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="joiners" fill={COLORS.success} name="Joiners" radius={[4, 4, 0, 0]} />
            <Bar dataKey="exits" fill={COLORS.danger} name="Exits" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

// ── Attendance Summary Report ────────────────────────────────────────────────
function AttendanceSummaryReport({ filters }) {
  const { data, isLoading } = useQuery({
    queryKey: ['hr-report', 'attendance', 'summary', filters],
    queryFn: async () => {
      const res = await hrReportsApi.getAttendanceSummary(filters);
      return res.data;
    },
  });

  const handleExport = async () => {
    const res = await hrExportsApi.exportAttendanceSummary(filters);
    downloadBlob(res.data, `attendance-summary-${filters.date_from || 'all'}-to-${filters.date_to || 'all'}.csv`);
  };

  const columns = [
    { key: 'employee_name', label: 'Employee' },
    { key: 'employee_number', label: 'Emp. No.' },
    { key: 'department', label: 'Department' },
    { key: 'working_days', label: 'Working Days' },
    { key: 'present', label: 'Present' },
    { key: 'paid_leave', label: 'Paid Leave' },
    { key: 'unpaid_leave', label: 'Unpaid Leave' },
    { key: 'absent', label: 'Absent' },
    { key: 'half_day', label: 'Half Day' },
    { key: 'late_count', label: 'Late' },
    { key: 'overtime_minutes', label: 'OT (min)', render: v => Math.round(v || 0) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Attendance Summary</h3>
        <ExportButton onClick={handleExport} loading={false} />
      </div>
      <ReportTable columns={columns} data={data?.items} loading={isLoading} />
    </div>
  );
}

// ── Late Arrival Report ──────────────────────────────────────────────────────
function LateArrivalReport({ filters }) {
  const { data, isLoading } = useQuery({
    queryKey: ['hr-report', 'attendance', 'late', filters],
    queryFn: async () => {
      const res = await hrReportsApi.getLateArrivals(filters);
      return res.data;
    },
  });

  const columns = [
    { key: 'employee_name', label: 'Employee' },
    { key: 'employee_number', label: 'Emp. No.' },
    { key: 'department', label: 'Department' },
    { key: 'date', label: 'Date' },
    { key: 'expected_check_in', label: 'Expected' },
    { key: 'actual_check_in', label: 'Actual' },
    { key: 'late_minutes', label: 'Late (min)', render: v => `${Math.round(v || 0)} min` },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">Late Arrival Report</h3>
      <ReportTable columns={columns} data={data?.items} loading={isLoading} />
    </div>
  );
}

// ── Absence Report ───────────────────────────────────────────────────────────
function AbsenceReport({ filters }) {
  const { data, isLoading } = useQuery({
    queryKey: ['hr-report', 'attendance', 'absence', filters],
    queryFn: async () => {
      const res = await hrReportsApi.getAbsences(filters);
      return res.data;
    },
  });

  const columns = [
    { key: 'employee_name', label: 'Employee' },
    { key: 'employee_number', label: 'Emp. No.' },
    { key: 'department', label: 'Department' },
    { key: 'date', label: 'Date' },
    { key: 'hr_status', label: 'Status' },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">Absence Report</h3>
      <ReportTable columns={columns} data={data?.items} loading={isLoading} />
    </div>
  );
}

// ── Leave Balance Report ─────────────────────────────────────────────────────
function LeaveBalanceReport({ filters }) {
  const { data, isLoading } = useQuery({
    queryKey: ['hr-report', 'leave', 'balances', filters],
    queryFn: async () => {
      const res = await hrReportsApi.getLeaveBalances(filters);
      return res.data;
    },
  });

  const handleExport = async () => {
    const res = await hrExportsApi.exportLeaveBalances(filters);
    downloadBlob(res.data, 'leave-balance-report.csv');
  };

  const columns = [
    { key: 'employee_name', label: 'Employee' },
    { key: 'employee_number', label: 'Emp. No.' },
    { key: 'department', label: 'Department' },
    { key: 'leave_type', label: 'Leave Type' },
    { key: 'allocated', label: 'Allocated' },
    { key: 'used', label: 'Used' },
    { key: 'pending', label: 'Pending' },
    { key: 'available', label: 'Available', render: v => (
      <span className={`font-medium ${(v || 0) <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{v}</span>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Leave Balances</h3>
        <ExportButton onClick={handleExport} loading={false} />
      </div>
      <ReportTable columns={columns} data={data?.items} loading={isLoading} />
    </div>
  );
}

// ── Leave Usage Report ───────────────────────────────────────────────────────
function LeaveUsageReport({ filters }) {
  const { data, isLoading } = useQuery({
    queryKey: ['hr-report', 'leave', 'usage', filters],
    queryFn: async () => {
      const res = await hrReportsApi.getLeaveUsage(filters);
      return res.data;
    },
  });

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">Leave Usage by Type</h3>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : data?.items && data.items.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.items}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="leave_type" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="total_approved" fill={COLORS.success} name="Approved" radius={[4, 4, 0, 0]} />
              <Bar dataKey="total_pending" fill={COLORS.warning} name="Pending" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <ReportTable
            columns={[
              { key: 'leave_type', label: 'Leave Type' },
              { key: 'total_approved', label: 'Approved Units' },
              { key: 'total_pending', label: 'Pending Units' },
              { key: 'total_rejected', label: 'Rejected Units' },
              { key: 'employee_count', label: 'Employees' },
            ]}
            data={data.items}
            loading={false}
          />
        </>
      ) : (
        <p className="text-sm text-text-muted text-center py-8">No leave usage data for this period.</p>
      )}
    </div>
  );
}

// ── Document Expiry Report ───────────────────────────────────────────────────
function DocumentExpiryReport({ filters }) {
  const { data, isLoading } = useQuery({
    queryKey: ['hr-report', 'documents', 'expiry', filters],
    queryFn: async () => {
      const res = await hrReportsApi.getDocumentExpiry(filters);
      return res.data;
    },
  });

  const handleExport = async () => {
    const res = await hrExportsApi.exportDocumentExpiry(filters);
    downloadBlob(res.data, 'document-expiry-report.csv');
  };

  const columns = [
    { key: 'employee_name', label: 'Employee' },
    { key: 'employee_number', label: 'Emp. No.' },
    { key: 'department', label: 'Department' },
    { key: 'document_type', label: 'Document Type' },
    { key: 'expiry_date', label: 'Expiry Date', render: v => v ? new Date(v).toLocaleDateString() : '—' },
    { key: 'status', label: 'Status', render: v => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        v === 'expired' ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-200' :
        v === 'expiring_soon' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200' :
        'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-200'
      }`}>{v?.replace('_', ' ')}</span>
    )},
    { key: 'days_remaining', label: 'Days Left', render: v => v != null ? `${v}d` : '—' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Document Expiry Report</h3>
        <ExportButton onClick={handleExport} loading={false} />
      </div>
      <ReportTable columns={columns} data={data?.items} loading={isLoading} />
    </div>
  );
}

// ── Lifecycle Events Report ──────────────────────────────────────────────────
function LifecycleEventsReport({ filters }) {
  const [eventType, setEventType] = useState('');
  const queryFilters = { ...filters, event_type: eventType || undefined };

  const { data, isLoading } = useQuery({
    queryKey: ['hr-report', 'lifecycle', 'events', queryFilters],
    queryFn: async () => {
      const res = await hrReportsApi.getLifecycleEvents(queryFilters);
      return res.data;
    },
  });

  const columns = [
    { key: 'employee_name', label: 'Employee' },
    { key: 'employee_number', label: 'Emp. No.' },
    { key: 'department', label: 'Department' },
    { key: 'event_type', label: 'Event', render: v => (
      <span className="inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200">
        {v?.replace(/_/g, ' ')}
      </span>
    )},
    { key: 'previous_summary', label: 'Previous' },
    { key: 'new_summary', label: 'New' },
    { key: 'effective_date', label: 'Effective Date', render: v => v ? new Date(v).toLocaleDateString() : '—' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-text-primary">Lifecycle Events</h3>
        <select
          value={eventType}
          onChange={e => setEventType(e.target.value)}
          className="rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <option value="">All Events</option>
          <option value="joined">Joined</option>
          <option value="promoted">Promoted</option>
          <option value="department_transferred">Transfer</option>
          <option value="manager_changed">Manager Change</option>
          <option value="resignation_submitted">Resignation</option>
          <option value="exited">Exited</option>
        </select>
      </div>
      <ReportTable columns={columns} data={data?.items} loading={isLoading} />
    </div>
  );
}

// ── Probation Report ─────────────────────────────────────────────────────────
function ProbationReport({ filters }) {
  const { data, isLoading } = useQuery({
    queryKey: ['hr-report', 'lifecycle', 'probation', filters],
    queryFn: async () => {
      const res = await hrReportsApi.getProbationReport(filters);
      return res.data;
    },
  });

  const columns = [
    { key: 'employee_name', label: 'Employee' },
    { key: 'employee_number', label: 'Emp. No.' },
    { key: 'department', label: 'Department' },
    { key: 'joining_date', label: 'Joining Date', render: v => v ? new Date(v).toLocaleDateString() : '—' },
    { key: 'probation_end', label: 'Probation End', render: v => v ? new Date(v).toLocaleDateString() : '—' },
    { key: 'manager_name', label: 'Manager' },
    { key: 'status', label: 'Status', render: v => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        v === 'overdue' ? 'bg-red-100 text-red-700' :
        v === 'due_soon' ? 'bg-amber-100 text-amber-700' :
        'bg-green-100 text-green-700'
      }`}>{v?.replace('_', ' ')}</span>
    )},
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">Probation / Confirmation Report</h3>
      <ReportTable columns={columns} data={data?.items} loading={isLoading} />
    </div>
  );
}

// ── Notice Period Report ─────────────────────────────────────────────────────
function NoticePeriodReport({ filters }) {
  const { data, isLoading } = useQuery({
    queryKey: ['hr-report', 'lifecycle', 'notice', filters],
    queryFn: async () => {
      const res = await hrReportsApi.getNoticePeriodReport(filters);
      return res.data;
    },
  });

  const columns = [
    { key: 'employee_name', label: 'Employee' },
    { key: 'employee_number', label: 'Emp. No.' },
    { key: 'department', label: 'Department' },
    { key: 'notice_start', label: 'Notice Start', render: v => v ? new Date(v).toLocaleDateString() : '—' },
    { key: 'last_working_day', label: 'Last Working Day', render: v => v ? new Date(v).toLocaleDateString() : '—' },
    { key: 'exit_type', label: 'Exit Type', render: v => v ? (
      <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-950/60 dark:text-orange-200">
        {v}
      </span>
    ) : '—'},
    { key: 'manager_name', label: 'Manager' },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">Notice Period Report</h3>
      <ReportTable columns={columns} data={data?.items} loading={isLoading} />
    </div>
  );
}

// ── Payroll Summary Report ───────────────────────────────────────────────────
function PayrollSummaryReport() {
  const { data, isLoading } = useQuery({
    queryKey: ['hr-report', 'payroll', 'summary'],
    queryFn: async () => {
      const res = await hrReportsApi.getPayrollSummary();
      return res.data;
    },
  });

  const handleExport = async () => {
    const res = await hrExportsApi.exportPayrollSummary();
    downloadBlob(res.data, 'payroll-summary-report.csv');
  };

  const columns = [
    { key: 'period_label', label: 'Period' },
    { key: 'employee_count', label: 'Employees' },
    { key: 'total_earnings', label: 'Total Earnings', render: v => `₹${Number(v || 0).toLocaleString()}` },
    { key: 'total_deductions', label: 'Total Deductions', render: v => `₹${Number(v || 0).toLocaleString()}` },
    { key: 'total_net', label: 'Net Payroll', render: v => (
      <span className="font-medium text-emerald-600">₹{Number(v || 0).toLocaleString()}</span>
    )},
    { key: 'status', label: 'Status', render: v => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        v === 'processed' ? 'bg-green-100 text-green-700' :
        v === 'approved' ? 'bg-blue-100 text-blue-700' :
        'bg-gray-100 text-gray-700'
      }`}>{v}</span>
    )},
    { key: 'processed_at', label: 'Processed', render: v => v ? new Date(v).toLocaleDateString() : '—' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Payroll Summary</h3>
        <ExportButton onClick={handleExport} loading={false} />
      </div>
      <ReportTable columns={columns} data={data?.items} loading={isLoading} />
    </div>
  );
}

// ── Employee Payroll Report ──────────────────────────────────────────────────
function EmployeePayrollReport() {
  const { data, isLoading } = useQuery({
    queryKey: ['hr-report', 'payroll', 'employees'],
    queryFn: async () => {
      const res = await hrReportsApi.getEmployeePayroll();
      return res.data;
    },
  });

  const columns = [
    { key: 'employee_name', label: 'Employee' },
    { key: 'employee_number', label: 'Emp. No.' },
    { key: 'department', label: 'Department' },
    { key: 'payable_days', label: 'Payable Days' },
    { key: 'gross', label: 'Gross', render: v => `₹${Number(v || 0).toLocaleString()}` },
    { key: 'deductions', label: 'Deductions', render: v => `₹${Number(v || 0).toLocaleString()}` },
    { key: 'net', label: 'Net', render: v => (
      <span className="font-medium text-emerald-600">₹{Number(v || 0).toLocaleString()}</span>
    )},
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">Employee Payroll</h3>
      <ReportTable columns={columns} data={data?.items} loading={isLoading} />
    </div>
  );
}

// ── Main Reports Page ────────────────────────────────────────────────────────
export default function HRReports() {
  const [searchParams, setSearchParams] = useSearchParams();
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

  const activeCategory = searchParams.get('category') || 'employees';
  const activeReport = searchParams.get('report') || 'directory';

  const [filters, setFilters] = useState({
    date_from: searchParams.get('from') || '',
    date_to: searchParams.get('to') || '',
    department: searchParams.get('dept') || undefined,
    employment_status: searchParams.get('status') || undefined,
  });

  const navigateToReport = useCallback((category, report) => {
    setSearchParams({ category, report });
  }, [setSearchParams]);

  const visibleCategories = REPORT_CATEGORIES.filter(cat =>
    !cat.requiresPayroll || hasPayrollAccess
  );

  // Determine which report component to render
  const renderReport = () => {
    switch (activeReport) {
      case 'directory': return <EmployeeDirectoryReport filters={filters} />;
      case 'headcount': return <HeadcountReport filters={filters} />;
      case 'joining-exit': return <JoiningExitReport />;
      case 'summary': return <AttendanceSummaryReport filters={filters} />;
      case 'late': return <LateArrivalReport filters={filters} />;
      case 'absence': return <AbsenceReport filters={filters} />;
      case 'balances': return <LeaveBalanceReport filters={filters} />;
      case 'usage': return <LeaveUsageReport filters={filters} />;
      case 'expiry': return <DocumentExpiryReport filters={filters} />;
      case 'events': return <LifecycleEventsReport filters={filters} />;
      case 'probation': return <ProbationReport filters={filters} />;
      case 'notice': return <NoticePeriodReport filters={filters} />;
      case 'payroll-summary': return <PayrollSummaryReport />;
      case 'payroll-employees': return <EmployeePayrollReport />;
      default: return <EmployeeDirectoryReport filters={filters} />;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="HR Reports"
        description="Operational reports across all HR modules — filter, view, and export."
      />

      <div className="mt-6 flex gap-6 min-h-[600px]">
        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <div className="w-56 flex-shrink-0 hidden lg:block">
          <nav className="space-y-1">
            {visibleCategories.map(cat => (
              <div key={cat.id}>
                <button
                  onClick={() => navigateToReport(cat.id, cat.reports[0]?.id)}
                  className={`w-full text-left rounded-xl px-3 py-2 text-sm font-medium transition ${
                    activeCategory === cat.id
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
                  }`}
                >
                  {cat.label}
                </button>
                {activeCategory === cat.id && (
                  <div className="ml-2 mt-1 space-y-0.5">
                    {cat.reports.map(report => (
                      <button
                        key={report.id}
                        onClick={() => navigateToReport(cat.id, report.id)}
                        className={`w-full text-left rounded-lg px-3 py-1.5 text-xs transition ${
                          activeReport === report.id
                            ? 'bg-primary-100 text-primary-700 font-medium dark:bg-primary-900/30 dark:text-primary-300'
                            : 'text-text-muted hover:text-text-primary'
                        }`}
                      >
                        {report.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* ── Mobile Category Selector ──────────────────────────────────── */}
        <div className="lg:hidden mb-4">
          <select
            value={`${activeCategory}:${activeReport}`}
            onChange={e => {
              const [cat, report] = e.target.value.split(':');
              navigateToReport(cat, report);
            }}
            className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            {visibleCategories.map(cat => (
              <optgroup key={cat.id} label={cat.label}>
                {cat.reports.map(report => (
                  <option key={report.id} value={`${cat.id}:${report.id}`}>
                    {report.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* ── Main Content ──────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="mb-4">
            <FilterPanel filters={filters} onChange={setFilters} reportType={activeReport} />
          </div>
          <div className="rounded-2xl border border-surface-border bg-surface p-6 dark:border-gray-800 dark:bg-gray-950">
            {renderReport()}
          </div>
        </div>
      </div>
    </div>
  );
}
