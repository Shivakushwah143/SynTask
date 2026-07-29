import { useEffect, useMemo, useState } from 'react'
import { PencilLine, Plus, Trash2, Building, Users, UserCog, Calendar, Briefcase, Layers, Activity, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { departmentsAPI } from '../api/departments'
import { usersAPI } from '../api/users'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { Button, ConfirmDialog, EmptyState, FormField, Modal, Table, inputClassName } from '../components/ui'
import { hasCompanyAdminAccess, getRoleLabel } from '../utils/roles'
import { timeService } from '@/services/timeService'
import { notifyDepartmentsChanged } from '../api/departments'

const emptyForm = {
  name: '',
  manager_id: '',
}

// Stat Card Component
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
    teal: 'from-teal-500 to-cyan-500',
  }

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  )
}

// Department Card Component for Grid View
const DepartmentCard = ({ department, members, onEdit, onDelete }) => {
  const memberCount = members?.length || 0
  const manager = department.manager_name || 'Not assigned'

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white font-bold text-lg shadow-lg shadow-indigo-500/20">
            {department.name?.charAt(0)?.toUpperCase() || 'D'}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{department.name}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">ID: {department.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(department)}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400"
            aria-label="Edit department"
          >
            <PencilLine className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(department)}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
            aria-label="Delete department"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <UserCog className="h-3.5 w-3.5" />
            Manager
          </div>
          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{manager}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Users className="h-3.5 w-3.5" />
            Members
          </div>
          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{memberCount}</p>
        </div>
      </div>

      {department.created_at && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
          <Calendar className="h-3.5 w-3.5" />
          Created {format(new Date(department.created_at), 'MMM d, yyyy')}
        </div>
      )}
    </div>
  )
}

