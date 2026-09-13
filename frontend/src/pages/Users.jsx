import { useState, useEffect, useCallback, useMemo } from 'react'
import { Download, Plus, RefreshCw, Upload, UserPlus, X, Users as UsersIcon, UserCheck, UserCog, Briefcase, Mail, Phone, Shield, Building, Calendar, Activity } from 'lucide-react'
import Papa from 'papaparse'
import { useConfirmation } from '../hooks/useConfirmation'
import { usersAPI } from '../api/users'
import { departmentsAPI } from '../api/departments'
import { useAuthStore } from '../store/authStore'
import { hasCompanyAdminAccess, isLeadRole, normalizeRole, getRoleLabel } from '../utils/roles'
import { EmptyState, Modal, PasswordInput, PhoneInput, phoneValidationMessage } from '../components/ui'
import { getDesignationOptions } from '../constants/designations'
import toast from 'react-hot-toast'
import ModulePermissionSelector from '../components/ui/ModulePermissionSelector'
import { getRoleModuleDefaults, getMemberEditDefaults } from '../config/modulePermissions'

const BULK_HEADERS = ['role', 'first_name', 'last_name', 'email', 'password', 'phone', 'department', 'designation', 'team_name', 'lead_email']
const makeTempPassword = () => `SynTask@${Math.random().toString(36).slice(2, 8)}1`

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
    <div className="group rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-3">
        <div className={`shrink-0 rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
          <p className="mt-0.5 truncate text-lg font-bold text-gray-900 dark:text-white">{value}</p>
          {subtitle && <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}

const Users = () => {
  const { user } = useAuthStore()
  const currentUser = user
  const { confirm } = useConfirmation()
  const [users, setUsers] = useState([])
  // Full company roster (Admin/Sub Admin/Manager/Lead/Employee, any department)
  // for the Reporting Manager dropdown. The main `users` list is paginated to
  // 20 rows and hierarchy-scoped (managers only see subordinates + their
  // department), so it cannot feed that dropdown.
  const [companyRoster, setCompanyRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [userType, setUserType] = useState('employee')
  const [submitting, setSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [departments, setDepartments] = useState([])
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('')
  const [showDepartmentCreate, setShowDepartmentCreate] = useState(false)
  const [newDepartmentName, setNewDepartmentName] = useState('')
  const [newDepartmentManagerId, setNewDepartmentManagerId] = useState('')
  const [departmentSubmitting, setDepartmentSubmitting] = useState(false)
  const [departmentError, setDepartmentError] = useState('')
  const [customDesignations, setCustomDesignations] = useState([])
  const [selectedDesignation, setSelectedDesignation] = useState('')
  const [showDesignationCreate, setShowDesignationCreate] = useState(false)
  const [newDesignationName, setNewDesignationName] = useState('')
  const [designationError, setDesignationError] = useState('')
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkRows, setBulkRows] = useState([])
  const [bulkErrors, setBulkErrors] = useState([])
  const [bulkImporting, setBulkImporting] = useState(false)
  const [selectedModules, setSelectedModules] = useState(() => getRoleModuleDefaults('employee'))
  const [modulesTouched, setModulesTouched] = useState(false)

  const isLead = isLeadRole(user?.role)
  const isCompanyAdmin = hasCompanyAdminAccess(user?.role)
  const normalizedCurrentRole = normalizeRole(user?.role)
  const isFullCompanyAdmin = normalizedCurrentRole === 'admin'
  const isSubAdmin = normalizedCurrentRole === 'sub_admin'
  const isManager = normalizedCurrentRole === 'manager'
  const isEmployee = normalizedCurrentRole === 'employee'
  const canReadDepartments = isCompanyAdmin || isManager || isLead
  const allowedBulkRoles = useMemo(() => {
    if (isFullCompanyAdmin) return ['sub_admin', 'manager', 'lead', 'employee']
    if (isSubAdmin) return ['manager', 'lead', 'employee']
    if (isManager) return ['lead', 'employee']
    if (isLead) return ['employee']
    return []
  }, [isFullCompanyAdmin, isLead, isManager, isSubAdmin])
  // All active company members (Admin/Sub Admin/Manager/Lead/Employee), any
  // department or seniority, can be chosen as an employee's reporting manager.
  const reportingManagerOptions = useMemo(
    () => (companyRoster.length ? companyRoster : users.filter((item) => item.status === 'active')),
    [companyRoster, users],
  )
  const designationOptions = useMemo(() => {
    return getDesignationOptions(customDesignations, editingUser?.designation || '')
  }, [customDesignations, editingUser?.designation])
  const departmentNameById = useMemo(
    () => departments.reduce((lookup, department) => {
      lookup[department.id] = department.name
      return lookup
    }, {}),
    [departments],
  )

  // Calculate stats
  const totalUsers = users.length
  const activeUsers = users.filter(u => u.status === 'active').length
  const managers = users.filter(u => normalizeRole(u.role) === 'manager').length
  const subAdmins = users.filter(u => normalizeRole(u.role) === 'sub_admin').length
  const leads = users.filter(u => normalizeRole(u.role) === 'lead').length
  const employees = users.filter(u => normalizeRole(u.role) === 'employee').length

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await usersAPI.listUsers()

      if (data && Array.isArray(data.users)) {
        setUsers(data.users)
      } else {
        setUsers([])
      }
    } catch (error) {
      console.error('Error loading users:', error)
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to load users'
      setError(errorMsg)
      toast.error(errorMsg)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  // The Reporting Manager dropdown needs every company member regardless of
  // department/seniority (admins included). /users/assignable returns the full
  // active roster for the current user's company.
  const fetchCompanyRoster = useCallback(async () => {
    try {
      const data = await usersAPI.getAssignableUsers()
      if (data && Array.isArray(data.users)) {
        setCompanyRoster(data.users)
      }
    } catch (error) {
      console.error('Error loading company roster:', error)
      setCompanyRoster([])
    }
  }, [])

  const fetchDepartments = useCallback(async () => {
    if (!canReadDepartments) return
    try {
      const data = await departmentsAPI.listDepartments()
      const list = Array.isArray(data) ? data : []
      setDepartments([...list].sort((a, b) => (a.name || '').localeCompare(b.name || '')))
    } catch (error) {
      console.error('Error loading departments:', error)
      setDepartments([])
    }
  }, [canReadDepartments])

  useEffect(() => {
    fetchUsers()
    fetchCompanyRoster()
    if (canReadDepartments) {
      fetchDepartments()
    }
  }, [fetchUsers, fetchCompanyRoster, fetchDepartments, canReadDepartments])

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

  const validateForm = (formData) => {
    const errors = {}

    const firstName = formData.get('first_name')?.trim()
    if (!firstName) {
      errors.first_name = 'First name is required'
    } else if (firstName.length < 2) {
      errors.first_name = 'First name must be at least 2 characters'
    }

    const lastName = formData.get('last_name')?.trim()
    if (!lastName) {
      errors.last_name = 'Last name is required'
    } else if (lastName.length < 2) {
      errors.last_name = 'Last name must be at least 2 characters'
    }

    const email = formData.get('email')?.trim()
    if (!email) {
      errors.email = 'Email is required'
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+[.][^\s@]+$/
      if (!emailRegex.test(email)) {
        errors.email = 'Please enter a valid email address'
      }
    }

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

    const phone = formData.get('phone')?.trim()
    if (phone) {
      const phoneError = phoneValidationMessage(phone)
      if (phoneError) errors.phone = phoneError
    }

    const reportsTo = formData.get('reports_to')?.trim()
    if (reportsTo && !/^[0-9a-fA-F]{24}$/.test(reportsTo)) {
      errors.reports_to = 'Please select a valid reporting manager'
    }

    return errors
  }

  const handleAddUser = async (e) => {
    e.preventDefault()
    if (submitting) return

    const formData = new FormData(e.target)

    const errors = validateForm(formData)
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setFormErrors({})

    try {
      setSubmitting(true)

      const userData = {
        email: formData.get('email')?.trim(),
        password: formData.get('password'),
        first_name: formData.get('first_name')?.trim(),
        last_name: formData.get('last_name')?.trim(),
        phone: formData.get('phone')?.trim() || '',
      }

      if (canReadDepartments) {
        const departmentId = formData.get('department_id')?.trim() || ''
        const selectedDepartment = departments.find((department) => department.id === departmentId)
        userData.department_id = departmentId
        userData.department = selectedDepartment?.name || ''
      } else {
        userData.department = formData.get('department')?.trim() || ''
      }

      // Member-level module permissions are sent on every creation flow.
      userData.modules = selectedModules.join(',')

      if (userType === 'sub_admin') {
        userData.role = 'sub_admin'
        await usersAPI.createUser(userData)
      } else if (userType === 'manager') {
        userData.role = 'manager'
        userData.reports_to = String(user.id)
        await usersAPI.createUser(userData)
      } else if (userType === 'lead') {
        userData.team_name = formData.get('team_name') || ''
        await usersAPI.createLead(userData)
      } else {
        if (isCompanyAdmin || isManager) {
          userData.reports_to = formData.get('reports_to') || ''
        }
        userData.designation = formData.get('designation') || ''
        await usersAPI.createEmployee(userData)
      }

      toast.success(`✅ ${userType === 'sub_admin' ? 'Sub Admin' : userType === 'manager' ? 'Manager' : userType === 'lead' ? 'Lead' : 'Employee'} created successfully!`)

      closeUserModal()
      await fetchUsers()
      fetchCompanyRoster()

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

  const handleUserTypeChange = (nextType) => {
    setUserType(nextType)
    // Changing the role loads that role's default permissions so the creator
    // starts from a sensible baseline and can customize afterwards.
    setSelectedModules(getRoleModuleDefaults(nextType))
    setModulesTouched(false)
  }

  const handleEdit = (userToEdit) => {
    // Company-scoped roles (Admin/Sub Admin/Manager/Lead) may edit any user in
    // the company - no creator or department restriction. Employees may only
    // edit themselves (handled by their profile view).
    const isSelf = String(userToEdit.id || userToEdit._id) === String(user.id || user._id)
    const isAdmin = hasCompanyAdminAccess(user?.role)
    const isManagerRole = normalizeRole(user?.role) === 'manager'
    const isLeadRoleLocal = isLeadRole(user?.role)
    if (!(isSelf || isAdmin || isManagerRole || isLeadRoleLocal)) {
      toast.error('You do not have permission to edit this user')
      return
    }
    setEditingUser(userToEdit)
    setSelectedDepartmentId(userToEdit.department_id || '')
    setShowDepartmentCreate(false)
    setNewDepartmentName('')
    setNewDepartmentManagerId('')
    setDepartmentError('')
    setSelectedDesignation(userToEdit.designation || '')
    setShowDesignationCreate(false)
    setNewDesignationName('')
    setDesignationError('')
    const normalizedRole = normalizeRole(userToEdit.role)
    setUserType(normalizedRole === 'sub_admin' ? 'sub_admin' : normalizedRole === 'manager' ? 'manager' : normalizedRole === 'lead' ? 'lead' : 'employee')
    // Preload the member's existing permissions. Legacy members (no explicit
    // module list) get their full effective access so a routine edit never
    // silently strips permissions they already had.
    setSelectedModules(getMemberEditDefaults(normalizedRole, userToEdit.modules))
    setModulesTouched(false)
    setShowAddModal(true)
  }

  const closeUserModal = () => {
    setShowAddModal(false)
    setEditingUser(null)
    setUserType('employee')
    setSelectedModules(getRoleModuleDefaults('employee'))
    setModulesTouched(false)
    setFormErrors({})
    setSelectedDepartmentId('')
    setShowDepartmentCreate(false)
    setNewDepartmentName('')
    setNewDepartmentManagerId('')
    setDepartmentError('')
    setSelectedDesignation('')
    setShowDesignationCreate(false)
    setNewDesignationName('')
    setDesignationError('')
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

  const handleCreateDesignation = () => {
    const name = newDesignationName.trim()
    if (!name) {
      setDesignationError('Designation is required')
      return
    }

    const exists = designationOptions.some((item) => item.toLowerCase() === name.toLowerCase())
    if (exists) {
      setDesignationError('Designation already exists')
      return
    }

    setCustomDesignations((current) => [...current, name])
    setSelectedDesignation(name)
    setNewDesignationName('')
    setDesignationError('')
    setShowDesignationCreate(false)
  }

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

    if (canReadDepartments) {
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

    if (normalizeRole(editingUser.role) === 'lead' && formData.get('team_name')) {
      updateData.team_name = formData.get('team_name')
    } else if (normalizeRole(editingUser.role) === 'employee') {
      if (formData.get('designation')) {
        updateData.designation = formData.get('designation')
      }
      const reportsTo = formData.get('reports_to')
      if (reportsTo !== null && reportsTo !== undefined) {
        updateData.reports_to = reportsTo
      }
    }

    // Member-level module permissions are editable through the same modal.
    // Only send them when the admin actually changed the selection, so a
    // routine edit (name/email/etc.) never silently rewrites permissions.
    if (modulesTouched) {
      updateData.modules = selectedModules.join(',')
    }

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
      fetchCompanyRoster()
      const form = document.querySelector('form')
      if (form) form.reset()
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to update user'
      toast.error(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

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
      fetchCompanyRoster()
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to delete user'
      toast.error(errorMessage)
    }
  }

  const validateBulkRow = (row, index) => {
    const errors = []
    const rawRole = String(row.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
    const role = rawRole === 'emp' ? 'employee' : rawRole
    const email = String(row.email || '').trim().toLowerCase()
    const firstName = String(row.first_name || row.firstName || '').trim()
    const lastName = String(row.last_name || row.lastName || '').trim()
    const password = String(row.password || '').trim()
    const phone = String(row.phone || '').trim()

    if (!role) errors.push('role required')
    if (role && !allowedBulkRoles.includes(role)) errors.push(`role must be ${allowedBulkRoles.join(', ')}`)
    if (!firstName) errors.push('first_name required')
    if (!lastName) errors.push('last_name required')
    if (!email || !/^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(email)) errors.push('valid email required')
    if (users.some((item) => String(item.email || '').toLowerCase() === email)) errors.push('email already exists')
    if (password && password.length < 8) errors.push('password must be 8+ chars')
    if (phone) {
      const phoneError = phoneValidationMessage(phone)
      if (phoneError) errors.push(phoneError)
    }
    if (row.lead_email && !users.some((item) => String(item.email || '').toLowerCase() === String(row.lead_email || '').trim().toLowerCase())) {
      errors.push('lead_email not found')
    }

    return {
      rowNumber: index + 2,
      valid: errors.length === 0,
      errors,
      data: {
        role,
        first_name: firstName,
        last_name: lastName,
        email,
        password: password || makeTempPassword(),
        phone,
        department: String(row.department || '').trim(),
        designation: String(row.designation || '').trim(),
        team_name: String(row.team_name || '').trim(),
        lead_email: String(row.lead_email || '').trim().toLowerCase(),
      },
    }
  }

  const handleBulkFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Upload CSV exported from Excel.')
      event.target.value = ''
      return
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
      complete: ({ data }) => {
        const emailCounts = data.reduce((counts, row) => {
          const email = String(row.email || '').trim().toLowerCase()
          if (email) counts[email] = (counts[email] || 0) + 1
          return counts
        }, {})
        const parsed = data.map((row, index) => {
          const result = validateBulkRow(row, index)
          if (result.data.email && emailCounts[result.data.email] > 1) {
            result.errors.push('duplicate email in file')
            result.valid = false
          }
          return result
        })
        setBulkRows(parsed)
        setBulkErrors(parsed.filter((row) => !row.valid))
      },
      error: (error) => toast.error(error.message || 'Could not read file'),
    })
  }

  const downloadBulkTemplate = () => {
    const sampleRole = allowedBulkRoles[0] || 'employee'
    const sample = {
      role: sampleRole,
      first_name: sampleRole === 'sub_admin' ? 'Isha' : sampleRole === 'manager' ? 'Amit' : sampleRole === 'lead' ? 'Neha' : 'Ravi',
      last_name: sampleRole === 'sub_admin' ? 'Mehta' : sampleRole === 'manager' ? 'Sharma' : sampleRole === 'lead' ? 'Verma' : 'Patel',
      email: `${sampleRole}@example.com`,
      password: 'SynTask@123',
      phone: '+919876543210',
      department: 'Engineering',
      designation: sampleRole === 'employee' ? 'Developer' : '',
      team_name: sampleRole === 'lead' ? 'Product Team' : '',
      lead_email: sampleRole === 'employee' && isCompanyAdmin ? 'lead@example.com' : '',
    }
    const rows = [
      BULK_HEADERS.join(','),
      BULK_HEADERS.map((header) => sample[header] || '').join(','),
    ].join('\n')
    const blob = new Blob([rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'syntask_user_import_template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleBulkImport = async () => {
    const validRows = bulkRows.filter((row) => row.valid)
    if (!validRows.length) {
      toast.error('No valid users to import')
      return
    }
    try {
      setBulkImporting(true)
      for (const row of validRows) {
        const department = departments.find((item) => String(item.name || '').toLowerCase() === row.data.department.toLowerCase())
        const lead = users.find((item) => String(item.email || '').toLowerCase() === row.data.lead_email)
        const userData = {
          email: row.data.email,
          password: row.data.password,
          first_name: row.data.first_name,
          last_name: row.data.last_name,
          phone: row.data.phone,
          department: row.data.department,
          department_id: department?.id || '',
        }

        // Every bulk-imported member gets that role's default module permissions.
        const roleModules = getRoleModuleDefaults(row.data.role)
        if (row.data.role === 'sub_admin') {
          await usersAPI.createUser({
            ...userData,
            role: 'sub_admin',
            modules: roleModules.join(','),
          })
        } else if (row.data.role === 'manager') {
          await usersAPI.createUser({
            ...userData,
            role: 'manager',
            modules: roleModules.join(','),
            reports_to: String(user.id),
          })
        } else if (row.data.role === 'lead') {
          await usersAPI.createLead({
            ...userData,
            team_name: row.data.team_name,
            modules: roleModules.join(','),
          })
        } else {
          await usersAPI.createEmployee({
            ...userData,
            designation: row.data.designation,
            modules: roleModules.join(','),
            reports_to: isCompanyAdmin ? lead?.id || '' : '',
          })
        }
      }
      toast.success(`${validRows.length} user${validRows.length === 1 ? '' : 's'} imported`)
      setShowBulkModal(false)
      setBulkRows([])
      setBulkErrors([])
      await fetchUsers()
      fetchCompanyRoster()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Bulk import failed')
    } finally {
      setBulkImporting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading users...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50/30 p-8 text-center dark:border-rose-900/30 dark:bg-rose-950/20">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/40">
            <X className="h-6 w-6 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="font-semibold text-rose-800 dark:text-rose-400">Failed to load users</p>
          <p className="mt-1 text-sm text-rose-600 dark:text-rose-500">{error}</p>
          <button onClick={() => { fetchUsers(); fetchCompanyRoster() }} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-4 text-white shadow-xl md:p-5">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/20 p-2 backdrop-blur-md shadow-lg border border-white/20">
              <UsersIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold md:text-2xl text-white tracking-tight">Team & User Directory</h1>
              <p className="mt-0.5 text-indigo-100 text-sm">{isLead ? 'Manage your team members, departments & permissions' : 'Manage company team members, roles, departments & access'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            {(isCompanyAdmin || isManager || isLead) && (
              <>
                <button
                  type="button"
                  onClick={() => setShowBulkModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/20 border border-white/10 shadow-md"
                >
                  <Upload className="h-4 w-4" />
                  <span>Bulk Add</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(true)
                    setSelectedDepartmentId('')
                    setShowDepartmentCreate(false)
                    setNewDepartmentName('')
                    setNewDepartmentManagerId('')
                    setDepartmentError('')
                    setSelectedDesignation('')
                    setShowDesignationCreate(false)
                    setNewDesignationName('')
                    setDesignationError('')
                    handleUserTypeChange(isLead ? 'employee' : isSubAdmin ? 'manager' : 'employee')
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/20 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/40 shadow-lg border border-white/20"
                >
                  <Plus className="h-4 w-4" />
                  <span>{isLead ? 'Add Employee' : 'Add User'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Total Users"
          value={totalUsers}
          icon={UsersIcon}
          color="indigo"
          subtitle="All team members"
        />
        <StatCard
          label="Active"
          value={activeUsers}
          icon={UserCheck}
          color="emerald"
          subtitle="Active users"
        />
        <StatCard
          label="Managers"
          value={managers}
          icon={UserCog}
          color="blue"
          subtitle="Company managers"
        />
        <StatCard
          label="Sub Admins"
          value={subAdmins}
          icon={Briefcase}
          color="amber"
          subtitle="Delegated admins"
        />
        <StatCard
          label="Leads"
          value={leads}
          icon={Shield}
          color="teal"
          subtitle="Team leads"
        />
      </div>

      {/* Users Table */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                <UsersIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Team Members</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{users.length} users</p>
              </div>
            </div>
            <button
              onClick={() => { fetchUsers(); fetchCompanyRoster() }}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">User</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Email</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Role</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Department</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                      <UsersIcon className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="font-medium">No users found</p>
                    <p className="text-sm">Click "Add User" to create your first team member.</p>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white font-semibold text-sm shadow-lg shadow-indigo-500/20">
                          {user.first_name?.[0]}{user.last_name?.[0]}
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {user.first_name} {user.last_name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-gray-400" />
                        {user.email}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        normalizeRole(user.role) === 'manager'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                          : normalizeRole(user.role) === 'lead'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {getRoleLabel(user.role) || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {user.department_name || departmentNameById[user.department_id] || user.department || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        user.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {user.status || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        {/* Show Edit button only when row is not current user OR current user is company admin */}
                        {(() => {
                          const rowId = String((user && (user.id || user._id)) || '')
                          const currentUserId = String((currentUser && (currentUser.id || currentUser._id)) || '')
                          if (rowId !== currentUserId || isCompanyAdmin) {
                            return (
                              <button
                                onClick={() => handleEdit(user)}
                                className="rounded-lg px-3 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
                              >
                                Edit
                              </button>
                            )
                          }
                          return null
                        })()}
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="rounded-lg px-3 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Import Modal */}
      <Modal
        isOpen={showBulkModal}
        onClose={() => {
          if (bulkImporting) return
          setShowBulkModal(false)
          setBulkRows([])
          setBulkErrors([])
        }}
        title="Bulk Add Users"
        description="Upload a CSV exported from Excel. Role permissions match your account."
        size="xl"
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Excel-compatible import
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Allowed roles: {allowedBulkRoles.join(', ')}. Required: role, first_name, last_name, email.
                </p>
              </div>
              <button
                type="button"
                onClick={downloadBulkTemplate}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Download className="h-4 w-4" />
                Template
              </button>
            </div>
          </div>

          <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-gray-300 bg-white p-5 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/20">
            <Upload className="mx-auto h-8 w-8 text-indigo-600 dark:text-indigo-400" />
            <span className="mt-3 block text-sm font-semibold text-gray-900 dark:text-white">
              Upload CSV file
            </span>
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
              Export your Excel sheet as CSV, then upload it here.
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={handleBulkFile}
              disabled={bulkImporting}
            />
          </label>

          {bulkRows.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex flex-col gap-1 border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {bulkRows.filter((row) => row.valid).length} valid / {bulkRows.length} rows
                </p>
                {bulkErrors.length > 0 && (
                  <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                    {bulkErrors.length} row{bulkErrors.length === 1 ? '' : 's'} need fixes
                  </p>
                )}
              </div>
              <div className="max-h-64 overflow-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Row</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Role</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Email</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {bulkRows.slice(0, 50).map((row) => (
                      <tr key={row.rowNumber}>
                        <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{row.rowNumber}</td>
                        <td className="px-4 py-2 text-gray-600 capitalize dark:text-gray-400">
                          {row.data.role || 'Missing'}
                        </td>
                        <td className="px-4 py-2 text-gray-900 dark:text-white">
                          {row.data.first_name} {row.data.last_name}
                        </td>
                        <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                          {row.data.email}
                        </td>
                        <td className={`px-4 py-2 text-xs font-semibold ${row.valid ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {row.valid ? 'Ready' : row.errors.join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {bulkRows.length > 50 && (
                <p className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Showing first 50 rows. All valid rows will be imported.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-4 dark:border-gray-700 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              onClick={() => {
                setShowBulkModal(false)
                setBulkRows([])
                setBulkErrors([])
              }}
              disabled={bulkImporting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
              onClick={handleBulkImport}
              disabled={bulkImporting || bulkRows.filter((row) => row.valid).length === 0}
            >
              {bulkImporting ? 'Importing...' : `Import ${bulkRows.filter((row) => row.valid).length || ''} Users`}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showDepartmentCreate}
        onClose={() => {
          if (departmentSubmitting) return
          setShowDepartmentCreate(false)
          setNewDepartmentName('')
          setNewDepartmentManagerId('')
          setDepartmentError('')
        }}
        title="Create Department"
        description="Add a department and select it for this user."
        size="md"
        zIndexClass="z-[70]"
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setShowDepartmentCreate(false)
                setNewDepartmentName('')
                setNewDepartmentManagerId('')
                setDepartmentError('')
              }}
              disabled={departmentSubmitting}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateDepartment}
              disabled={departmentSubmitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {departmentSubmitting ? 'Creating...' : 'Create Department'}
            </button>
          </div>
        )}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Department Name *</label>
            <input
              type="text"
              value={newDepartmentName}
              onChange={(event) => {
                setNewDepartmentName(event.target.value)
                if (departmentError) setDepartmentError('')
              }}
              className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white ${departmentError ? 'border-red-500' : ''}`}
              placeholder="Enter department name"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Department Manager</label>
            <select
              value={newDepartmentManagerId}
              onChange={(event) => setNewDepartmentManagerId(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="">No manager</option>
              {reportingManagerOptions.map((member) => (
                <option key={member.id || member._id} value={member.id || member._id}>
                  {member.first_name} {member.last_name} ({member.email})
                </option>
              ))}
            </select>
          </div>
          {departmentError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{departmentError}</p>
          )}
        </div>
      </Modal>

      {/* Add/Edit User Modal - Keep existing modal code */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-md"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddModal(false)
              setEditingUser(null)
            }
          }}
        >
          <div className="my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-surface-border/80 bg-white shadow-2xl dark:border-[var(--color-app-border)] dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            {/* Modal content - keeping existing logic but with updated styles */}
            <div className="flex items-start justify-between gap-4 border-b border-gray-200/80 bg-gradient-to-r from-indigo-50/50 to-white px-6 py-5 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg dark:bg-indigo-500">
                  <UserPlus className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {editingUser ? 'Edit User' : 'Add New User'}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {editingUser ? 'Update profile, department, and role details.' : 'Create teammate profile with role, department, and access details.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeUserModal}
                className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                aria-label="Close user form"
                disabled={submitting}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5 dark:bg-gray-900">
              {/* User Type Selection - follows role hierarchy */}
              {(isFullCompanyAdmin || isSubAdmin || isManager) && !editingUser && (
                <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                  <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                    User Type
                  </label>
                  {/* Phones: two columns (wraps for 3–4 roles); tablet/desktop keep the original row. */}
                <div className={`grid grid-cols-2 gap-2 ${isFullCompanyAdmin ? 'sm:grid-cols-4' : (isSubAdmin ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}`}>
                    {isFullCompanyAdmin && (
                      <button
                        type="button"
                        onClick={() => handleUserTypeChange('sub_admin')}
                        className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                          userType === 'sub_admin'
                            ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm dark:bg-indigo-500'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-indigo-950/30'
                        }`}
                      >
                        Sub Admin
                      </button>
                    )}
                    {(isFullCompanyAdmin || isSubAdmin) && (
                      <button
                        type="button"
                        onClick={() => handleUserTypeChange('manager')}
                        className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                          userType === 'manager'
                            ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm dark:bg-indigo-500'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-indigo-950/30'
                        }`}
                      >
                        Manager
                      </button>
                    )}
                    {(isFullCompanyAdmin || isSubAdmin || isManager) && (
                      <button
                        type="button"
                        onClick={() => handleUserTypeChange('lead')}
                        className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                          userType === 'lead'
                            ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm dark:bg-indigo-500'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-indigo-950/30'
                        }`}
                      >
                        Lead
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleUserTypeChange('employee')}
                      className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                        userType === 'employee'
                          ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm dark:bg-indigo-500'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-indigo-950/30'
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
                {/* Form fields - keeping existing logic with updated styling */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">First Name *</label>
                  <input
                    type="text"
                    name="first_name"
                    required
                    autoComplete="off"
                    defaultValue={editingUser?.first_name || ''}
                    className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white ${formErrors.first_name ? 'border-red-500' : ''}`}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Last Name *</label>
                  <input
                    type="text"
                    name="last_name"
                    required
                    autoComplete="off"
                    defaultValue={editingUser?.last_name || ''}
                    className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white ${formErrors.last_name ? 'border-red-500' : ''}`}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Email *</label>
                  <input
                    type="email"
                    name="email"
                    required
                    autoComplete="new-password"
                    defaultValue={editingUser?.email || ''}
                    className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white ${formErrors.email ? 'border-red-500' : ''}`}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                    Password {editingUser ? '(leave blank to keep current)' : '*'}
                  </label>
                  <PasswordInput
                    name="password"
                    required={!editingUser}
                    minLength={8}
                    autoComplete="new-password"
                    className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white ${formErrors.password ? 'border-red-500' : ''}`}
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
                    <p className="text-gray-500 text-xs mt-1 dark:text-gray-400">
                      Must contain at least 8 characters, one uppercase, one lowercase, and one number
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Phone</label>
                  <PhoneInput
                    name="phone"
                    defaultValue={editingUser?.phone || ''}
                    className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white ${formErrors.phone ? 'border-red-500' : ''}`}
                    placeholder="Enter Number"
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Department</label>
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
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">No department</option>
                    {departments.map((department) => (
                      <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                    {isCompanyAdmin ? <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="__create_department__">+ Create new department</option> : null}
                  </select>
                  {isFullCompanyAdmin && (
                    <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-indigo-200/70 bg-indigo-50/80 px-3 py-2.5 text-xs text-indigo-800 shadow-sm dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-200">
                      <span className="font-medium">Missing department?</span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowDepartmentCreate(true)
                          setDepartmentError('')
                        }}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-indigo-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Create here
                      </button>
                    </div>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <ModulePermissionSelector
                    value={selectedModules}
                    onChange={(next) => {
                      setSelectedModules(next)
                      setModulesTouched(true)
                    }}
                    role={editingUser ? normalizeRole(editingUser.role) : userType}
                  />
                </div>
                {userType === 'lead' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Team Name</label>
                    <input
                      type="text"
                      name="team_name"
                      defaultValue={editingUser?.team_name || ''}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      placeholder="Enter team name"
                    />
                  </div>
                )}
                {/* Employee-specific fields */}
                {userType === 'employee' && (
                  <>
                    {(isCompanyAdmin || isManager) && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Reporting Manager</label>
                        <select
                          name="reports_to"
                          defaultValue={editingUser?.reports_to || ''}
                          className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white ${formErrors.reports_to ? 'border-red-500' : ''}`}
                        >
                          <option value="">No reporting manager</option>
                          {reportingManagerOptions.map((member) => (
                            <option key={member.id || member._id} value={member.id || member._id}>
                              {member.first_name} {member.last_name} ({member.email})
                            </option>
                          ))}
                        </select>
                        {formErrors.reports_to && (
                          <p className="text-red-500 text-xs mt-1">{formErrors.reports_to}</p>
                        )}
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Designation</label>
                      <select
                        name="designation"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        value={selectedDesignation}
                        onChange={(event) => {
                          if (event.target.value === '__create_designation__') {
                            setShowDesignationCreate(true)
                            setDesignationError('')
                            return
                          }
                          setSelectedDesignation(event.target.value)
                          setShowDesignationCreate(false)
                          setDesignationError('')
                        }}
                      >
                        <option value="">Select designation</option>
                        {designationOptions.map((designation) => (
                          <option key={designation} value={designation}>
                            {designation}
                          </option>
                        ))}
                        <option value="__create_designation__">+ Add designation</option>
                      </select>
                      {showDesignationCreate && (
                        <div className="mt-2 rounded-xl border border-indigo-200/70 bg-indigo-50/80 p-3 dark:border-indigo-500/25 dark:bg-indigo-500/10">
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                              type="text"
                              value={newDesignationName}
                              onChange={(event) => {
                                setNewDesignationName(event.target.value)
                                if (designationError) setDesignationError('')
                              }}
                              className={`flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white ${designationError ? 'border-red-500' : ''}`}
                              placeholder="Enter designation"
                            />
                            <button
                              type="button"
                              onClick={handleCreateDesignation}
                              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                            >
                              <Plus className="h-4 w-4" />
                              Add
                            </button>
                          </div>
                          {designationError && (
                            <p className="mt-1 text-xs text-red-500">{designationError}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className="flex gap-3 border-t border-gray-200 pt-4 sm:col-span-2 dark:border-gray-700">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {submitting
                      ? (editingUser ? 'Updating...' : 'Creating...')
                      : editingUser
                        ? 'Update User'
                        : `Create ${userType === 'sub_admin' ? 'Sub Admin' : userType === 'manager' ? 'Manager' : userType === 'lead' ? 'Lead' : 'Employee'}`}

                  </button>
                  <button
                    type="button"
                    onClick={closeUserModal}
                    disabled={submitting}
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Users
