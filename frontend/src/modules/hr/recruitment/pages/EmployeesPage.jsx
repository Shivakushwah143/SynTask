import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from 'react-query'
import {
  Building2,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileEdit,
  Filter,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { Button, EmptyState, PageHeader, inputClassName } from '../../../../components/ui'
import { employeesApi } from '../../../../api/employees'
import { departmentsAPI } from '../../../../api/departments'
import { usersAPI } from '../../../../api/users'
import { useCanManageEmployees } from '../hooks/useCanManageEmployees'
import { useReviewQueue, useApproveChangeRequest, useRejectChangeRequest } from '../../../../hooks/useChangeRequests'
import { compactParams, fmtDate, labelize } from '../utils/data'
import EmployeeFormModal, {
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_TYPES,
  WORK_MODES,
} from '../components/EmployeeFormModal'

const STATUS_COLORS = {
  onboarding: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  probation: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  notice_period: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  exited: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300',
}

const selectClassName = inputClassName
const PAGE_SIZE = 20

const optionLabel = (options, value) => options.find((option) => option.value === value)?.label || value || '—'

export default function EmployeesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canManage = useCanManageEmployees()
  const [activeTab, setActiveTab] = useState('employees')
  const [reviewQueuePage, setReviewQueuePage] = useState(1)
  const approveRequest = useApproveChangeRequest()
  const rejectRequest = useRejectChangeRequest()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [designation, setDesignation] = useState('')
  const [employmentStatus, setEmploymentStatus] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [workMode, setWorkMode] = useState('')
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  // Debounce search so we don't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  const query = useQuery(
    ['employees', 'list', { search: debouncedSearch, departmentId, designation, employmentStatus, employmentType, workMode, page }],
    () =>
      employeesApi.list(
        compactParams({
          search: debouncedSearch || undefined,
          department_id: departmentId || undefined,
          designation: designation || undefined,
          employment_status: employmentStatus || undefined,
          employment_type: employmentType || undefined,
          work_mode: workMode || undefined,
          page,
          page_size: PAGE_SIZE,
        })
      ),
    { keepPreviousData: true }
  )

  const departmentsQuery = useQuery(['departments'], () => departmentsAPI.listDepartments(), {
    staleTime: 5 * 60 * 1000,
  })

  const assignableQuery = useQuery(['users', 'assignable', 'employees'], () => usersAPI.getAssignableUsers(), {
    enabled: Boolean(showCreate),
    staleTime: 5 * 60 * 1000,
  })

  // Review queue for change requests
  const reviewQueueQuery = useReviewQueue(
    { page: reviewQueuePage, page_size: 20 },
    { enabled: activeTab === 'review' && canManage },
  )
  const reviewItems = reviewQueueQuery.data?.items || []
  const reviewTotal = reviewQueueQuery.data?.total || 0

  const employees = query.data?.data?.items || []
  const total = query.data?.data?.total || 0
  const hasNext = query.data?.data?.has_next || page * PAGE_SIZE < total
  const departments = departmentsQuery.data || []

  const stats = useMemo(() => {
    const active = employees.filter((employee) => employee.employment_status === 'active').length
    const probation = employees.filter((employee) => employee.employment_status === 'probation').length
    const onboarding = employees.filter((employee) => employee.employment_status === 'onboarding').length
    return { total, active, probation, onboarding }
  }, [employees, total])

  const resetFilters = () => {
    setDepartmentId('')
    setDesignation('')
    setEmploymentStatus('')
    setEmploymentType('')
    setWorkMode('')
    setPage(1)
  }

  const handleSaved = () => {
    queryClient.invalidateQueries(['employees', 'list'])
  }

  const openDetail = (employee) => navigate(`/hr/employees/${employee.id}`)

  const hasActiveFilters = Boolean(departmentId || designation || employmentStatus || employmentType || workMode)

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Employees"
        description="Company employees and their HR profiles. Search, filter, and manage employment information."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => query.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            {canManage && (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add Employee
              </Button>
            )}
          </div>
        }
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setActiveTab('employees')}
          className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'employees'
              ? 'border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Users className="h-4 w-4" /> All Employees
        </button>
        {canManage && (
          <button
            type="button"
            onClick={() => setActiveTab('review')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'review'
                ? 'border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <ClipboardCheck className="h-4 w-4" /> Review Queue
            {reviewTotal > 0 && (
              <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {reviewTotal}
              </span>
            )}
          </button>
        )}
      </div>

      {activeTab === 'review' ? (
        <ReviewQueuePanel
          items={reviewItems}
          total={reviewTotal}
          page={reviewQueuePage}
          onPageChange={setReviewQueuePage}
          loading={reviewQueueQuery.isLoading}
          error={reviewQueueQuery.isError}
          onRefetch={() => reviewQueueQuery.refetch()}
          onApprove={async (id) => {
            try {
              await approveRequest.mutateAsync({ id })
              toast.success('Change request approved')
            } catch (err) {
              toast.error(err?.response?.data?.detail || 'Failed to approve')
            }
          }}
          onReject={async (id) => {
            const reason = prompt('Rejection reason:')
            if (reason === null) return
            try {
              await rejectRequest.mutateAsync({ id, reason: reason || 'Rejected by reviewer' })
              toast.success('Change request rejected')
            } catch (err) {
              toast.error(err?.response?.data?.detail || 'Failed to reject')
            }
          }}
        />
      ) : (
      <>
      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Employees" value={stats.total} icon={Users} color="indigo" />
        <StatCard label="Active" value={stats.active} icon={UserCheck} color="emerald" />
        <StatCard label="Probation" value={stats.probation} icon={UserCheck} color="amber" />
        <StatCard label="Onboarding" value={stats.onboarding} icon={UserCheck} color="sky" />
      </div>

      {/* Search + filter toggles */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-md flex-1">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, employee number, or email…"
            className={`${inputClassName} pl-9`}
            aria-label="Search employees"
          />
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowFilters((value) => !value)}>
            <Filter className="mr-2 h-4 w-4" /> Filters
            {hasActiveFilters ? <span className="ml-1 rounded-full bg-indigo-500 px-1.5 text-xs text-white">•</span> : null}
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" onClick={resetFilters}>
              <X className="mr-1.5 h-4 w-4" /> Clear
            </Button>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">Department</span>
            <select className={selectClassName} value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setPage(1) }} aria-label="Filter by department">
              <option value="">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">Designation</span>
            <input
              className={inputClassName}
              value={designation}
              onChange={(event) => { setDesignation(event.target.value); setPage(1) }}
              placeholder="e.g. Engineer"
              aria-label="Filter by designation"
            />
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">Employment Status</span>
            <select className={selectClassName} value={employmentStatus} onChange={(event) => { setEmploymentStatus(event.target.value); setPage(1) }} aria-label="Filter by employment status">
              <option value="">All statuses</option>
              {EMPLOYMENT_STATUSES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">Employment Type</span>
            <select className={selectClassName} value={employmentType} onChange={(event) => { setEmploymentType(event.target.value); setPage(1) }} aria-label="Filter by employment type">
              <option value="">All types</option>
              {EMPLOYMENT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">Work Mode</span>
            <select className={selectClassName} value={workMode} onChange={(event) => { setWorkMode(event.target.value); setPage(1) }} aria-label="Filter by work mode">
              <option value="">All modes</option>
              {WORK_MODES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* Table / states */}
      {query.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800" />
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
          title={debouncedSearch || hasActiveFilters ? 'No employees match your search' : 'No employees yet'}
          description={
            debouncedSearch || hasActiveFilters
              ? 'Try adjusting your search or filters.'
              : 'Create an employee profile or convert a joined candidate from Recruitment.'
          }
          action={canManage && !debouncedSearch && !hasActiveFilters ? <Button onClick={() => setShowCreate(true)}><Plus className="mr-2 h-4 w-4" /> Add Employee</Button> : null}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/70">
              <tr>
                {['Employee', 'Employee ID', 'Department', 'Designation', 'Manager', 'Type', 'Joining Date', 'Status', 'Actions'].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {employees.map((employee) => (
                <tr
                  key={employee.id}
                  onClick={() => openDetail(employee)}
                  className="cursor-pointer transition-colors hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {employee.avatar ? (
                        <img src={employee.avatar} alt={employee.full_name} className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-xs font-bold text-white">
                          {(employee.full_name || '?').split(' ').map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-900 dark:text-white">{employee.full_name || '—'}</p>
                        <p className="flex items-center gap-1 truncate text-xs text-gray-500 dark:text-gray-400">
                          <Mail className="h-3 w-3 shrink-0" /> {employee.email || '—'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{employee.employee_number || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-gray-400" /> {employee.department_name || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{employee.designation || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{employee.manager_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{optionLabel(EMPLOYMENT_TYPES, employee.employment_type)}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-gray-400" /> {fmtDate(employee.joining_date)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_COLORS[employee.employment_status] || 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300'}`}>
                      {labelize(employee.employment_status || 'onboarding')}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openDetail(employee)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-gray-700"
                        aria-label={`View ${employee.full_name}`}
                        title="View"
                      >
                        <Users className="h-4 w-4" />
                      </button>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => navigate(`/hr/employees/${employee.id}?edit=1`)}
                          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-gray-700"
                          aria-label={`Edit ${employee.full_name}`}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {employees.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 pt-2 sm:flex-row">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing {employees.length} of {total} employees
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <span className="text-sm text-gray-500 dark:text-gray-400">Page {page}</span>
            <Button variant="secondary" disabled={!hasNext} onClick={() => setPage((value) => value + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {showCreate && (
        <EmployeeFormModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          mode="create"
          departments={departments}
          assignableUsers={assignableQuery.data?.users || []}
          onSaved={handleSaved}
        />
      )}
      </>
      )}
    </div>
  )
}

function ReviewQueuePanel({ items, total, page, onPageChange, loading, error, onRefetch, onApprove, onReject }) {
  const STATUS_COLORS = {
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300',
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Failed to load review queue"
        description="Please try again."
        action={<Button variant="secondary" onClick={onRefetch}>Try Again</Button>}
      />
    )
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Check}
        title="No pending change requests"
        description="All caught up! Change requests from your team will appear here for review."
      />
    )
  }

  const hasMore = total > page * 20

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/70">
            <tr>
              {['Employee', 'Requested By', 'Fields', 'Reason', 'Date', 'Status', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {items.map((item) => (
              <tr key={item.id} className="transition-colors hover:bg-indigo-50/30 dark:hover:bg-indigo-950/10">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.employee_name || '—'}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.requester_name || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(item.changed_fields || []).map((field) => (
                      <span key={field} className="inline-flex rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                        {field.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{item.reason || '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{fmtDate(item.created_at)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[item.status] || ''}`}>
                    {item.status}
                  </span>
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  {item.status === 'pending' ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onApprove(item.id)}
                        className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 transition-colors hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400"
                        title="Approve"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onReject(item.id)}
                        className="rounded-lg bg-red-50 p-1.5 text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400"
                        title="Reject"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">{fmtDate(item.reviewed_at)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 20 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing {items.length} of {total} requests
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <span className="text-sm text-gray-500 dark:text-gray-400">Page {page}</span>
            <Button variant="secondary" disabled={!hasMore} onClick={() => onPageChange(page + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color = 'indigo' }) {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    sky: 'from-sky-500 to-cyan-500',
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-lg bg-gradient-to-r ${colors[color] || colors.indigo} p-2 text-white shadow`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  )
}