const Departments = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const canManageDepartments = hasCompanyAdminAccess(user?.role)
  const [departments, setDepartments] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'table'

  const managerOptions = useMemo(
    () => users.filter((item) => item.status === 'active'),
    [users],
  )
  const departmentMembers = useMemo(() => {
    const membersByDepartment = new Map()
    users.forEach((item) => {
      const key = item.department_id || item.department
      if (!key) return
      if (!membersByDepartment.has(key)) membersByDepartment.set(key, [])
      membersByDepartment.get(key).push(item)
    })
    return membersByDepartment
  }, [users])
  const noActiveUsersAvailable = !loadingUsers && managerOptions.length === 0

  // Calculate stats
  const totalDepartments = departments.length
  const totalMembers = users.filter(u => u.department_id || u.department).length
  const departmentsWithManager = departments.filter(d => d.manager_id).length
  const departmentsWithoutManager = totalDepartments - departmentsWithManager

  const loadDepartments = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await departmentsAPI.listDepartments()
      setDepartments(Array.isArray(data) ? data : [])
    } catch (fetchError) {
      const message = fetchError.response?.data?.detail || fetchError.message || 'Failed to load departments'
      setError(message)
      toast.error(message)
      setDepartments([])
    } finally {
      setLoading(false)
    }
  }

  // Silent refresh: updates data without triggering the full-page loading spinner.
  // Used after save/delete so the page stays responsive and changes appear seamlessly.
  const refreshDepartments = async () => {
    try {
      const data = await departmentsAPI.listDepartments()
      setDepartments(Array.isArray(data) ? data : [])
    } catch (fetchError) {
      const message = fetchError.response?.data?.detail || fetchError.message || 'Failed to refresh departments'
      toast.error('Saved, but failed to refresh the department list.')
      console.error('refreshDepartments error:', message)
    }
  }

  const loadUsers = async () => {
    try {
      setLoadingUsers(true)
      const data = await usersAPI.listUsers(null, null, 'active', 0, 500)
      setUsers(data.users || [])
    } catch (fetchError) {
      console.error('Failed to load users for manager dropdown', fetchError)
      setUsers([])
    } finally {
      setLoadingUsers(false)
    }
  }

  useEffect(() => {
    if (!canManageDepartments) return
    loadDepartments()
    loadUsers()
  }, [canManageDepartments])

  const openCreate = () => {
    setEditingDepartment(null)
    setForm(emptyForm)
    setFormError('')
    setShowModal(true)
  }

  const openEdit = (department) => {
    setEditingDepartment(department)
    setForm({
      name: department.name || '',
      manager_id: department.manager_id || '',
    })
    setFormError('')
    setShowModal(true)
  }

  const closeModal = () => {
    if (submitting) return
    setShowModal(false)
    setEditingDepartment(null)
    setForm(emptyForm)
    setFormError('')
  }

  const handleSave = async (event) => {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) {
      setFormError('Department name is required.')
      return
    }
    if (name.length > 100) {
      setFormError('Department name must be 100 characters or fewer.')
      return
    }

    try {
      setSubmitting(true)
      const payload = {
        name,
        manager_id: form.manager_id || null,
      }

      if (editingDepartment) {
        await departmentsAPI.updateDepartment(editingDepartment.id, payload)
        toast.success('Department updated')
      } else {
        await departmentsAPI.createDepartment(payload)
        toast.success('Department created')
      }

      setShowModal(false)
      setEditingDepartment(null)
      setForm(emptyForm)
      setFormError('')
      await refreshDepartments()
      notifyDepartmentsChanged({ action: editingDepartment ? 'updated' : 'created' })
    } catch (saveError) {
      const message = saveError.response?.data?.detail || saveError.message || 'Failed to save department'
      setFormError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      await departmentsAPI.deleteDepartment(deleteTarget.id)
      toast.success('Department deleted')
      setDeleteTarget(null)
      await refreshDepartments()
      notifyDepartmentsChanged({ action: 'deleted' })
    } catch (deleteError) {
      const message = deleteError.response?.data?.detail || deleteError.message || 'Failed to delete department'
      toast.error(message)
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Department Name',
      render: (row) => (
        <div>
          <div className="font-semibold text-gray-900 dark:text-white">{row.name}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">ID: {row.id}</div>
        </div>
      ),
    },
    {
      key: 'manager_name',
      header: 'Manager',
      render: (row) => row.manager_name || <span className="text-gray-400">Not assigned</span>,
    },
    {
      key: 'members',
      header: 'Members',
      render: (row) => {
        const members = departmentMembers.get(row.id) || []
        return members.length ? `${members.length} user${members.length === 1 ? '' : 's'}` : <span className="text-gray-400">No members</span>
      },
    },
    {
      key: 'created_at',
      header: 'Created Date',
      render: (row) => format(timeService.instant(row.created_at), 'MMM d, yyyy'),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => openEdit(row)} className="px-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400">
            <PencilLine className="h-4 w-4" />
            <span className="sr-only">Edit</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(row)} className="px-2 text-gray-400 hover:text-rose-600 dark:hover:text-rose-400">
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      ),
    },
  ]

  if (!canManageDepartments) {
    return (
      <div className="p-6">
        <EmptyState
          title="Access denied"
          description="Departments can only be managed by company admins."
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading departments...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-600 via-indigo-600 to-blue-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
              <Building className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">Departments</h1>
              <p className="mt-1 text-indigo-100">Manage company departments and assign team managers.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
            >
              <Plus className="h-4 w-4" />
              Create Department
            </button>
            <button
              onClick={() => setViewMode(viewMode === 'grid' ? 'table' : 'grid')}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              <Layers className="h-4 w-4" />
              {viewMode === 'grid' ? 'Table View' : 'Grid View'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Departments"
          value={totalDepartments}
          icon={Building}
          color="indigo"
          subtitle="All departments"
        />
        <StatCard
          label="Total Members"
          value={totalMembers}
          icon={Users}
          color="emerald"
          subtitle="Across all departments"
        />
        <StatCard
          label="With Manager"
          value={departmentsWithManager}
          icon={UserCog}
          color="blue"
          subtitle="Assigned managers"
        />
        <StatCard
          label="No Manager"
          value={departmentsWithoutManager}
          icon={Activity}
          color="amber"
          subtitle="Needs attention"
        />
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/30 p-4 text-sm text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-400">
          {error}
        </div>
      )}

      {departments.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-700">
            <Building className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">No departments yet</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Create your first department to organize users and keep reporting structured.</p>
          <button
            onClick={openCreate}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Create Department
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((department) => (
            <DepartmentCard
              key={department.id}
              department={department}
              members={departmentMembers.get(department.id) || []}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
          <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                  <Building className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 dark:text-white">All Departments</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{departments.length} departments</p>
                </div>
              </div>
            </div>
          </div>
          <Table columns={columns} data={departments} emptyMessage="No departments found" />
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingDepartment ? 'Edit Department' : 'Create Department'}
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <Building className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {editingDepartment ? 'Edit Department' : 'Create New Department'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {editingDepartment ? 'Update department details' : 'Add a new department to your organization'}
              </p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <FormField label="Department Name" htmlFor="department-name" required error={formError && !formError.toLowerCase().includes('manager') ? formError : ''}>
              <input
                id="department-name"
                name="name"
                value={form.name}
                onChange={(event) => {
                  setForm((current) => ({ ...current, name: event.target.value }))
                  if (formError) setFormError('')
                }}
                className={`${inputClassName} text-lg font-semibold`}
                maxLength={100}
                placeholder="e.g. Creative, Engineering, HR"
                autoFocus
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Maximum 100 characters</p>
            </FormField>

            <FormField label="Manager" htmlFor="department-manager">
              <select
                id="department-manager"
                name="manager_id"
                value={form.manager_id}
                onChange={(event) => setForm((current) => ({ ...current, manager_id: event.target.value }))}
                className={inputClassName}
                disabled={loadingUsers}
              >
                <option value="">No manager</option>
                {managerOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.first_name} {item.last_name} ({getRoleLabel(item.role)})
                  </option>
                ))}
              </select>
              {loadingUsers && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Loading users...</p>
              )}
            </FormField>

            {noActiveUsersAvailable && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-300">
                <p className="font-medium">No active users available yet.</p>
                <p className="mt-1 text-xs">
                  Create a user from the Users page first, then come back to assign the department.
                </p>
                <Button
                  variant="secondary"
                  type="button"
                  className="mt-2"
                  onClick={() => navigate('/users')}
                >
                  Go to Users
                </Button>
              </div>
            )}

            {editingDepartment && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <Users className="h-4 w-4" />
                  Department Members
                </div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {(() => {
                    const members = departmentMembers.get(editingDepartment.id) || []
                    if (!members.length) return 'No users are assigned to this department yet.'
                    return members.map((item) => `${item.first_name} ${item.last_name}`).join(', ')
                  })()}
                </p>
              </div>
            )}

            {formError && formError.toLowerCase().includes('manager') && (
              <p className="text-sm text-rose-600" role="alert">
                {formError}
              </p>
            )}

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Button variant="secondary" type="button" onClick={closeModal} className="w-full sm:flex-1">
                Cancel
              </Button>
              <Button type="submit" loading={submitting} className="w-full sm:flex-1">
                {editingDepartment ? 'Save Changes' : 'Create Department'}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Department"
        message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.` : ''}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}

export default Departments
