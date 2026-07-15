import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, RefreshCw, UserPlus, X } from 'lucide-react'
import { useConfirmation } from '../hooks/useConfirmation'
import { usersAPI } from '../api/users'
import { departmentsAPI } from '../api/departments'
import { useAuthStore } from '../store/authStore'
import { hasCompanyAdminAccess, isLeadRole, normalizeRole, getRoleLabel } from '../utils/roles'
import { EmptyState } from '../components/ui'
import toast from 'react-hot-toast'

const Users = () => {
  const { user } = useAuthStore()
  const { confirm } = useConfirmation()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [userType, setUserType] = useState('employee') // 'lead' or 'employee'
  const [submitting, setSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [departments, setDepartments] = useState([])
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('')
  const [showDepartmentCreate, setShowDepartmentCreate] = useState(false)
  const [newDepartmentName, setNewDepartmentName] = useState('')
  const [newDepartmentManagerId, setNewDepartmentManagerId] = useState('')
  const [departmentSubmitting, setDepartmentSubmitting] = useState(false)
  const [departmentError, setDepartmentError] = useState('')
  
  // Check if current user is a Lead
  const isLead = isLeadRole(user?.role)
  const isCompanyAdmin = hasCompanyAdminAccess(user?.role)
  const isEmployee = normalizeRole(user?.role) === 'employee'
  const managerOptions = useMemo(
    () => users.filter((item) => item.status === 'active'),
    [users],
  )

  // Fetch users
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      console.log('📡 Fetching users...')
      const data = await usersAPI.listUsers()
      console.log('✅ Users received:', data)
      
      if (data && Array.isArray(data.users)) {
        setUsers(data.users)
      } else {
        setUsers([])
      }
    } catch (error) {
      console.error('❌ Error loading users:', error)
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to load users'
      setError(errorMsg)
      toast.error(errorMsg)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDepartments = useCallback(async () => {
    if (!isCompanyAdmin) return
    try {
      const data = await departmentsAPI.listDepartments()
      setDepartments(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error loading departments:', error)
      setDepartments([])
    }
  }, [isCompanyAdmin])

  useEffect(() => {
    fetchUsers()
    if (isCompanyAdmin) {
      fetchDepartments()
    }
  }, [fetchUsers, fetchDepartments, isCompanyAdmin])

  if (isEmployee) {
    return (
      <div className="p-6">
        <EmptyState
          title="Access denied"
          description="You do not have permission to view this page."
        />
      </div>
    )
  }

  // Validate form data
  const validateForm = (formData) => {
    const errors = {}
    
    // First name validation
    const firstName = formData.get('first_name')?.trim()
    if (!firstName) {
      errors.first_name = 'First name is required'
    } else if (firstName.length < 2) {
      errors.first_name = 'First name must be at least 2 characters'
    }
    
    // Last name validation
    const lastName = formData.get('last_name')?.trim()
    if (!lastName) {
      errors.last_name = 'Last name is required'
    } else if (lastName.length < 2) {
      errors.last_name = 'Last name must be at least 2 characters'
    }
    
    // Email validation
    const email = formData.get('email')?.trim()
    if (!email) {
      errors.email = 'Email is required'
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+[.][^\s@]+$/
      if (!emailRegex.test(email)) {
        errors.email = 'Please enter a valid email address'
      }
    }
    
    // Password validation
    const password = formData.get('password')
    if (!password) {
      errors.password = 'Password is required'
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters'
    } else if (!/(?=.*[a-z])(?=.*[A-Z])/.test(password)) {
      errors.password = 'Password must contain at least one uppercase and one lowercase letter'
    } else if (!/(?=.*\d)/.test(password)) {
      errors.password = 'Password must contain at least one number'
    }
    
    // Phone validation (optional but must be valid if provided)
    const phone = formData.get('phone')?.trim()
    if (phone) {
      const phoneRegex = /^\+?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/
      if (!phoneRegex.test(phone)) {
        errors.phone = 'Please enter a valid phone number'
      }
    }
    
    // Lead ID validation (if provided)
    const leadId = formData.get('lead_id')?.trim()
    if (leadId && !/^[0-9a-fA-F]{24}$/.test(leadId)) {
      errors.lead_id = 'Please enter a valid Lead ID'
    }
    
    return errors
  }

  // Handle add user submit
  const handleAddUser = async (e) => {
    e.preventDefault()
    if (submitting) return

    const formData = new FormData(e.target)
    
    // Validate form
    const errors = validateForm(formData)
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }
    
    setFormErrors({})
    
    try {
      setSubmitting(true)
      console.log('Creating user:', userType)
      
      const userData = {
        email: formData.get('email')?.trim(),
        password: formData.get('password'),
        first_name: formData.get('first_name')?.trim(),
        last_name: formData.get('last_name')?.trim(),
        phone: formData.get('phone')?.trim() || '',
      }

      if (isCompanyAdmin) {
        const departmentId = formData.get('department_id')?.trim() || ''
        const selectedDepartment = departments.find((department) => department.id === departmentId)
        userData.department_id = departmentId
        userData.department = selectedDepartment?.name || ''
      } else {
        userData.department = formData.get('department')?.trim() || ''
      }

      if (userType === 'manager') {
        userData.role = 'manager'
        userData.reports_to = String(user.id)
        await usersAPI.createUser(userData)
      } else if (userType === 'lead') {
        userData.team_name = formData.get('team_name') || ''
        await usersAPI.createLead(userData)
      } else {
        // Only set lead_id if provided (for Company Admin)
        // For Leads, lead_id is automatically set by backend
        if (isCompanyAdmin) {
          userData.lead_id = formData.get('lead_id') || ''
        }
        userData.designation = formData.get('designation') || ''
        await usersAPI.createEmployee(userData)
      }
      
      toast.success(`✅ ${userType === 'manager' ? 'Manager' : userType === 'lead' ? 'Lead' : 'Employee'} created successfully!`)
      closeUserModal()
      await fetchUsers()
      
      // Reset form
      e.target.reset()
    } catch (error) {
      console.error('Error creating user:', error)
      
      let errorMessage = `Failed to create ${userType}`
      if (error.response?.status === 422 && error.response?.data?.detail) {
        const detail = error.response.data.detail
        if (Array.isArray(detail)) {
          errorMessage = detail.map(err => {
            const field = Array.isArray(err.loc) ? err.loc.join('.') : 'field'
            return `${field}: ${err.msg || 'Invalid'}`
          }).join('; ')
        } else if (typeof detail === 'string') {
          errorMessage = detail
        }
      } else if (error.response?.data?.detail) {
        errorMessage = String(error.response.data.detail)
      }
      
      toast.error(errorMessage, { duration: 6000 })
    } finally {
      setSubmitting(false)
    }
  }

  // Handle edit
  const handleEdit = (userToEdit) => {
    setEditingUser(userToEdit)
    setSelectedDepartmentId(userToEdit.department_id || '')
    setShowDepartmentCreate(false)
    setNewDepartmentName('')
    setNewDepartmentManagerId('')
    setDepartmentError('')
    const normalizedRole = normalizeRole(userToEdit.role)
    setUserType(normalizedRole === 'manager' ? 'manager' : normalizedRole === 'lead' ? 'lead' : 'employee')
    setShowAddModal(true)
  }

  const closeUserModal = () => {
    setShowAddModal(false)
    setEditingUser(null)
    setUserType('employee')
    setFormErrors({})
    setSelectedDepartmentId('')
    setShowDepartmentCreate(false)
    setNewDepartmentName('')
    setNewDepartmentManagerId('')
    setDepartmentError('')
    const form = document.querySelector('form')
    if (form) form.reset()
  }

  const handleCreateDepartment = async () => {
    const name = newDepartmentName.trim()
    if (!name) {
      setDepartmentError('Department name is required')
      return
    }

    try {
      setDepartmentSubmitting(true)
      setDepartmentError('')
      const department = await departmentsAPI.createDepartment({
        name,
        manager_id: newDepartmentManagerId || null,
      })
      setDepartments((current) => {
        const withoutDuplicate = current.filter((item) => item.id !== department.id)
        return [...withoutDuplicate, department].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      })
      setSelectedDepartmentId(department.id)
      setShowDepartmentCreate(false)
      setNewDepartmentName('')
      setNewDepartmentManagerId('')
      toast.success('Department created')
    } catch (error) {
      const message = error.response?.data?.detail || error.message || 'Failed to create department'
      setDepartmentError(message)
      toast.error(message)
    } finally {
      setDepartmentSubmitting(false)
    }
  }

  // Handle update user
  const handleUpdateUser = async (e) => {
    e.preventDefault()
    if (submitting || !editingUser) return

    const formData = new FormData(e.target)
    const updateData = {
      first_name: formData.get('first_name'),
      last_name: formData.get('last_name'),
      email: formData.get('email'),
      phone: formData.get('phone') || '',
    }

    if (isCompanyAdmin) {
      const departmentId = formData.get('department_id')?.trim() || ''
      const selectedDepartment = departments.find((department) => department.id === departmentId)
      if (departmentId) {
        updateData.department_id = departmentId
      }
      if (selectedDepartment) {
        updateData.department = selectedDepartment.name
      }
    } else {
      updateData.department = formData.get('department') || ''
    }

    // Add role-specific fields
    if (editingUser.role === 'lead' && formData.get('team_name')) {
      updateData.team_name = formData.get('team_name')
    } else if (editingUser.role === 'employee') {
      if (formData.get('designation')) {
        updateData.designation = formData.get('designation')
      }
    }

    // Only update password if provided
    const password = formData.get('password')
    if (password && password.length > 0) {
      updateData.password = password
    }

    try {
      setSubmitting(true)
      await usersAPI.updateUser(editingUser.id, updateData)
      toast.success('User updated successfully')
      closeUserModal()
      await fetchUsers()
      // Reset form
      const form = document.querySelector('form')
      if (form) form.reset()
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to update user'
      toast.error(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  // Handle delete
  const handleDelete = async (userId) => {
    const confirmed = await confirm({
      title: 'Delete User',
      message: 'Are you sure you want to delete this user?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDangerous: true,
    })
    if (!confirmed) return
    
    try {
      await usersAPI.deleteUser(userId)
      toast.success('User deleted successfully')
      await fetchUsers()
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to delete user'
      toast.error(errorMessage)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="p-4">
        <div className="mb-4">
          <h1 className="text-lg font-bold text-gray-900">Users</h1>
          <p className="text-gray-600 text-xs mt-0.5">Manage team members</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Loading users...</p>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="p-4">
        <div className="mb-4">
          <h1 className="text-lg font-bold text-gray-900">Users</h1>
          <p className="text-gray-600 text-xs mt-0.5">Manage team members</p>
        </div>
        <div className="card text-center py-12">
          <div className="text-red-600 mb-4">
            <X className="h-12 w-12 mx-auto" />
          </div>
          <p className="text-gray-900 font-semibold mb-2">Failed to load users</p>
          <p className="text-gray-600 text-sm mb-4">{error}</p>
          <button onClick={fetchUsers} className="btn btn-primary inline-flex items-center">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Users</h1>
          <p className="text-gray-600 text-xs mt-0.5">
            {isLead ? 'Manage your team members' : 'Manage team members'}
          </p>
        </div>
        {(isCompanyAdmin || isLead) && (
          <button
            onClick={() => {
              setShowAddModal(true)
              setSelectedDepartmentId('')
              setShowDepartmentCreate(false)
              setNewDepartmentName('')
              setNewDepartmentManagerId('')
              setDepartmentError('')
              // If Lead, only allow creating employees
              if (isLead) {
                setUserType('employee')
              }
            }}
            className="btn btn-primary flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            {isLead ? 'Add Employee' : 'Add User'}
          </button>
        )}
      </div>

      {/* Users List */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    No users found. Click {'"Add User"'} to create your first team member.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                          <span className="text-primary-600 font-semibold text-sm">
                            {user.first_name?.[0]}{user.last_name?.[0]}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.first_name} {user.last_name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                    {getRoleLabel(user.role) || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.department_name || user.department || user.department_id || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`badge ${
                          user.status === 'active'
                            ? 'badge-success'
                            : 'badge-secondary'
                        }`}
                      >
                        {user.status || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        onClick={() => handleEdit(user)}
                        className="text-primary-600 hover:text-primary-900 mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-md">
          <div className="my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-surface-border/80 bg-white shadow-2xl dark:border-[var(--color-app-border)] dark:bg-[rgb(29_24_19)] dark:shadow-[0_28px_90px_rgba(0,0,0,0.5)]">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200/80 bg-gradient-to-r from-[#fff7ed] via-[#fffdf8] to-white px-6 py-5 dark:border-[var(--color-app-border)] dark:bg-[linear-gradient(135deg,rgba(40,33,25,0.98),rgba(29,24,19,0.98)_52%,rgba(20,16,12,0.98))]">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-primary-600 text-white shadow-[0_12px_28px_rgba(229,106,31,0.28)] dark:bg-primary-500">
                  <UserPlus className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-[var(--color-app-text)]">
                    {editingUser ? 'Edit User' : 'Add New User'}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-[var(--color-app-text-muted)]">
                    {editingUser ? 'Update profile, department, and role details.' : 'Create teammate profile with role, department, and access details.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeUserModal}
                className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500/30 dark:text-[var(--color-app-text-muted)] dark:hover:bg-white/10 dark:hover:text-[var(--color-app-text)]"
                aria-label="Close user form"
                disabled={submitting}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5 dark:bg-[rgb(29_24_19)]">
            
            {/* User Type Selection - Only show for Company Admin and when adding new user */}
            {isCompanyAdmin && !editingUser && (
              <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-muted)]">
                <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-[var(--color-app-text-secondary)]">
                  User Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setUserType('manager')}
                    className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                      userType === 'manager'
                        ? 'border-primary-500 bg-primary-600 text-white shadow-sm dark:bg-primary-500'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50 dark:border-[var(--color-app-border)] dark:bg-[rgb(22_18_14)] dark:text-[var(--color-app-text-secondary)] dark:hover:bg-[var(--color-app-surface-subtle)] dark:hover:text-[var(--color-app-text)]'
                    }`}
                  >
                    Manager
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserType('lead')}
                    className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                      userType === 'lead'
                        ? 'border-primary-500 bg-primary-600 text-white shadow-sm dark:bg-primary-500'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50 dark:border-[var(--color-app-border)] dark:bg-[rgb(22_18_14)] dark:text-[var(--color-app-text-secondary)] dark:hover:bg-[var(--color-app-surface-subtle)] dark:hover:text-[var(--color-app-text)]'
                    }`}
                  >
                    Lead
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserType('employee')}
                    className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                      userType === 'employee'
                        ? 'border-primary-500 bg-primary-600 text-white shadow-sm dark:bg-primary-500'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50 dark:border-[var(--color-app-border)] dark:bg-[rgb(22_18_14)] dark:text-[var(--color-app-text-secondary)] dark:hover:bg-[var(--color-app-surface-subtle)] dark:hover:text-[var(--color-app-text)]'
                    }`}
                  >
                    Employee
                  </button>
                </div>
              </div>
            )}
             
            {/* Info message for Leads */}
            {isLead && !editingUser && (
              <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-500/25 dark:bg-sky-500/10">
                <p className="text-sm text-sky-800 dark:text-sky-100">
                  <strong>Note:</strong> The employee you create will be automatically added to your team.
                </p>
              </div>
            )}

            <form onSubmit={editingUser ? handleUpdateUser : handleAddUser} className="grid grid-cols-1 gap-4 sm:grid-cols-2" autoComplete="off">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">
                  First Name *
                </label>
                  <input
                  type="text"
                  name="first_name"
                  required
                  autoComplete="off"
                  defaultValue={editingUser?.first_name || ''}
                  className={`input ${formErrors.first_name ? 'border-red-500' : ''}`}
                  placeholder="Enter first name"
                  onChange={() => {
                    if (formErrors.first_name) {
                      setFormErrors({ ...formErrors, first_name: '' })
                    }
                  }}
                />
                {formErrors.first_name && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.first_name}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">
                  Last Name *
                </label>
                  <input
                  type="text"
                  name="last_name"
                  required
                  autoComplete="off"
                  defaultValue={editingUser?.last_name || ''}
                  className={`input ${formErrors.last_name ? 'border-red-500' : ''}`}
                  placeholder="Enter last name"
                  onChange={() => {
                    if (formErrors.last_name) {
                      setFormErrors({ ...formErrors, last_name: '' })
                    }
                  }}
                />
                {formErrors.last_name && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.last_name}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">
                  Email *
                </label>
                  <input
                  type="email"
                  name="email"
                  required
                  autoComplete="new-password"
                  defaultValue={editingUser?.email || ''}
                  className={`input ${formErrors.email ? 'border-red-500' : ''}`}
                  placeholder="Enter email address"
                  onChange={() => {
                    if (formErrors.email) {
                      setFormErrors({ ...formErrors, email: '' })
                    }
                  }}
                />
                {formErrors.email && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">
                  Password {editingUser ? '(leave blank to keep current)' : '*'}
                </label>
                <input
                  type="password"
                  name="password"
                  required={!editingUser}
                  minLength={8}
                  autoComplete="new-password"
                  className={`input ${formErrors.password ? 'border-red-500' : ''}`}
                  placeholder={editingUser ? "Leave blank to keep current password" : "Enter password (min 8 characters)"}
                  onChange={() => {
                    if (formErrors.password) {
                      setFormErrors({ ...formErrors, password: '' })
                    }
                  }}
                />
                {formErrors.password && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>
                )}
                {!editingUser && (
                  <p className="text-gray-500 text-xs mt-1 dark:text-[var(--color-app-text-muted)]">
                    Must contain at least 8 characters, one uppercase, one lowercase, and one number
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  autoComplete="off"
                  defaultValue={editingUser?.phone || ''}
                  className={`input ${formErrors.phone ? 'border-red-500' : ''}`}
                  placeholder="+1 234 567 8900"
                  onChange={() => {
                    if (formErrors.phone) {
                      setFormErrors({ ...formErrors, phone: '' })
                    }
                  }}
                />
                {formErrors.phone && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>
                )}
              </div>
              {isCompanyAdmin ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">
                    Department
                  </label>
                  <select
                    name="department_id"
                    value={selectedDepartmentId}
                    onChange={(event) => {
                      if (event.target.value === '__create_department__') {
                        setShowDepartmentCreate(true)
                        setDepartmentError('')
                        return
                      }
                      setSelectedDepartmentId(event.target.value)
                      setShowDepartmentCreate(false)
                    }}
                    className="input"
                  >
                    <option value="">No department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                    <option value="__create_department__">+ Create new department</option>
                  </select>
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-primary-200/70 bg-primary-50/80 px-3 py-2.5 text-xs text-primary-800 shadow-sm dark:border-primary-500/25 dark:bg-primary-500/10 dark:text-primary-100">
                    <span className="font-medium">Missing department?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDepartmentCreate(true)
                        setDepartmentError('')
                      }}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-400"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Create here
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">
                    Department
                  </label>
                  <input
                    type="text"
                    name="department"
                    autoComplete="off"
                    defaultValue={editingUser?.department || ''}
                    className="input"
                    placeholder="Enter department name"
                  />
                </div>
              )}

              {/* Lead-specific fields */}
              {userType === 'lead' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">
                    Team Name
                  </label>
                  <input
                    type="text"
                    name="team_name"
                    className="input"
                    defaultValue={editingUser?.team_name || ''}
                    placeholder="Development Team"
                  />
                </div>
              )}

              {/* Employee-specific fields */}
              {userType === 'employee' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">
                      Designation
                    </label>
                    <input
                      type="text"
                      name="designation"
                      className="input"
                      defaultValue={editingUser?.designation || ''}
                      placeholder="Software Developer"
                    />
                  </div>
                  {/* Only show Lead ID field for Company Admin, not for Leads */}
                  {isCompanyAdmin && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">
                        Lead ID (Optional)
                      </label>
                      <input
                        type="text"
                        name="lead_id"
                        autoComplete="off"
                        className={`input ${formErrors.lead_id ? 'border-red-500' : ''}`}
                        placeholder="Enter Lead ID if assigned to a lead"
                        onChange={() => {
                          if (formErrors.lead_id) {
                            setFormErrors({ ...formErrors, lead_id: '' })
                          }
                        }}
                      />
                      {formErrors.lead_id && (
                        <p className="text-red-500 text-xs mt-1">{formErrors.lead_id}</p>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="flex gap-3 border-t border-gray-200 pt-4 sm:col-span-2 dark:border-[var(--color-app-border)]">
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary flex-1"
                >
                  {submitting 
                    ? (editingUser ? 'Updating...' : 'Creating...') 
                    : editingUser 
                      ? 'Update User' 
                      : `Create ${userType === 'manager' ? 'Manager' : userType === 'lead' ? 'Lead' : 'Employee'}`}
                </button>
                <button
                  type="button"
                  onClick={closeUserModal}
                  disabled={submitting}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
            </div>

            {showDepartmentCreate && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Create department">
                <div className="w-full max-w-md overflow-hidden rounded-2xl border border-surface-border bg-white shadow-2xl dark:border-[var(--color-app-border)] dark:bg-[rgb(29_24_19)]">
                  <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-gradient-to-r from-[#fff7ed] to-white px-5 py-4 dark:border-[var(--color-app-border)] dark:bg-[linear-gradient(135deg,rgba(40,33,25,0.98),rgba(29,24,19,0.98))]">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-[var(--color-app-text)]">Create Department</h3>
                      <p className="mt-1 text-sm text-gray-500 dark:text-[var(--color-app-text-muted)]">
                        {userType === 'manager'
                          ? 'Add department for this manager.'
                          : 'Add department and assign manager now.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDepartmentCreate(false)
                        setNewDepartmentName('')
                        setNewDepartmentManagerId('')
                        setDepartmentError('')
                      }}
                      className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-[var(--color-app-text-muted)] dark:hover:bg-white/10 dark:hover:text-[var(--color-app-text)]"
                      aria-label="Close department popup"
                      disabled={departmentSubmitting}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="space-y-4 px-5 py-5 dark:bg-[rgb(29_24_19)]">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-[var(--color-app-text-secondary)]">
                        Department Name *
                      </label>
                      <input
                        type="text"
                        value={newDepartmentName}
                        onChange={(event) => {
                          setNewDepartmentName(event.target.value)
                          if (departmentError) setDepartmentError('')
                        }}
                        className={`input ${departmentError ? 'border-red-500' : ''}`}
                        maxLength={100}
                        placeholder="e.g. Operations"
                        autoFocus
                      />
                      {departmentError && (
                        <p className="mt-1 text-xs text-red-500" role="alert">{departmentError}</p>
                      )}
                    </div>

                    {userType !== 'manager' && (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-[var(--color-app-text-secondary)]">
                          Manager
                        </label>
                        <select
                          value={newDepartmentManagerId}
                          onChange={(event) => setNewDepartmentManagerId(event.target.value)}
                          className="input"
                        >
                          <option value="">No manager</option>
                          {managerOptions.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.first_name} {item.last_name} ({getRoleLabel(item.role)})
                            </option>
                          ))}
                        </select>
                        {managerOptions.length === 0 && (
                          <p className="mt-1 text-xs text-amber-600 dark:text-amber-200">No active users available for manager assignment.</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3 border-t border-gray-200 bg-white/95 px-5 py-4 dark:border-[var(--color-app-border)] dark:bg-[rgb(24_19_15)]">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDepartmentCreate(false)
                        setNewDepartmentName('')
                        setNewDepartmentManagerId('')
                        setDepartmentError('')
                      }}
                      className="btn btn-secondary flex-1"
                      disabled={departmentSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateDepartment}
                      className="btn btn-primary flex-1"
                      disabled={departmentSubmitting}
                    >
                      {departmentSubmitting ? 'Creating...' : 'Create Department'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Users
