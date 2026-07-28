import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Plus, Edit, Trash2, X, Mail, Phone, Calendar, FileText, Upload, Download, Search, Eye, FolderKanban, ExternalLink } from 'lucide-react'
import { clientsAPI } from '../api/clients'
import { useConfirmation } from '../hooks/useConfirmation'
import { Button, CreatableSelectField, EmptyState, FormField, LoadingSpinner, Modal, PhoneInput, SkeletonTable, inputClassName } from '../components/ui'
import { QuickCreateEmployeeModal, QuickCreateProjectModal } from '../components/relatedRecords/QuickCreateModals'
import { projectsApi } from '../api/projects'
import { usersAPI } from '../api/users'
import { useAuthStore } from '../store/authStore'
import { hasCompanyAdminAccess, isLeadRole } from '../utils/roles'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { timeService } from '@/services/timeService'

const Clients = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const { confirm, showUndoNotification } = useConfirmation()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  const [leads, setLeads] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    contact: '',
    alternate_contact: '',
    address: '',
    city: '',
    state: '',
    country: '',
    zip_code: '',
    company_name: '',
    industry: '',
    assigned_to: '',
    notes: '',
    tags: '',
    client_type: '',
    budget: '',
    start_date: '',
    delivery_date: '',
  })
  const [formErrors, setFormErrors] = useState({})
  const [editingClient, setEditingClient] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false)
  const [showQuickEmployeeModal, setShowQuickEmployeeModal] = useState(false)
  const [showQuickProjectModal, setShowQuickProjectModal] = useState(false)
  const [assignableUsers, setAssignableUsers] = useState([])
  const [projectForm, setProjectForm] = useState({
    project_id: '',
    name: '',
    key: '',
    description: '',
    type: 'software',
    assigned_to: '',
    budget: '',
    start_date: '',
    delivery_date: '',
  })
  const [creatingProject, setCreatingProject] = useState(false)
  const [showAddProjectModal, setShowAddProjectModal] = useState(false)
  const [availableProjects, setAvailableProjects] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [projectSearch, setProjectSearch] = useState('')
  const [assigningProject, setAssigningProject] = useState(false)
  const [showDocumentModal, setShowDocumentModal] = useState(false)
  const [documentFile, setDocumentFile] = useState(null)
  const [documentName, setDocumentName] = useState('')
  const [updatingStatusId, setUpdatingStatusId] = useState(null)

  const isCompanyAdmin = hasCompanyAdminAccess(user?.role)
  const isLead = isLeadRole(user?.role)

  const loadClients = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const params = {}
      if (statusFilter) params.status_filter = statusFilter
      const data = await clientsAPI.listClients(params)
      setClients(data.clients || [])
    } catch (error) {
      console.error('Error loading clients:', error)
      const message = error.response?.status === 403
        ? 'You do not have permission to view clients. Please contact your administrator.'
        : error.response?.status === 401
          ? 'Please login to view clients'
          : 'Failed to load clients'
      setLoadError(message)
      if (error.response?.status === 403) {
        toast.error(message)
      } else if (error.response?.status === 401) {
        toast.error(message)
      } else {
        toast.error(message)
      }
      setClients([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  const loadLeads = useCallback(async () => {
    try {
      const data = await usersAPI.listUsers(null, 'lead')
      setLeads(data.users || [])
    } catch (error) {
      console.error('Error loading leads:', error)
    }
  }, [])

  const loadAssignableUsers = useCallback(async () => {
    try {
      const data = await usersAPI.getAssignableUsersWithJuniors()
      const users = data.users || []
      setAssignableUsers(users.filter((u) => String(u.id || u._id) !== String(user.id || user._id)))
    } catch (error) {
      console.error('Error loading assignable users:', error)
      setAssignableUsers([])
    }
  }, [user])

  const { isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated) return
    loadClients()
    loadLeads()
    loadAssignableUsers()
  }, [isAuthenticated, loadClients, loadLeads])

  const handleCreateClient = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!validateClientForm()) return

    try {
      setSubmitting(true)
      const formDataObj = new FormData()
      Object.keys(formData).forEach(key => {
        if (formData[key]) {
          formDataObj.append(key, formData[key])
        }
      })
      // Handle client_type field name mapping (if needed)
      if (formData.client_type) {
        formDataObj.set('client_type', formData.client_type)
      }

      await clientsAPI.createClient(formDataObj)
      toast.success('Client created successfully')
      setShowCreateModal(false)
      resetForm()
      loadClients()
    } catch (error) {
      console.error('Error creating client:', error)
      const errorMsg = error.response?.data?.detail || 'Failed to create client'
      toast.error(typeof errorMsg === 'string' ? errorMsg : 'Failed to create client')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateClient = async (e) => {
    e.preventDefault()
    if (submitting || !editingClient) return
    if (!validateClientForm()) return

    try {
      setSubmitting(true)
      const formDataObj = new FormData()
      Object.keys(formData).forEach(key => {
        formDataObj.append(key, formData[key] || '')
      })
      // Handle client_type field name mapping (if needed)
      if (formData.client_type) {
        formDataObj.set('client_type', formData.client_type)
      }

      await clientsAPI.updateClient(editingClient.id, formDataObj)
      toast.success('Client updated successfully')
      setShowCreateModal(false)
      setEditingClient(null)
      resetForm()
      loadClients()
    } catch (error) {
      console.error('Error updating client:', error)
      toast.error('Failed to update client')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteClient = async (clientId) => {
    const confirmed = await confirm({
      title: 'Delete Client',
      message: 'Are you sure you want to delete this client?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDangerous: true,
    })
    if (!confirmed) return

    try {
      await clientsAPI.deleteClient(clientId)
      toast.success('Client deleted successfully')
      showUndoNotification({
        message: 'Client deleted',
        onUndo: async () => {
          await loadClients()
        },
        duration: 3000,
      })
      loadClients()
    } catch (error) {
      console.error('Error deleting client:', error)
      toast.error('Failed to delete client')
    }
  }

  const handleViewClient = async (client) => {
    try {
      const clientData = await clientsAPI.getClient(client.id)
      setSelectedClient(clientData)
      setShowDetailModal(true)
    } catch (error) {
      console.error('Error loading client details:', error)
      toast.error('Failed to load client details')
    }
  }

  const openClientWorkspace = (clientId) => {
    navigate(`/clients/${clientId}/workspace`)
  }

  const handleEditClient = (client) => {
    setFormErrors({})
    setEditingClient(client)
    setFormData({
      name: client.name || '',
      email: client.email || '',
      contact: client.contact || '',
      alternate_contact: client.alternate_contact || '',
      address: client.address || '',
      city: client.city || '',
      state: client.state || '',
      country: client.country || '',
      zip_code: client.zip_code || '',
      company_name: client.company_name || '',
      industry: client.industry || '',
      assigned_to: client.assigned_to || '',
      notes: client.notes || '',
      tags: Array.isArray(client.tags) ? client.tags.join(', ') : '',
      client_type: client.client_type || '',
      budget: client.budget || '',
      start_date: client.start_date ? client.start_date.substring(0, 10) : '',
      delivery_date: client.delivery_date ? client.delivery_date.substring(0, 10) : '',
    })
    setShowCreateModal(true)
  }

  const handleStatusChange = async (clientId, newStatus) => {
    if (updatingStatusId) return
    try {
      setUpdatingStatusId(clientId)
      await clientsAPI.updateClientStatus(clientId, newStatus)
      toast.success(`Client status updated to ${newStatus}`)
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, status: newStatus } : c))
      )
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update status')
    } finally {
      setUpdatingStatusId(null)
    }
  }

  const handleCreateProject = async (e) => {
    e.preventDefault()
    if (!selectedClient || creatingProject) return

    try {
      setCreatingProject(true)
      
      // Create project first
      const projectData = {
        project_id: projectForm.project_id,
        name: projectForm.name,
        key: projectForm.key,
        description: projectForm.description || '',
        type: projectForm.type || 'software',
        assigned_to: projectForm.assigned_to || '',
        client_id: selectedClient.id,
      }
      
      // Convert dates to ISO format
      if (projectForm.start_date) {
        projectData.start_date = timeService.toUtcISOString(projectForm.start_date)
      }
      if (projectForm.delivery_date) {
        projectData.delivery_date = timeService.toUtcISOString(projectForm.delivery_date)
      }

      const projectResponse = await projectsApi.createProject(projectData)
      const projectId = projectResponse.data.project_id || projectResponse.data.id
      
      if (!projectId) {
        throw new Error('Failed to get project ID from response')
      }

      // Now link project to client with budget and dates
      await clientsAPI.addProjectToClient(
        selectedClient.id,
        projectId,
        projectForm.budget ? parseFloat(projectForm.budget) : null,
        projectForm.start_date ? timeService.toUtcISOString(projectForm.start_date) : null,
        projectForm.delivery_date ? timeService.toUtcISOString(projectForm.delivery_date) : null
      )

      toast.success('Project created and linked to client successfully')
      setShowCreateProjectModal(false)
      setProjectForm({
        project_id: '',
        name: '',
        key: '',
        description: '',
        type: 'software',
        assigned_to: '',
        budget: '',
        start_date: '',
        delivery_date: '',
      })
      await loadClients()
      await handleViewClient(selectedClient)
    } catch (error) {
      console.error('Error creating project:', error)
      const errorMsg = error.response?.data?.detail || 'Failed to create project'
      toast.error(typeof errorMsg === 'string' ? errorMsg : 'Failed to create project')
    } finally {
      setCreatingProject(false)
    }
  }

  const closeAddProjectModal = () => {
    if (assigningProject) return
    setShowAddProjectModal(false)
    setSelectedProjectId('')
    setProjectSearch('')
    setAvailableProjects([])
  }

  const loadAvailableProjects = useCallback(async () => {
    if (!selectedClient) return

    try {
      setLoadingProjects(true)
      const response = await projectsApi.getProjects({ limit: 100 })
      const projects = response.data?.projects || response.projects || []
      const linkedProjectIds = new Set([
        ...(selectedClient.project_ids || []),
        ...(selectedClient.projects || []).map((project) => project.id),
      ].map(String))

      setAvailableProjects(
        projects.filter((project) => project?.id && !linkedProjectIds.has(String(project.id)))
      )
    } catch (error) {
      console.error('Error loading available projects:', error)
      setAvailableProjects([])
      toast.error('Failed to load available projects')
    } finally {
      setLoadingProjects(false)
    }
  }, [selectedClient])

  useEffect(() => {
    if (showAddProjectModal) {
      loadAvailableProjects()
    }
  }, [loadAvailableProjects, showAddProjectModal])

  const handleAddExistingProject = async (event) => {
    event.preventDefault()
    if (!selectedClient || !selectedProjectId || assigningProject) return

    const alreadyLinked = (selectedClient.project_ids || []).some(
      (projectId) => String(projectId) === String(selectedProjectId)
    )
    if (alreadyLinked) {
      toast.error('This project is already assigned to the client')
      return
    }

    try {
      setAssigningProject(true)
      await clientsAPI.addProjectToClient(selectedClient.id, selectedProjectId)
      const refreshedClient = await clientsAPI.getClient(selectedClient.id)
      setSelectedClient(refreshedClient)
      await loadClients()
      toast.success('Project added to client successfully')
      setShowAddProjectModal(false)
      setSelectedProjectId('')
      setProjectSearch('')
      setAvailableProjects([])
    } catch (error) {
      console.error('Error adding project to client:', error)
      const detail = error.response?.data?.detail
      const errorMessage = typeof detail === 'string'
        ? detail
        : detail?.msg || 'Failed to add project to client'
      toast.error(errorMessage)
    } finally {
      setAssigningProject(false)
    }
  }

  const filteredAvailableProjects = availableProjects.filter((project) => {
    const query = projectSearch.trim().toLowerCase()
    if (!query) return true
    return [project.name, project.key, project.project_id]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query))
  })

  // Load assignable users when create project modal opens
  useEffect(() => {
    if (showCreateProjectModal) {
      loadAssignableUsers()
    }
  }, [showCreateProjectModal])

  const handleUploadDocument = async () => {
    if (!selectedClient || !documentFile) return

    try {
      await clientsAPI.uploadDocument(selectedClient.id, documentFile, documentName)
      toast.success('Document uploaded successfully')
      setShowDocumentModal(false)
      setDocumentFile(null)
      setDocumentName('')
      await loadClients()
      await handleViewClient(selectedClient)
    } catch (error) {
      console.error('Error uploading document:', error)
      toast.error('Failed to upload document')
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      contact: '',
      alternate_contact: '',
      address: '',
      city: '',
      state: '',
      country: '',
      zip_code: '',
      company_name: '',
      industry: '',
      assigned_to: '',
      notes: '',
      tags: '',
      client_type: '',
      budget: '',
      start_date: '',
      delivery_date: '',
    })
    setEditingClient(null)
    setFormErrors({})
  }

  const updateClientField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }))
    setFormErrors((current) => ({ ...current, [field]: '' }))
  }

  const validateClientForm = () => {
    const nextErrors = {}
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!formData.name.trim()) nextErrors.name = 'Client name is required.'
    if (formData.email.trim() && !emailPattern.test(formData.email.trim())) {
      nextErrors.email = 'Enter a valid email address.'
    }

    setFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const filteredClients = clients.filter(client => {
    const matchesSearch = !searchQuery || 
      client.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.company_name?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = !statusFilter || client.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getTotalBudget = (client) => {
    if (client.projects && client.projects.length > 0) {
      return client.projects.reduce((sum, proj) => sum + (proj.budget || 0), 0)
    }
    return 0
  }

  const getEarliestStartDate = (client) => {
    if (client.projects && client.projects.length > 0) {
      const dates = client.projects
        .map(proj => proj.start_date)
        .filter(date => date != null && date !== undefined)
        .map(date => {
          try {
            const d = timeService.instant(date)
            return isNaN(d.getTime()) ? null : d
          } catch (e) {
            return null
          }
        })
        .filter(date => date !== null)
      
      if (dates.length > 0) {
        return timeService.instant(Math.min(...dates.map(d => d.getTime())))
      }
    }
    return null
  }

  const getLatestDeliveryDate = (client) => {
    if (client.projects && client.projects.length > 0) {
      const dates = client.projects
        .map(proj => proj.delivery_date)
        .filter(date => date != null && date !== undefined)
        .map(date => {
          try {
            const d = timeService.instant(date)
            return isNaN(d.getTime()) ? null : d
          } catch (e) {
            return null
          }
        })
        .filter(date => date !== null)
      
      if (dates.length > 0) {
        return timeService.instant(Math.max(...dates.map(d => d.getTime())))
      }
    }
    return null
  }

  if (loading) {
    return (
      <div className="p-4">
        <SkeletonTable rows={8} cols={5} />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Clients</h1>
          <p className="text-gray-600 text-xs mt-0.5">Manage your clients and their projects</p>
        </div>
        {(isCompanyAdmin || isLead) && (
          <button
            onClick={() => {
              resetForm()
              setShowCreateModal(true)
            }}
            className="btn btn-primary flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add Client</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input"
        >
          <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All Status</option>
          <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="active">Active</option>
          <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="inactive">Inactive</option>
          <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="archived">Archived</option>
        </select>
      </div>

      {/* Clients Table */}
      {loadError ? (
        <EmptyState
          icon={Briefcase}
          title="Clients unavailable"
          description={loadError}
          action={(
            <button type="button" onClick={loadClients} className="btn btn-primary">
              Retry
            </button>
          )}
        />
      ) : filteredClients.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No clients found"
          description="Create a client to link projects, budgets, and documents."
          action={(isCompanyAdmin || isLead) ? (
            <button
              type="button"
              onClick={() => {
                resetForm()
                setShowCreateModal(true)
              }}
              className="btn btn-primary"
            >
              Add Your First Client
            </button>
          ) : null}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-3 pr-4 font-medium">Client</th>
                <th className="py-3 pr-4 font-medium">Contact</th>
                <th className="py-3 pr-4 font-medium">Email</th>
                <th className="py-3 pr-4 font-medium">Type</th>
                <th className="py-3 pr-4 font-medium">Projects</th>
                <th className="py-3 pr-4 font-medium">Budget</th>
                <th className="py-3 pr-4 font-medium">Start Date</th>
                <th className="py-3 pr-4 font-medium">Delivery Date</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredClients.map((client) => (
                <tr
                  key={client.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleViewClient(client)}
                >
                  <td className="py-3 pr-4">
                    <div className="text-sm font-semibold text-gray-900">{client.name}</div>
                    {client.company_name && (
                      <div className="text-xs text-gray-500">{client.company_name}</div>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-700">
                    {client.contact || '-'}
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-700">
                    {client.email || '-'}
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-700">
                    {client.client_type === 'monthly' ? (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Monthly</span>
                    ) : client.client_type === 'one_time' ? (
                      <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">One Time</span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-700">
                    {client.total_projects ?? client.project_ids?.length ?? 0}
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-700">
                    {client.budget > 0 ? `₹${Number(client.budget).toLocaleString()}` : getTotalBudget(client) > 0 ? `₹${getTotalBudget(client).toLocaleString()}` : '-'}
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-700">
                    {client.start_date ? format(timeService.instant(client.start_date), 'MMM d, yyyy') : (() => {
                      const startDate = getEarliestStartDate(client)
                      return startDate ? format(startDate, 'MMM d, yyyy') : '-'
                    })()}
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-700">
                    {client.delivery_date ? format(timeService.instant(client.delivery_date), 'MMM d, yyyy') : (() => {
                      const deliveryDate = getLatestDeliveryDate(client)
                      return deliveryDate ? format(deliveryDate, 'MMM d, yyyy') : '-'
                    })()}
                  </td>
                  <td className="py-3 pr-4" onClick={(e) => e.stopPropagation()}>
                    {(isCompanyAdmin || isLead) ? (
                      <select
                        value={client.status || 'active'}
                        onChange={(e) => handleStatusChange(client.id, e.target.value)}
                        disabled={updatingStatusId === client.id}
                        className={`text-xs rounded-full px-2 py-1 border-0 font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-60 ${
                          client.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : client.status === 'inactive'
                            ? 'bg-gray-100 text-gray-600'
                            : client.status === 'on_hold'
                            ? 'bg-amber-100 text-amber-700'
                            : client.status === 'archived'
                            ? 'bg-red-100 text-red-600'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="on_hold">On Hold</option>
                        <option value="archived">Archived</option>
                      </select>
                    ) : (
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          client.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : client.status === 'inactive'
                            ? 'bg-gray-100 text-gray-600'
                            : client.status === 'on_hold'
                            ? 'bg-amber-100 text-amber-700'
                            : client.status === 'archived'
                            ? 'bg-red-100 text-red-600'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {client.status || 'active'}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleViewClient(client)
                        }}
                        className="p-1 text-gray-600 hover:text-primary-600"
                        title="View"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openClientWorkspace(client.id)
                        }}
                        className="p-1 text-gray-600 hover:text-primary-600"
                        title="Open workspace"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                      {(isCompanyAdmin || isLead) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEditClient(client)
                          }}
                          className="p-1 text-gray-600 hover:text-primary-600"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                      )}
                      {isCompanyAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteClient(client.id)
                          }}
                          className="p-1 text-gray-600 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">
                  {editingClient ? 'Edit Client' : 'Add New Client'}
                </h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false)
                    resetForm()
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={editingClient ? handleUpdateClient : handleCreateClient} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-gray-200">Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => updateClientField('name', e.target.value)}
                      className="input"
                      required
                      aria-invalid={Boolean(formErrors.name)}
                    />
                    {formErrors.name ? <p className="mt-1 text-xs text-red-600" role="alert">{formErrors.name}</p> : null}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-gray-200">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateClientField('email', e.target.value)}
                      className="input"
                      aria-invalid={Boolean(formErrors.email)}
                    />
                    {formErrors.email ? <p className="mt-1 text-xs text-red-600" role="alert">{formErrors.email}</p> : null}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Contact</label>
                    <PhoneInput
                      value={formData.contact}
                      onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Alternate Contact</label>
                    <PhoneInput
                      value={formData.alternate_contact}
                      onChange={(e) => setFormData({ ...formData, alternate_contact: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Company Name</label>
                    <input
                      type="text"
                      value={formData.company_name}
                      onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Industry</label>
                    <input
                      type="text"
                      value={formData.industry}
                      onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Assigned To</label>
                    <CreatableSelectField
                      value={formData.assigned_to}
                      onChange={(value) => setFormData({ ...formData, assigned_to: value })}
                      className="input"
                      createLabel="Create user"
                      onCreate={() => setShowQuickEmployeeModal(true)}
                      canCreate={isCompanyAdmin || isLead}
                    >
                      <option value="">Select Lead/Admin</option>
                      {leads.map(lead => (
                        <option key={lead.id} value={lead.id}>
                          {lead.first_name} {lead.last_name}
                        </option>
                      ))}
                    </CreatableSelectField>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">City</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">State</label>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Country</label>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">ZIP Code</label>
                    <input
                      type="text"
                      value={formData.zip_code}
                      onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>
                {/* Client Type & Financial Info */}
                <div className="md:col-span-2">
                  <h3 className="text-xs font-semibold text-gray-700 mb-2 border-b pb-1 dark:text-gray-300">Financial & Scheduling</h3>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-gray-200">Client Type</label>
                  <select
                    value={formData.client_type}
                    onChange={(e) => setFormData({ ...formData, client_type: e.target.value })}
                    className="input"
                  >
                    <option value="">Select type...</option>
                    <option value="monthly">Monthly Client</option>
                    <option value="one_time">One Time Client</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-gray-200">Budget (₹)</label>
                  <input
                    type="number"
                    value={formData.budget}
                    onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                    className="input"
                    step="0.01"
                    placeholder="Total client budget"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-gray-200">Start Date</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-gray-200">Delivery Date</label>
                  <input
                    type="date"
                    value={formData.delivery_date}
                    onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                    className="input"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tags (comma separated)</label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    className="input"
                    placeholder="e.g., important, vip, recurring"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="input"
                    rows="3"
                  />
                </div>

                <div className="flex items-center justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false)
                      resetForm()
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn btn-primary"
                  >
                    {submitting ? 'Saving...' : editingClient ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Client Detail Modal */}
      {showDetailModal && selectedClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selectedClient.name}</h2>
                  {selectedClient.company_name && (
                    <p className="text-xs text-gray-600">{selectedClient.company_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openClientWorkspace(selectedClient.id)}
                    className="btn btn-sm btn-secondary inline-flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Workspace
                  </button>
                  <button
                    onClick={() => {
                      setShowDetailModal(false)
                      setSelectedClient(null)
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Client Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <h3 className="text-xs font-semibold text-gray-700 mb-2">Contact Information</h3>
                  <div className="space-y-2 text-xs">
                    {selectedClient.email && (
                      <div className="flex items-center text-gray-600">
                        <Mail className="h-3 w-3 mr-2" />
                        <span>{selectedClient.email}</span>
                      </div>
                    )}
                    {selectedClient.contact && (
                      <div className="flex items-center text-gray-600">
                        <Phone className="h-3 w-3 mr-2" />
                        <span>{selectedClient.contact}</span>
                      </div>
                    )}
                    {selectedClient.address && (
                      <div className="text-gray-600">
                        <span>{selectedClient.address}</span>
                        {(selectedClient.city || selectedClient.state) && (
                          <span>, {selectedClient.city} {selectedClient.state}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-gray-700 mb-2">Details</h3>
                  <div className="space-y-2 text-xs text-gray-600">
                    {selectedClient.industry && <div>Industry: {selectedClient.industry}</div>}
                    {selectedClient.assigned_to_name && (
                      <div>Assigned To: {selectedClient.assigned_to_name}</div>
                    )}
                    <div>Status: <span className="capitalize">{selectedClient.status}</span></div>
                    {selectedClient.client_type && (
                      <div>Type: <span className="capitalize font-medium">{selectedClient.client_type === 'monthly' ? 'Monthly' : 'One Time'}</span></div>
                    )}
                    {selectedClient.budget > 0 && (
                      <div>Budget: <span className="font-medium">₹{Number(selectedClient.budget).toLocaleString()}</span></div>
                    )}
                    {selectedClient.start_date && (
                      <div>Start Date: {format(timeService.instant(selectedClient.start_date), 'MMM d, yyyy')}</div>
                    )}
                    {selectedClient.delivery_date && (
                      <div>Delivery Date: {format(timeService.instant(selectedClient.delivery_date), 'MMM d, yyyy')}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Projects Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-gray-700">Projects</h3>
                  {(isCompanyAdmin || isLead) && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProjectId('')
                          setProjectSearch('')
                          setShowAddProjectModal(true)
                        }}
                        className="btn btn-sm btn-secondary flex items-center space-x-1"
                      >
                        <FolderKanban className="h-3 w-3" />
                        <span>Add Project</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setProjectForm({
                            project_id: '',
                            name: '',
                            key: '',
                            description: '',
                            type: 'software',
                            assigned_to: '',
                            budget: '',
                            start_date: '',
                            delivery_date: '',
                          })
                          setShowCreateProjectModal(true)
                        }}
                        className="btn btn-sm btn-primary flex items-center space-x-1"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Create Project</span>
                      </button>
                    </div>
                  )}
                </div>
                {selectedClient.projects && selectedClient.projects.length > 0 ? (
                  <div className="space-y-2">
                    {selectedClient.projects.map((project) => (
                      <div key={project.id} className="card p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900">{project.name}</h4>
                            <p className="text-xs text-gray-600">{project.key}</p>
                          </div>
                          {project.budget > 0 && (
                            <div className="text-sm font-semibold text-primary-600">
                              ₹{project.budget.toLocaleString()}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center space-x-4 text-xs text-gray-600">
                          {project.start_date && (
                            <div className="flex items-center">
                              <Calendar className="h-3 w-3 mr-1" />
                              <span>Start: {format(timeService.instant(project.start_date), 'MMM d, yyyy')}</span>
                            </div>
                          )}
                          {project.delivery_date && (
                            <div className="flex items-center">
                              <Calendar className="h-3 w-3 mr-1" />
                              <span>Delivery: {format(timeService.instant(project.delivery_date), 'MMM d, yyyy')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">No projects linked yet</p>
                )}
              </div>

              {/* Documents Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-gray-700">Documents</h3>
                  {(isCompanyAdmin || isLead) && (
                    <button
                      onClick={() => setShowDocumentModal(true)}
                      className="btn btn-sm btn-primary flex items-center space-x-1"
                    >
                      <Upload className="h-3 w-3" />
                      <span>Upload Document</span>
                    </button>
                  )}
                </div>
                {selectedClient.documents && selectedClient.documents.length > 0 ? (
                  <div className="space-y-2">
                    {selectedClient.documents.map((doc, index) => (
                      <div key={index} className="flex items-center justify-between card p-3">
                        <div className="flex items-center space-x-3">
                          <FileText className="h-4 w-4 text-gray-400" />
                          <div>
                            <p className="text-xs font-medium text-gray-900">{doc.name}</p>
                            <p className="text-xs text-gray-500">
                              {doc.type} • {(doc.size / 1024).toFixed(2)} KB
                            </p>
                          </div>
                        </div>
                        <a
                          href={`${import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:8000'}${doc.url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-secondary"
                        >
                          <Download className="h-3 w-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">No documents uploaded yet</p>
                )}
              </div>

              {/* Notes */}
              {selectedClient.notes && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-700 mb-2">Notes</h3>
                  <p className="text-xs text-gray-600 whitespace-pre-wrap">{selectedClient.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={showAddProjectModal && Boolean(selectedClient)}
        onClose={closeAddProjectModal}
        title={`Add Project to ${selectedClient?.name || 'Client'}`}
        size="md"
      >
        <form onSubmit={handleAddExistingProject} className="space-y-5">
          {loadingProjects ? (
            <div className="flex min-h-40 items-center justify-center" role="status">
              <LoadingSpinner label="Loading projects" />
            </div>
          ) : availableProjects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects available"
              description="All accessible projects are already assigned to this client, or no projects have been created yet."
            />
          ) : (
            <>
              <FormField label="Search projects" htmlFor="client-project-search">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    id="client-project-search"
                    type="search"
                    value={projectSearch}
                    onChange={(event) => {
                      setProjectSearch(event.target.value)
                      setSelectedProjectId('')
                    }}
                    className={`${inputClassName} pl-10`}
                    placeholder="Search by project name, key, or ID"
                    disabled={assigningProject}
                  />
                </div>
              </FormField>

              <FormField label="Project" htmlFor="client-project-select" required>
                <CreatableSelectField
                  id="client-project-select"
                  value={selectedProjectId}
                  onChange={setSelectedProjectId}
                  className={inputClassName}
                  disabled={assigningProject}
                  required
                  createLabel="Create project"
                  onCreate={() => setShowQuickProjectModal(true)}
                  canCreate={isCompanyAdmin}
                >
                  <option value="">
                    {filteredAvailableProjects.length ? 'Select a project' : 'No matching projects'}
                  </option>
                  {filteredAvailableProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} ({project.key}){project.project_id ? ` - ${project.project_id}` : ''}
                    </option>
                  ))}
                </CreatableSelectField>
              </FormField>

              {filteredAvailableProjects.length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  No projects match your search.
                </p>
              ) : null}
            </>
          )}

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
            <Button type="button" variant="secondary" onClick={closeAddProjectModal} disabled={assigningProject}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={assigningProject}
              loadingText="Adding"
              disabled={loadingProjects || !selectedProjectId || availableProjects.length === 0}
            >
              Add Project
            </Button>
          </div>
        </form>
      </Modal>

      <QuickCreateEmployeeModal
        isOpen={showQuickEmployeeModal}
        onClose={() => setShowQuickEmployeeModal(false)}
        existing={[...leads, ...assignableUsers]}
        leads={leads}
        canCreateLead={false}
        onCreated={async (created) => {
          await Promise.all([loadLeads(), loadAssignableUsers()])
          setFormData((state) => ({ ...state, assigned_to: created.id }))
          setProjectForm((state) => ({ ...state, assigned_to: created.id }))
        }}
      />

      <QuickCreateProjectModal
        isOpen={showQuickProjectModal}
        onClose={() => setShowQuickProjectModal(false)}
        existing={availableProjects}
        assignedTo={projectForm.assigned_to}
        clientId={selectedClient?.id}
        onCreated={async (created) => {
          await loadAvailableProjects()
          setSelectedProjectId(created.id)
        }}
      />

      {/* Create Project Modal */}
      {showCreateProjectModal && selectedClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Create New Project for {selectedClient.name}</h2>
                <button
                  onClick={() => {
                    setShowCreateProjectModal(false)
                    setProjectForm({
                      project_id: '',
                      name: '',
                      key: '',
                      description: '',
                      type: 'software',
                      assigned_to: '',
                      budget: '',
                      start_date: '',
                      delivery_date: '',
                    })
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateProject} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Project ID *</label>
                    <input
                      type="text"
                      value={projectForm.project_id}
                      onChange={(e) => setProjectForm({ ...projectForm, project_id: e.target.value })}
                      className="input"
                      required
                      placeholder="e.g., PROJ-001"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Project Name *</label>
                    <input
                      type="text"
                      value={projectForm.name}
                      onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Project Key *</label>
                    <input
                      type="text"
                      value={projectForm.key}
                      onChange={(e) => setProjectForm({ ...projectForm, key: e.target.value.toUpperCase() })}
                      className="input"
                      required
                      placeholder="e.g., PROJ"
                      maxLength={10}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={projectForm.description}
                      onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                      className="input"
                      rows="3"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Project Type</label>
                    <select
                      value={projectForm.type}
                      onChange={(e) => setProjectForm({ ...projectForm, type: e.target.value })}
                      className="input"
                    >
                      <option value="software">Software</option>
                      <option value="business">Business</option>
                      <option value="marketing">Marketing</option>
                      <option value="operations">Operations</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Assign To (Lead/Employee)</label>
                    <select
                      value={projectForm.assigned_to}
                      onChange={(e) => setProjectForm({ ...projectForm, assigned_to: e.target.value })}
                      className="input"
                    >
                      <option value="">Not Assigned</option>
                      {assignableUsers.map(user => (
                        <option key={user.id} value={user.id}>
                          {user.first_name} {user.last_name} ({user.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Budget (₹)</label>
                    <input
                      type="number"
                      value={projectForm.budget}
                      onChange={(e) => setProjectForm({ ...projectForm, budget: e.target.value })}
                      className="input"
                      step="0.01"
                      placeholder="Enter project budget"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={projectForm.start_date}
                      onChange={(e) => setProjectForm({ ...projectForm, start_date: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Date</label>
                    <input
                      type="date"
                      value={projectForm.delivery_date}
                      onChange={(e) => setProjectForm({ ...projectForm, delivery_date: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateProjectModal(false)
                      setProjectForm({
                        project_id: '',
                        name: '',
                        key: '',
                        description: '',
                        type: 'software',
                        assigned_to: '',
                        budget: '',
                        start_date: '',
                        delivery_date: '',
                      })
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingProject}
                    className="btn btn-primary"
                  >
                    {creatingProject ? 'Creating...' : 'Create Project'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Upload Document Modal */}
      {showDocumentModal && selectedClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Upload Document</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Document Name</label>
                  <input
                    type="text"
                    value={documentName}
                    onChange={(e) => setDocumentName(e.target.value)}
                    className="input"
                    placeholder="e.g., FRD, Contract, Agreement"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">File *</label>
                  <input
                    type="file"
                    onChange={(e) => setDocumentFile(e.target.files[0])}
                    className="input"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png"
                    required
                  />
                </div>
              </div>
              <div className="flex items-center justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowDocumentModal(false)
                    setDocumentFile(null)
                    setDocumentName('')
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUploadDocument}
                  disabled={!documentFile}
                  className="btn btn-primary"
                >
                  Upload
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Clients
