import { useState, useEffect, useCallback, useMemo } from 'react'
import { Download, Plus, RefreshCw, Upload, UserPlus, X } from 'lucide-react'
import Papa from 'papaparse'
import { useConfirmation } from '../hooks/useConfirmation'
import { usersAPI } from '../api/users'
import { departmentsAPI } from '../api/departments'
import { useAuthStore } from '../store/authStore'
import { hasCompanyAdminAccess, isLeadRole, normalizeRole, getRoleLabel } from '../utils/roles'
import { EmptyState, Modal, PasswordInput, PhoneInput, phoneValidationMessage } from '../components/ui'
import toast from 'react-hot-toast'

const BULK_HEADERS = ['role', 'first_name', 'last_name', 'email', 'password', 'phone', 'department', 'designation', 'team_name', 'lead_email']
const makeTempPassword = () => `SynTask@${Math.random().toString(36).slice(2, 8)}1`
const DESIGNATION_OPTIONS = [
  'Software Developer',
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'Mobile App Developer',
  'UI/UX Designer',
  'Graphic Designer',
  'QA Engineer',
  'DevOps Engineer',
  'Project Coordinator',
  'Business Analyst',
  'Sales Executive',
  'Marketing Executive',
  'Customer Support Executive',
  'HR Executive',
  'HR Manager',
  'Recruiter',
  'Talent Acquisition Specialist',
  'Accountant',
  'Finance Executive',
  'Finance Manager',
  'Operations Executive',
  'Operations Manager',
  'Data Analyst',
  'Product Manager',
  'Project Manager',
  'Scrum Master',
  'Team Lead',
  'Technical Lead',
  'SEO Specialist',
  'Social Media Manager',
  'Digital Marketing Specialist',
  'Business Development Executive',
  'Customer Success Executive',
  'Support Engineer',
  'Office Administrator',
  'Content Writer',
  'Intern',
]

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
  const [customDesignations, setCustomDesignations] = useState([])
  const [selectedDesignation, setSelectedDesignation] = useState('')
  const [showDesignationCreate, setShowDesignationCreate] = useState(false)
  const [newDesignationName, setNewDesignationName] = useState('')
  const [designationError, setDesignationError] = useState('')
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkRows, setBulkRows] = useState([])
  const [bulkErrors, setBulkErrors] = useState([])
  const [bulkImporting, setBulkImporting] = useState(false)
  
  // Check if current user is a Lead
  const isLead = isLeadRole(user?.role)
  const isCompanyAdmin = hasCompanyAdminAccess(user?.role)
  const isManager = normalizeRole(user?.role) === 'manager'
  const isEmployee = normalizeRole(user?.role) === 'employee'
  const canReadDepartments = isCompanyAdmin || isManager || isLead
  const allowedBulkRoles = useMemo(() => {
    if (isCompanyAdmin) return ['manager', 'lead', 'employee']
    if (isManager) return ['lead', 'employee']
    if (isLead) return ['employee']
    return []
  }, [isCompanyAdmin, isLead, isManager])
  const managerOptions = useMemo(
    () => users.filter((item) => item.status === 'active'),
    [users],
  )
  const leadOptions = useMemo(
    () => users.filter((item) => normalizeRole(item.role) === 'lead' && item.status === 'active'),
    [users],
  )
  const designationOptions = useMemo(() => {
    const currentDesignation = editingUser?.designation?.trim()
    const combined = [...customDesignations, ...DESIGNATION_OPTIONS]
    if (currentDesignation && !combined.includes(currentDesignation)) {
      combined.unshift(currentDesignation)
    }
    return Array.from(new Set(combined)).sort((a, b) => a.localeCompare(b))
  }, [customDesignations, editingUser?.designation])
  const departmentNameById = useMemo(
    () => departments.reduce((lookup, department) => {
      lookup[department.id] = department.name
      return lookup
    }, {}),
    [departments],
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
    if (canReadDepartments) {
      fetchDepartments()
    }
  }, [fetchUsers, fetchDepartments, canReadDepartments])

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
      const phoneError = phoneValidationMessage(phone)
      if (phoneError) errors.phone = phoneError
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

      if (canReadDepartments) {
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
        // Admins and Managers choose the Lead; Leads are assigned by backend.
        if (isCompanyAdmin || isManager) {
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
    setSelectedDesignation(userToEdit.designation || '')
    setShowDesignationCreate(false)
    setNewDesignationName('')
    setDesignationError('')
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
      toast.error('Upload CSV exported from Excel. XLSX parser is not available in this app build.')
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
      first_name: sampleRole === 'manager' ? 'Amit' : sampleRole === 'lead' ? 'Neha' : 'Ravi',
      last_name: sampleRole === 'manager' ? 'Sharma' : sampleRole === 'lead' ? 'Verma' : 'Patel',
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

        if (row.data.role === 'manager') {
          await usersAPI.createUser({
            ...userData,
            role: 'manager',
            reports_to: String(user.id),
          })
        } else if (row.data.role === 'lead') {
          await usersAPI.createLead({
            ...userData,
            team_name: row.data.team_name,
          })
        } else {
          await usersAPI.createEmployee({
            ...userData,
            designation: row.data.designation,
            lead_id: isCompanyAdmin ? lead?.id || '' : '',
          })
        }
      }
      toast.success(`${validRows.length} user${validRows.length === 1 ? '' : 's'} imported`)
      setShowBulkModal(false)
      setBulkRows([])
      setBulkErrors([])
      await fetchUsers()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Bulk import failed')
    } finally {
      setBulkImporting(false)
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
        {(isCompanyAdmin || isManager || isLead) && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowBulkModal(true)} className="btn btn-secondary flex items-center">
              <Upload className="h-5 w-5 mr-2" />
              Bulk Add
            </button>
            <button
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
                // Keep manual creation aligned with role hierarchy.
                if (isLead) {
                  setUserType('employee')
                } else if (isManager) {
                  setUserType('lead')
                }
              }}
              className="btn btn-primary flex items-center"
            >
              <Plus className="h-5 w-5 mr-2" />
              {isLead ? 'Add Employee' : 'Add User'}
            </button>
          </div>
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
                      {user.department_name || departmentNameById[user.department_id] || user.department || 'N/A'}
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

      <Modal
        isOpen={showBulkModal}
        onClose={() => {
          if (bulkImporting) return
          setShowBulkModal(false)
          setBulkRows([])
          setBulkErrors([])
        }}
        title="Bulk add users"
        description="Upload a CSV exported from Excel. Role permissions match your account."
        size="xl"
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-primary-100 bg-primary-50/70 p-4 dark:border-primary-900/40 dark:bg-primary-950/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-[var(--color-app-text)]">
                  Excel-compatible import
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-[var(--color-app-text-muted)]">
                  Allowed roles: {allowedBulkRoles.join(', ')}. Required: role, first_name, last_name, email.
                </p>
              </div>
              <button
                type="button"
                onClick={downloadBulkTemplate}
                className="btn btn-secondary inline-flex items-center"
              >
                <Download className="h-4 w-4 mr-2" />
                Template
              </button>
            </div>
          </div>

          <label className="block cursor-pointer rounded-2xl border border-dashed border-gray-300 bg-white p-5 text-center transition hover:border-primary-400 hover:bg-primary-50/40 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] dark:hover:bg-[var(--color-app-surface-muted)]">
            <Upload className="mx-auto h-8 w-8 text-primary-600" />
            <span className="mt-3 block text-sm font-semibold text-gray-900 dark:text-[var(--color-app-text)]">
              Upload CSV file
            </span>
            <span className="mt-1 block text-xs text-gray-500 dark:text-[var(--color-app-text-muted)]">
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
            <div className="rounded-xl border border-gray-200 dark:border-[var(--color-app-border)]">
              <div className="flex flex-col gap-1 border-b border-gray-200 px-4 py-3 dark:border-[var(--color-app-border)] sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-gray-900 dark:text-[var(--color-app-text)]">
                  {bulkRows.filter((row) => row.valid).length} valid / {bulkRows.length} rows
                </p>
                {bulkErrors.length > 0 && (
                  <p className="text-xs font-medium text-red-600">
                    {bulkErrors.length} row{bulkErrors.length === 1 ? '' : 's'} need fixes
                  </p>
                )}
              </div>
              <div className="max-h-64 overflow-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-[var(--color-app-border)]">
                  <thead className="bg-gray-50 dark:bg-[var(--color-app-surface-muted)]">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Row</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Role</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Email</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-[var(--color-app-border)]">
                    {bulkRows.slice(0, 50).map((row) => (
                      <tr key={row.rowNumber}>
                        <td className="px-4 py-2 text-gray-500">{row.rowNumber}</td>
                        <td className="px-4 py-2 text-gray-600 capitalize dark:text-[var(--color-app-text-muted)]">
                          {row.data.role || 'Missing'}
                        </td>
                        <td className="px-4 py-2 text-gray-900 dark:text-[var(--color-app-text)]">
                          {row.data.first_name} {row.data.last_name}
                        </td>
                        <td className="px-4 py-2 text-gray-600 dark:text-[var(--color-app-text-muted)]">
                          {row.data.email}
                        </td>
                        <td className={`px-4 py-2 text-xs font-semibold ${row.valid ? 'text-emerald-600' : 'text-red-600'}`}>
                          {row.valid ? 'Ready' : row.errors.join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {bulkRows.length > 50 && (
                <p className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-[var(--color-app-border)]">
                  Showing first 50 rows. All valid rows will be imported.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-4 dark:border-[var(--color-app-border)] sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn btn-secondary"
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
              className="btn btn-primary"
              onClick={handleBulkImport}
              disabled={bulkImporting || bulkRows.filter((row) => row.valid).length === 0}
            >
              {bulkImporting ? 'Importing...' : `Import ${bulkRows.filter((row) => row.valid).length || ''} Users`}
            </button>
          </div>
        </div>
      </Modal>

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
            
            {/* User Type Selection - follows role hierarchy */}
            {(isCompanyAdmin || isManager) && !editingUser && (
              <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-muted)]">
                <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-[var(--color-app-text-secondary)]">
                  User Type
                </label>
                <div className={`grid gap-2 ${isCompanyAdmin ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {isCompanyAdmin && (
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
                  )}
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
                <PasswordInput
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
                <PhoneInput
                  name="phone"
                  defaultValue={editingUser?.phone || ''}
                  className={`input ${formErrors.phone ? 'border-red-500' : ''}`}
                  placeholder="+919876543210"
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
                  {isCompanyAdmin ? <option value="__create_department__">+ Create new department</option> : null}
                </select>
                {isCompanyAdmin ? (
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
                ) : departments.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-200">No departments found. Ask admin to create departments.</p>
                ) : null}
              </div>

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
                    <select
                      name="designation"
                      className="input"
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
                      <div className="mt-2 rounded-xl border border-primary-200/70 bg-primary-50/80 p-3 dark:border-primary-500/25 dark:bg-primary-500/10">
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            type="text"
                            value={newDesignationName}
                            onChange={(event) => {
                              setNewDesignationName(event.target.value)
                              if (designationError) setDesignationError('')
                            }}
                            className={`input min-h-10 flex-1 ${designationError ? 'border-red-500' : ''}`}
                            placeholder="Enter designation"
                          />
                          <button
                            type="button"
                            onClick={handleCreateDesignation}
                            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
                          >
                            <Plus className="h-4 w-4" />
                            Add
                          </button>
                        </div>
                        {designationError && (
                          <p className="mt-1 text-xs text-red-500" role="alert">{designationError}</p>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Admins and Managers choose the Lead; Leads are assigned automatically. */}
                  {(isCompanyAdmin || isManager) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-[var(--color-app-text-secondary)]">
                        Lead {isManager ? '*' : '(Optional)'}
                      </label>
                      <select
                        name="lead_id"
                        required={isManager}
                        autoComplete="off"
                        className={`input ${formErrors.lead_id ? 'border-red-500' : ''}`}
                        onChange={() => {
                          if (formErrors.lead_id) {
                            setFormErrors({ ...formErrors, lead_id: '' })
                          }
                        }}
                      >
                        <option value="">Select lead</option>
                        {leadOptions.map((lead) => (
                          <option key={lead.id} value={lead.id}>
                            {lead.first_name} {lead.last_name}
                          </option>
                        ))}
                      </select>
                      {formErrors.lead_id && (
                        <p className="text-red-500 text-xs mt-1">{formErrors.lead_id}</p>
                      )}
                      {isManager && leadOptions.length === 0 && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-200">Create a lead before adding employees.</p>
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
