import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from 'react-query'
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CalendarDays,
  FileText,
  GitBranch,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldAlert,
  User,
  Wallet,
  Users,
} from 'lucide-react'

import { Button, EmptyState, PageHeader, inputClassName } from '../../../../components/ui'
import { employeesApi } from '../../../../api/employees'
import { departmentsAPI } from '../../../../api/departments'
import { usersAPI } from '../../../../api/users'
import { fmtDate, labelize } from '../utils/data'
import { useCanManageHrDocuments } from '../hooks/useCanManageHrDocuments'
import DocumentsTab from '../components/DocumentsTab'

const titleCase = labelize
import EmployeeFormModal from '../components/EmployeeFormModal'
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, WORK_MODES } from '../components/EmployeeFormModal'

const STATUS_COLORS = {
  onboarding: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  probation: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  notice_period: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  exited: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300',
}

const statusBadge = (status) => (
  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300'}`}>
    {titleCase(status || 'onboarding')}
  </span>
)

const optionLabel = (options, value) => options.find((option) => option.value === value)?.label || value || '—'

const TABS = [
  { key: 'overview', label: 'Overview', icon: User },
  { key: 'employment', label: 'Employment', icon: Briefcase },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'attendance', label: 'Attendance', icon: CalendarDays },
  { key: 'leave', label: 'Leave', icon: CalendarDays },
  { key: 'salary', label: 'Salary', icon: Wallet },
  { key: 'lifecycle', label: 'Lifecycle', icon: GitBranch },
]

const FIELD_STYLES = 'rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100'

function InfoItem({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <div className={FIELD_STYLES}>{value || '—'}</div>
    </div>
  )
}

const PlaceholderTab = ({ name }) => (
  <EmptyState
    icon={ShieldAlert}
    title={`${name} not available yet`}
    description={`The ${name.toLowerCase()} module is part of a later HRMS phase. It will appear here once available.`}
  />
)

