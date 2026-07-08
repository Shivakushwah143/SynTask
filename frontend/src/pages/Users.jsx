import { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw, X } from 'lucide-react'
import { useConfirmation } from '../hooks/useConfirmation'
import { usersAPI } from '../api/users'
import { departmentsAPI } from '../api/departments'
import { useAuthStore } from '../store/authStore'
import { hasCompanyAdminAccess, isLeadRole, normalizeRole, getRoleLabel } from '../utils/roles'
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
  
  // Check if current user is a Lead
  const isLead = isLeadRole(user?.role)
  const isCompanyAdmin = hasCompanyAdminAccess(user?.role)

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
      setShowAddModal(false)
      setFormErrors({})
      await fetchUsers()
      
      // Reset form
      e.target.reset()
      setUserType('employee')
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
    const normalizedRole = normalizeRole(userToEdit.role)
    setUserType(normalizedRole === 'manager' ? 'manager' : normalizedRole === 'lead' ? 'lead' : 'employee')
    setShowAddModal(true)
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
      setShowAddModal(false)
      setEditingUser(null)
      setFormErrors({})
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-screen overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingUser ? 'Edit User' : 'Add New User'}
            </h2>
            
            {/* User Type Selection - Only show for Company Admin and when adding new user */}
            {isCompanyAdmin && !editingUser && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  User Type
                </label>
                <div className="flex space-x-4">
                  <button
                    type="button"
                    onClick={() => setUserType('manager')}
                    className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                      userType === 'manager'
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-primary-300'
                    }`}
                  >
                    Manager
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserType('lead')}
                    className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                      userType === 'lead'
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-primary-300'
                    }`}
                  >
                    Lead
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserType('employee')}
                    className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                      userType === 'employee'
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-primary-300'
                    }`}
                  >
                    Employee
                  </button>
                </div>
              </div>
            )}
            
            {/* Info message for Leads */}
            {isLead && !editingUser && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> The employee you create will be automatically added to your team.
                </p>
              </div>
            )}

            <form onSubmit={editingUser ? handleUpdateUser : handleAddUser} className="space-y-4" autoComplete="off">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  <p className="text-gray-500 text-xs mt-1">
                    Must contain at least 8 characters, one uppercase, one lowercase, and one number
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Department
                  </label>
                  <select
                    name="department_id"
                    defaultValue={editingUser?.department_id || ''}
                    className="input"
                  >
                    <option value="">No department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">
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

              <div className="flex space-x-3 pt-4">
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
                  onClick={() => {
                    setShowAddModal(false)
                    setEditingUser(null)
                    setUserType('employee')
                    setFormErrors({})
                    // Reset form
                    const form = document.querySelector('form')
                    if (form) form.reset()
                  }}
                  disabled={submitting}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Users
