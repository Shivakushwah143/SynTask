import { useEffect, useMemo, useState } from 'react'
import { PencilLine, Plus, Trash2 } from 'lucide-react'
import { departmentsAPI } from '../api/departments'
import { usersAPI } from '../api/users'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { Button, ConfirmDialog, EmptyState, FormField, Modal, Table, inputClassName } from '../components/ui'
import { hasCompanyAdminAccess, getRoleLabel } from '../utils/roles'

const emptyForm = {
  name: '',
  manager_id: '',
}

const Departments = () => {
  const { user } = useAuthStore()
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

  const managerOptions = useMemo(
    () => users.filter((item) => item.status === 'active'),
    [users],
  )

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
      await loadDepartments()
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
      await loadDepartments()
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
          <div className="font-semibold text-gray-900 dark:text-gray-100">{row.name}</div>
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
      key: 'created_at',
      header: 'Created Date',
      render: (row) => format(new Date(row.created_at), 'MMM d, yyyy'),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => openEdit(row)} className="px-2">
            <PencilLine className="h-4 w-4" />
            <span className="sr-only">Edit</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(row)} className="px-2 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-300">
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
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-12 w-56 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-80 rounded-2xl bg-gray-200 dark:bg-gray-800" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Departments</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Manage company departments and assign team managers.</p>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          Create Department
        </Button>
      </div>

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {departments.length === 0 ? (
        <EmptyState
          title="No departments yet"
          description="Create your first department to organize users and keep reporting structured."
          action={<Button onClick={openCreate}>Create Department</Button>}
        />
      ) : (
        <Table columns={columns} data={departments} emptyMessage="No departments found" />
      )}

      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingDepartment ? 'Edit Department' : 'Create Department'}
        size="md"
      >
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
              className={inputClassName}
              maxLength={100}
              placeholder="e.g. Creative"
            />
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
          </FormField>

          {formError && formError.toLowerCase().includes('manager') ? (
            <p className="text-sm text-red-600" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Button variant="secondary" type="button" onClick={closeModal} className="w-full sm:flex-1">
              Cancel
            </Button>
            <Button type="submit" loading={submitting} className="w-full sm:flex-1">
              {editingDepartment ? 'Save Changes' : 'Create Department'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Department"
        message={deleteTarget ? `Are you sure you want to delete ${deleteTarget.name}? This action cannot be undone.` : ''}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}

export default Departments