export default function EmployeeDetailPage() {
  const { employeeId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('overview')
  const [showEdit, setShowEdit] = useState(false)
  const [assignableUsers, setAssignableUsers] = useState([])

  const query = useQuery(['employees', 'detail', employeeId], () => employeesApi.get(employeeId), {
    enabled: Boolean(employeeId),
    retry: 1,
  })

  const departmentsQuery = useQuery(['departments'], () => departmentsAPI.listDepartments(), {
    enabled: Boolean(showEdit),
    staleTime: 5 * 60 * 1000,
  })

  const assignableQuery = useQuery(['users', 'assignable', 'employees'], () => usersAPI.getAssignableUsers(), {
    enabled: Boolean(showEdit),
    staleTime: 5 * 60 * 1000,
    onSuccess: (data) => setAssignableUsers(data?.users || []),
  })

  const employee = query.data?.data
  const departments = departmentsQuery.data || []
  const canEdit = employee?.can_edit === true
  const canManageHrDocuments = useCanManageHrDocuments()

  // Support the list page's "Edit" action which navigates with ?edit=1.
  useEffect(() => {
    if (searchParams.get('edit') === '1' && employee?.can_edit) {
      setShowEdit(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, employee, setSearchParams])

  const handleSaved = () => {
    query.refetch()
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <button
          type="button"
          onClick={() => navigate('/hr/recruitment/employees')}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Employees
        </button>
        <PageHeader
          title={employee ? employee.full_name : 'Employee'}
          description={employee ? `${employee.designation || 'Employee'} · ${employee.department_name || 'No department'}` : 'Loading employee…'}
          actions={
            employee && canEdit ? (
              <Button onClick={() => setShowEdit(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Button>
            ) : null
          }
        />
      </div>

      {query.isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={Users}
          title="Failed to load employee"
          description="Something went wrong while loading this employee's profile. Please try again."
          action={<Button variant="secondary" onClick={() => query.refetch()}>Try Again</Button>}
        />
      ) : !employee ? (
        <EmptyState icon={Users} title="Employee not found" description="This employee profile may have been removed." />
      ) : (
        <>
          {/* Summary card */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                {employee.avatar ? (
                  <img src={employee.avatar} alt={employee.full_name} className="h-16 w-16 rounded-full object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-lg font-bold text-white">
                    {(employee.full_name || '?').split(' ').map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{employee.full_name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{employee.employee_number || 'No employee number'}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                    <Mail className="h-3.5 w-3.5" /> {employee.email}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-start gap-1.5 sm:items-end">
                {statusBadge(employee.employment_status)}
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {employee.department_name || 'No department'} · {employee.work_location || 'No location'}
                </span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-1.5 border-b border-gray-200 dark:border-gray-700">
            {TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>

          <div className="pt-4">
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Identity</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <InfoItem label="Employee Number" value={employee.employee_number} />
                    <InfoItem label="Work Email" value={employee.email} />
                    <InfoItem label="Phone" value={employee.phone} />
                    <InfoItem label="Role" value={titleCase(employee.role)} />
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Employment</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <InfoItem label="Department" value={employee.department_name} />
                    <InfoItem label="Designation" value={employee.designation} />
                    <InfoItem label="Manager" value={employee.manager_name} />
                    <InfoItem label="Employment Status" value={titleCase(employee.employment_status)} />
                    <InfoItem label="Joining Date" value={fmtDate(employee.joining_date)} />
                    <InfoItem label="Work Mode" value={optionLabel(WORK_MODES, employee.work_mode)} />
                    <InfoItem label="Work Location" value={employee.work_location} />
                    <InfoItem label="Employment Type" value={optionLabel(EMPLOYMENT_TYPES, employee.employment_type)} />
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Personal</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <InfoItem label="Date of Birth" value={fmtDate(employee.date_of_birth)} />
                    <InfoItem label="Gender" value={titleCase(employee.gender)} />
                    <InfoItem label="Personal Email" value={employee.personal_email} />
                    <InfoItem label="Personal Phone" value={employee.personal_phone} />
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-800/40">
                    <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200">
                      <MapPin className="h-4 w-4 text-indigo-500" /> Address
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {[
                        employee.address?.line1,
                        employee.address?.line2,
                        employee.address?.city,
                        employee.address?.state,
                        employee.address?.postal_code,
                        employee.address?.country,
                      ].filter(Boolean).join(', ') || '—'}
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Emergency Contact</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <InfoItem label="Name" value={employee.emergency_contact?.name} />
                    <InfoItem label="Relationship" value={employee.emergency_contact?.relationship} />
                    <InfoItem label="Phone" value={employee.emergency_contact?.phone} />
                    <InfoItem label="Alternate Phone" value={employee.emergency_contact?.alternate_phone} />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'employment' && (
              <div className="max-w-4xl space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoItem label="Employment Type" value={optionLabel(EMPLOYMENT_TYPES, employee.employment_type)} />
                  <InfoItem label="Department" value={employee.department_name} />
                  <InfoItem label="Designation" value={employee.designation} />
                  <InfoItem label="Manager" value={employee.manager_name} />
                  <InfoItem label="Joining Date" value={fmtDate(employee.joining_date)} />
                  <InfoItem label="Work Mode" value={optionLabel(WORK_MODES, employee.work_mode)} />
                  <InfoItem label="Work Location" value={employee.work_location} />
                  <InfoItem label="Employment Status" value={titleCase(employee.employment_status)} />
                  <InfoItem label="Probation Applicable" value={employee.probation?.applicable ? 'Yes' : 'No'} />
                  <InfoItem label="Probation Start" value={fmtDate(employee.probation?.start_date)} />
                  <InfoItem label="Probation End" value={fmtDate(employee.probation?.end_date)} />
                  <InfoItem label="Confirmation Date" value={fmtDate(employee.probation?.confirmation_date)} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoItem label="Resignation Date" value={fmtDate(employee.exit_info?.resignation_date)} />
                  <InfoItem label="Last Working Day" value={fmtDate(employee.exit_info?.last_working_day)} />
                  <InfoItem label="Exit Date" value={fmtDate(employee.exit_info?.exit_date)} />
                </div>
                {employee.exit_info?.exit_reason ? (
                  <InfoItem label="Exit Reason" value={employee.exit_info.exit_reason} />
                ) : null}
              </div>
            )}

            {activeTab === 'documents' && (
              <DocumentsTab employeeId={employee.id} ownerName={employee.full_name} canManage={canManageHrDocuments} />
            )}
            {activeTab === 'attendance' && <PlaceholderTab name="Attendance" />}
            {activeTab === 'leave' && <PlaceholderTab name="Leave" />}
            {activeTab === 'salary' && <PlaceholderTab name="Salary" />}
            {activeTab === 'lifecycle' && <PlaceholderTab name="Lifecycle / History" />}
          </div>

          {showEdit && (
            <EmployeeFormModal
              open={showEdit}
              onClose={() => setShowEdit(false)}
              mode="edit"
              initialData={employee}
              departments={departments}
              assignableUsers={assignableUsers}
              onSaved={handleSaved}
            />
          )}
        </>
      )}
    </div>
  )
}
