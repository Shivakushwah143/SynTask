import { useMemo, useState } from "react";
import { useQuery } from "react-query";
import {
  Briefcase,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  RefreshCw,
  Search,
  UserCheck,
  Users,
} from "lucide-react";

import { recruitmentApi } from "../../../../api/recruitment";
import { Button, EmptyState, PageHeader, inputClassName } from "../../../../components/ui";
import { fmtDate } from "../utils/data";

const EMPLOYEE_STATUS_COLORS = {
  active: "emerald",
  pending: "amber",
  inactive: "gray",
  suspended: "rose",
};

const statusColorClass = (color) =>
  ({
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    gray: "bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  })[color] || "bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300";

// ============================================================
// STAT CARD
// ============================================================
const StatCard = ({ label, value, icon: Icon, color = "indigo" }) => {
  const colors = {
    indigo: "from-indigo-500 to-purple-500",
    emerald: "from-emerald-500 to-teal-500",
    amber: "from-amber-500 to-orange-500",
    rose: "from-rose-500 to-pink-500",
  };
  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg transition-transform group-hover:scale-110`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
};

// ============================================================
// EMPLOYEE CARD
// ============================================================
const EmployeeCard = ({ employee }) => {
  const status = employee?.employee_status || "pending";
  const initials = (employee?.full_name || "?")
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-sm font-bold text-white shadow">
            {initials}
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">{employee?.full_name || "—"}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {employee?.designation || employee?.job_title || "Employee"}
            </p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusColorClass(EMPLOYEE_STATUS_COLORS[status] || "gray")}`}>
          {status}
        </span>
      </div>

      <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-gray-400" />
          <span className="truncate">{employee?.employee_email || employee?.email || "—"}</span>
        </div>
        {employee?.phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-gray-400" />
            <span>{employee.phone}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-gray-400" />
          <span>{employee?.job_title || "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-gray-400" />
          <span>{employee?.department_name || "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400" />
          <span>Hired {fmtDate(employee?.hired_at || employee?.updated_at)}</span>
        </div>
      </div>

      {employee?.skills?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {employee.skills.slice(0, 4).map((skill) => (
            <span
              key={skill}
              className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300"
            >
              {skill}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================
// EMPLOYEES PAGE
// ============================================================
export default function EmployeesPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 24;

  const query = useQuery(
    ["recruitment", "employees", { search, page }],
    () => recruitmentApi.getEmployees({ search, page, page_size: pageSize }),
    { keepPreviousData: true }
  );

  const employees = query.data?.data?.items || query.data?.data || [];
  const total = query.data?.data?.total || 0;
  const hasNext = query.data?.data?.has_next || page * pageSize < total;

  const stats = useMemo(() => {
    const active = employees.filter((e) => e.employee_status === "active").length;
    const pending = employees.filter((e) => !e.employee_status || e.employee_status === "pending").length;
    return {
      total,
      active,
      pending: employees.length ? pending : 0,
    };
  }, [employees, total]);

  const handleSearch = (value) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Employees"
        description="Candidates hired into the company appear here and are moved out of the candidates list."
        actions={
          <Button variant="secondary" onClick={() => query.refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Employees" value={stats.total} icon={Users} color="indigo" />
        <StatCard label="Active" value={stats.active} icon={UserCheck} color="emerald" />
        <StatCard label="Pending Setup" value={stats.pending} icon={Briefcase} color="amber" />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by name, email, or phone..."
          className={`${inputClassName} pl-9`}
        />
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
      </div>

      {/* Content */}
      {query.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800" />
          ))}
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={Users}
          title="Failed to load employees"
          description="Something went wrong while loading the employee list. Please try again."
          action={<Button variant="secondary" onClick={() => query.refetch()}>Try Again</Button>}
        />
      ) : employees.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title={search ? "No employees match your search" : "No employees yet"}
          description={
            search
              ? "Try a different search term."
              : "When you assign a job to a candidate with 'Move to Employees' enabled, they'll appear here."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {employees.map((employee) => (
            <EmployeeCard key={employee.id || employee._id} employee={employee} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {employees.length > 0 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing {employees.length} of {total} employees
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <span className="text-sm text-gray-500 dark:text-gray-400">Page {page}</span>
            <Button variant="secondary" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
