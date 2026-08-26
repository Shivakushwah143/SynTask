import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Briefcase, Plus, Trash2, X, Mail, Phone, Calendar, FileText, Upload, Download, Search, Eye, FolderKanban, ExternalLink, Filter, Building2, MapPin, User, Users, DollarSign, Clock, CheckCircle2, Sparkles, ShieldCheck } from 'lucide-react'
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

const getTotalBudget = (client) => {
  if (!client) return 0
  if (client.total_budget != null) return Number(client.total_budget) || 0
  if (client.budget != null) return Number(client.budget) || 0
  if (Array.isArray(client.projects)) {
    return client.projects.reduce((sum, p) => sum + (Number(p.budget) || 0), 0)
  }
  return 0
}

// Draft persistence: keep partially-filled client form values when the modal
// closes (cross button, Escape, backdrop, or cancel) so the user does not have
// to re-enter them when reopening. Cleared only after a successful create.
const CLIENT_FORM_DRAFT_KEY = 'syntask_client_form_draft'

const EMPTY_CLIENT_FORM = {
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
}

const loadClientFormDraft = () => {
  try {
    const raw = sessionStorage.getItem(CLIENT_FORM_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { ...EMPTY_CLIENT_FORM, ...parsed }
      : null
  } catch {
    return null
  }
}

const saveClientFormDraft = (data) => {
  try {
    sessionStorage.setItem(CLIENT_FORM_DRAFT_KEY, JSON.stringify(data))
  } catch {
    // Ignore storage failures; the form still works without persistence.
  }
}

const clearClientFormDraft = () => {
  try {
    sessionStorage.removeItem(CLIENT_FORM_DRAFT_KEY)
  } catch {
    // Ignore storage failures.
  }
}

const CLIENT_PAGE_SIZE = 20

const CLIENT_STAGE_ROUTES = {
  new: 'new',
  onboarding: 'onboarding',
  active: 'active',
  'at-risk': 'at_risk',
  'on-hold': 'on_hold',
  'renewal-due': 'renewal_due',
  churned: 'churned',
  archived: 'archived',
}

const CLIENT_STAGE_PATHS = Object.entries(CLIENT_STAGE_ROUTES).reduce((acc, [path, status]) => {
  acc[status] = path
  return acc
}, {})

const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    purple: 'from-purple-500 to-pink-500',
  }

  return (
    <div className="group rounded-xl border border-gray-200/80 bg-white p-3 shadow-sm transition-all hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-md bg-gradient-to-r ${colors[color]} p-1.5 text-white shadow transition-transform group-hover:scale-110`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  )
}

const Clients = () => {
  const { user } = useAuthStore()
  const { stageKey } = useParams()
  const navigate = useNavigate()
  const { confirm, showUndoNotification } = useConfirmation()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [clientFormStep, setClientFormStep] = useState(1)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  const [leads, setLeads] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [columnFilters, setColumnFilters] = useState({
    type: '',
    projects: '',
    budget: '',
    start_date: '',
    delivery_date: '',
  })
  const [formData, setFormData] = useState({ ...EMPTY_CLIENT_FORM })
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
  const [stageSelectionClient, setStageSelectionClient] = useState(null)
  const [transitionBlocker, setTransitionBlocker] = useState(null)
  const [lifecycleRules, setLifecycleRules] = useState({})
  const [reasonRequest, setReasonRequest] = useState(null)
  const [transitionReason, setTransitionReason] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const statusMeta = {
    new: {
      label: 'New',
      chipClass: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
      optionClass: 'text-sky-700 dark:text-sky-300',
      dotClass: 'bg-sky-500',
    },
    onboarding: {
      label: 'Onboarding',
      chipClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300',
      optionClass: 'text-indigo-700 dark:text-indigo-300',
      dotClass: 'bg-indigo-500',
    },
    active: {
      label: 'Active',
      chipClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
      optionClass: 'text-emerald-700 dark:text-emerald-300',
      dotClass: 'bg-emerald-500',
    },
    at_risk: {
      label: 'At Risk',
      chipClass: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
      optionClass: 'text-orange-700 dark:text-orange-300',
      dotClass: 'bg-orange-500',
    },
    on_hold: {
      label: 'On Hold',
      chipClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
      optionClass: 'text-amber-700 dark:text-amber-300',
      dotClass: 'bg-amber-500',
    },
    renewal_due: {
      label: 'Renewal Due',
      chipClass: 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
      optionClass: 'text-violet-700 dark:text-violet-300',
      dotClass: 'bg-violet-500',
    },
    churned: {
      label: 'Churned',
      chipClass: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
      optionClass: 'text-slate-700 dark:text-slate-300',
      dotClass: 'bg-slate-500',
    },
    archived: {
      label: 'Archived',
      chipClass: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      optionClass: 'text-gray-700 dark:text-gray-300',
      dotClass: 'bg-gray-500',
    },
    inactive: {
      label: 'Inactive',
      chipClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
      optionClass: 'text-amber-700 dark:text-amber-300',
      dotClass: 'bg-amber-500',
    },
  }

  const getStatusMeta = (status) => statusMeta[status] || statusMeta.active
  const routeStatus = CLIENT_STAGE_ROUTES[stageKey] || ''
  const effectiveStatusFilter = routeStatus || statusFilter
  const pageTitle = routeStatus ? `${getStatusMeta(routeStatus).label} Clients` : 'Clients Directory'
  const pageDescription = routeStatus
    ? `Only ${getStatusMeta(routeStatus).label.toLowerCase()} client accounts are shown here.`
    : 'Manage enterprise client accounts, linked projects, contract budgets & files'

  const isCompanyAdmin = hasCompanyAdminAccess(user?.role)
  const isLead = isLeadRole(user?.role)

  const loadClients = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const params = { limit: 500 }
      if (effectiveStatusFilter) params.status_filter = effectiveStatusFilter
      if (searchQuery.trim()) params.search = searchQuery.trim()
      if (columnFilters.type) params.client_type = columnFilters.type
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
  }, [columnFilters.type, effectiveStatusFilter, searchQuery])

  const loadLeads = useCallback(async () => {
    try {
      const data = await usersAPI.listUsers(null, 'lead')
      setLeads(data.users || [])
    } catch (error) {
      console.error('Error loading leads:', error)
    }
  }, [])

  const loadLifecycleRules = useCallback(async () => {
    try {
      const data = await clientsAPI.getLifecycleRules()
      setLifecycleRules(Object.fromEntries((data.rules || []).map((rule) => [rule.status, rule])))
    } catch (error) {
      console.error('Error loading client lifecycle rules:', error)
      setLifecycleRules({})
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
    loadLifecycleRules()
  }, [isAuthenticated, loadClients, loadLeads, loadAssignableUsers, loadLifecycleRules])

  useEffect(() => {
    setCurrentPage(1)
  }, [effectiveStatusFilter, searchQuery, columnFilters.projects, columnFilters.budget, columnFilters.start_date, columnFilters.delivery_date])

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
      clearClientFormDraft()
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
    setClientFormStep(1)
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

  const handleStatusChange = async (clientId, newStatus, client = null, reason = '') => {
    const rule = lifecycleRules[client?.status || '']
    const destinationRequirement = rule?.destination_requirements?.[newStatus]
    if (destinationRequirement?.required_reason && !reason) {
      setTransitionReason('')
      setReasonRequest({ clientId, newStatus, client })
      return
    }
    if (updatingStatusId) return
    try {
      setUpdatingStatusId(clientId)
      await clientsAPI.updateClientStatus(clientId, newStatus, reason)
      toast.success(`Client status updated to ${getStatusMeta(newStatus).label}`)
      if (routeStatus && routeStatus !== newStatus) {
        setClients((prev) => prev.filter((c) => c.id !== clientId))
      } else {
        setClients((prev) =>
          prev.map((c) => (c.id === clientId ? { ...c, status: newStatus } : c))
        )
      }
    } catch (error) {
      const detail = error.response?.data?.detail
      if (detail && typeof detail === 'object' && detail.code === 'CLIENT_TRANSITION_BLOCKED') {
        if (detail.missing_fields?.some((item) => item.field === 'lifecycle_reason')) {
          setTransitionReason('')
          setReasonRequest({ clientId, newStatus, client })
        } else {
          setTransitionBlocker({ detail, client })
        }
      } else {
        toast.error(typeof detail === 'string' ? detail : 'Failed to update status')
      }
    } finally {
      setUpdatingStatusId(null)
    }
  }

  const openLifecycleAction = (client) => {
    const rule = lifecycleRules[client.status || '']
    if (!rule?.allowed_destinations?.length) return
    if (rule.transition_type === 'sequential' && rule.allowed_destinations.length === 1) {
      handleStatusChange(client.id, rule.allowed_destinations[0], client)
      return
    }
    setStageSelectionClient(client)
  }

  const getLifecycleActionLabel = (client) => {
    const status = client.status || 'active'
    if (status === 'new') return 'Start Onboarding'
    if (status === 'onboarding') return 'Activate Client'
    if (lifecycleRules[status]?.transition_type === 'conditional') return 'Update Client Stage'
    return lifecycleRules[status]?.action_label || 'Next Stage'
  }

  const handleCreateProject = async (e) => {
    e.preventDefault()
    if (!selectedClient || creatingProject) return

    try {
      setCreatingProject(true)

      const keyVal = (projectForm.key || (projectForm.name || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 16)).trim()
      // Create project first
      const projectData = {
        project_id: keyVal,
        name: projectForm.name,
        key: keyVal,
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
    setFormData({ ...EMPTY_CLIENT_FORM })
    setEditingClient(null)
    setFormErrors({})
    setClientFormStep(1)
  }

  // Opening the create modal restores any previously entered (unsaved) draft.
  const openCreateModal = () => {
    setEditingClient(null)
    setClientFormStep(1)
    setFormErrors({})
    setFormData(loadClientFormDraft() || { ...EMPTY_CLIENT_FORM })
    setShowCreateModal(true)
  }

  // Closing the modal (cross button, Escape, backdrop, or cancel) keeps the
  // partially filled values as a draft so they survive reopening. Only a
  // successful create clears the draft; edit-mode closes do not touch it.
  const closeCreateModal = () => {
    if (!editingClient) {
      saveClientFormDraft(formData)
    }
    setShowCreateModal(false)
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

  const getStartDateText = (client) => {
    if (client.start_date) return timeService.formatDateOnly(client.start_date)
    const startDate = getEarliestStartDate(client)
    return startDate ? format(startDate, 'MMM d, yyyy') : '-'
  }

  const getDeliveryDateText = (client) => {
    if (client.delivery_date) return timeService.formatDateOnly(client.delivery_date)
    const deliveryDate = getLatestDeliveryDate(client)
    return deliveryDate ? format(deliveryDate, 'MMM d, yyyy') : '-'
  }

  const getStartDateValue = (client) => {
    if (client.start_date) {
      const match = String(client.start_date).match(/^(\d{4}-\d{2}-\d{2})/)
      if (match) return match[1]
    }
    const startDate = getEarliestStartDate(client)
    return startDate ? format(startDate, 'yyyy-MM-dd') : ''
  }

  const getDeliveryDateValue = (client) => {
    if (client.delivery_date) {
      const match = String(client.delivery_date).match(/^(\d{4}-\d{2}-\d{2})/)
      if (match) return match[1]
    }
    const deliveryDate = getLatestDeliveryDate(client)
    return deliveryDate ? format(deliveryDate, 'yyyy-MM-dd') : ''
  }

  const updateColumnFilter = (key, value) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }))
  }

  const activeColumnFilterCount = Object.values(columnFilters).filter(Boolean).length + (!routeStatus && statusFilter ? 1 : 0)

  const clearColumnFilters = () => {
    setColumnFilters({
      type: '',
      projects: '',
      budget: '',
      start_date: '',
      delivery_date: '',
    })
    if (!routeStatus) setStatusFilter('')
  }

  const filteredClients = clients.filter(client => {
    const q = (value) => (value ?? '').toString().toLowerCase()
    const matchesSearch = !searchQuery ||
      q(client.name).includes(searchQuery.toLowerCase()) ||
      q(client.email).includes(searchQuery.toLowerCase()) ||
      q(client.company_name).includes(searchQuery.toLowerCase()) ||
      q(client.contact).includes(searchQuery.toLowerCase())

    const matchesStatus = !effectiveStatusFilter || (client.status || 'active') === effectiveStatusFilter

    const cf = columnFilters
    const matchesType = !cf.type || (client.client_type || '') === cf.type

    const totalProjects = client.total_projects ?? client.project_ids?.length ?? 0
    const matchesProjects = (() => {
      if (!cf.projects) return true
      if (cf.projects === '0') return totalProjects === 0
      if (cf.projects === '1-5') return totalProjects >= 1 && totalProjects <= 5
      if (cf.projects === '6-10') return totalProjects >= 6 && totalProjects <= 10
      if (cf.projects === '10+') return totalProjects > 10
      return true
    })()

    const budgetValue = client.budget > 0 ? Number(client.budget) : getTotalBudget(client)
    const matchesBudget = (() => {
      if (!cf.budget) return true
      if (budgetValue <= 0) return false
      if (cf.budget === 'lt-50000') return budgetValue < 50000
      if (cf.budget === '50000-100000') return budgetValue >= 50000 && budgetValue < 100000
      if (cf.budget === '100000-500000') return budgetValue >= 100000 && budgetValue < 500000
      if (cf.budget === '500000-1000000') return budgetValue >= 500000 && budgetValue < 1000000
      if (cf.budget === 'gt-1000000') return budgetValue >= 1000000
      return true
    })()

    const matchesStartDate = !cf.start_date || getStartDateValue(client) === cf.start_date
    const matchesDeliveryDate = !cf.delivery_date || getDeliveryDateValue(client) === cf.delivery_date

    return matchesSearch && matchesStatus && matchesType &&
      matchesProjects && matchesBudget && matchesStartDate && matchesDeliveryDate
  })

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / CLIENT_PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedClients = filteredClients.slice((safePage - 1) * CLIENT_PAGE_SIZE, safePage * CLIENT_PAGE_SIZE)

  const activeCount = useMemo(() => clients.filter(c => (c.status || 'active') === 'active').length, [clients])
  const totalPortfolioBudget = useMemo(() => clients.reduce((sum, c) => sum + getTotalBudget(c), 0), [clients])
  const totalProjectsCount = useMemo(() => clients.reduce((sum, c) => sum + (c.projects?.length || c.project_ids?.length || 0), 0), [clients])

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <SkeletonTable rows={8} cols={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 py-3.5 text-white shadow-lg">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2 backdrop-blur-md border border-white/20">
              <Briefcase className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight text-white tracking-tight md:text-xl">{pageTitle}</h1>
              <p className="text-xs text-indigo-100">{pageDescription}</p>
            </div>
          </div>
          {(isCompanyAdmin || isLead) && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-3.5 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/40 border border-white/20"
            >
              <Plus className="h-4 w-4" />
              <span>Add Client</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Stats Row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Clients" value={clients.length} icon={Users} color="indigo" subtitle="Registered Accounts" />
        <StatCard label="Active Accounts" value={activeCount} icon={CheckCircle2} color="emerald" subtitle="In Operations" />
        <StatCard label="Portfolio Budget" value={`₹${totalPortfolioBudget > 0 ? totalPortfolioBudget.toLocaleString() : '0'}`} icon={DollarSign} color="amber" subtitle="Total Contract Value" />
        <StatCard label="Linked Projects" value={totalProjectsCount} icon={FolderKanban} color="purple" subtitle="Active Deliverables" />
      </div>

      {/* Search & Filter Controls Surface */}
      <div className="rounded-2xl border border-gray-200/80 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search clients by name, company, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50/50 pl-9 pr-3 py-2 text-xs font-medium text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-gray-800/50 dark:text-white dark:focus:bg-gray-800"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                showFilters || activeColumnFilterCount > 0
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-indigo-600'
              }`}
            >
              <Filter className="h-4 w-4" />
              <span>Filters</span>
              {activeColumnFilterCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold text-white">
                  {activeColumnFilterCount}
                </span>
              )}
            </button>
            {activeColumnFilterCount > 0 && (
              <button
                type="button"
                onClick={clearColumnFilters}
                title="Clear all filters"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:border-rose-300 hover:text-rose-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-rose-700 dark:hover:text-rose-400"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="mt-3 border-t border-gray-200/80 pt-3 dark:border-gray-800">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FormField label="Type">
                <select value={columnFilters.type} onChange={(e) => updateColumnFilter('type', e.target.value)} className={inputClassName}>
                  <option value="">All types</option>
                  <option value="monthly">Monthly</option>
                  <option value="one_time">One Time</option>
                </select>
              </FormField>
              <FormField label="Projects">
                <select value={columnFilters.projects} onChange={(e) => updateColumnFilter('projects', e.target.value)} className={inputClassName}>
                  <option value="">Any count</option>
                  <option value="0">0</option>
                  <option value="1-5">1 – 5</option>
                  <option value="6-10">6 – 10</option>
                  <option value="10+">More than 10</option>
                </select>
              </FormField>
              <FormField label="Budget">
                <select value={columnFilters.budget} onChange={(e) => updateColumnFilter('budget', e.target.value)} className={inputClassName}>
                  <option value="">Any amount</option>
                  <option value="lt-50000">Under ₹50,000</option>
                  <option value="50000-100000">₹50,000 – ₹1,00,000</option>
                  <option value="100000-500000">₹1,00,000 – ₹5,00,000</option>
                  <option value="500000-1000000">₹5,00,000 – ₹10,00,000</option>
                  <option value="gt-1000000">Above ₹10,00,000</option>
                </select>
              </FormField>
              <FormField label="Start date">
                <input type="date" value={columnFilters.start_date} onChange={(e) => updateColumnFilter('start_date', e.target.value)} className={inputClassName} />
              </FormField>
              <FormField label="Delivery date">
                <input type="date" value={columnFilters.delivery_date} onChange={(e) => updateColumnFilter('delivery_date', e.target.value)} className={inputClassName} />
              </FormField>
              {!routeStatus && (
                <FormField label="Status">
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClassName}>
                    <option value="">All statuses</option>
                    <option value="new">New</option>
                    <option value="onboarding">Onboarding</option>
                    <option value="active">Active</option>
                    <option value="at_risk">At Risk</option>
                    <option value="on_hold">On Hold</option>
                    <option value="renewal_due">Renewal Due</option>
                    <option value="churned">Churned</option>
                    <option value="archived">Archived</option>
                  </select>
                </FormField>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {activeColumnFilterCount > 0
                  ? `${activeColumnFilterCount} filter${activeColumnFilterCount > 1 ? 's' : ''} active`
                  : 'No filters applied'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearColumnFilters}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Clients Table / Cards Container */}

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
              onClick={openCreateModal}
              className="btn btn-primary"
            >
              Add Your First Client
            </button>
          ) : null}
        />
      ) : (
        <div className="rounded-2xl border border-gray-200/80 bg-white shadow-sm overflow-hidden dark:border-gray-800 dark:bg-gray-900">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200/80 bg-gray-50/70 font-semibold text-gray-500 uppercase tracking-wider dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400">
                  <th className="py-3.5 px-4">Client</th>
                  <th className="py-3.5 px-4">Contact</th>
                  <th className="py-3.5 px-4">Email</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Projects</th>
                  <th className="py-3.5 px-4">Budget</th>
                  <th className="py-3.5 px-4">Start Date</th>
                  <th className="py-3.5 px-4">Delivery Date</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {paginatedClients.map((client) => {
                  const lifecycleRule = lifecycleRules[client.status || 'active']
                  return (
                    <tr
                    key={client.id}
                    className="group cursor-pointer transition hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20"
                    onClick={() => openClientWorkspace(client.id)}
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white shadow-sm">
                          {client.name?.[0]?.toUpperCase() || 'C'}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-gray-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400 transition">{client.name}</div>
                          {client.company_name && (
                            <div className="text-[11px] text-gray-500 dark:text-gray-400">{client.company_name}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300 font-medium">
                      {client.contact || '-'}
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">
                      {client.email || '-'}
                    </td>
                    <td className="py-3.5 px-4">
                      {client.client_type === 'monthly' ? (
                        <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">Monthly</span>
                      ) : client.client_type === 'one_time' ? (
                        <span className="inline-flex items-center rounded-lg bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60">One Time</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-gray-900 dark:text-white font-bold">
                      {client.total_projects ?? client.project_ids?.length ?? 0}
                    </td>
                    <td className="py-3.5 px-4 text-gray-900 dark:text-white font-bold">
                      {client.budget > 0 ? `₹${Number(client.budget).toLocaleString()}` : getTotalBudget(client) > 0 ? `₹${getTotalBudget(client).toLocaleString()}` : '-'}
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">
                      {getStartDateText(client)}
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">
                      {getDeliveryDateText(client)}
                    </td>
                    <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusMeta(client.status || 'active').chipClass}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${getStatusMeta(client.status || 'active').dotClass}`}></span>
                        {getStatusMeta(client.status || 'active').label}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(isCompanyAdmin || isLead) && lifecycleRule?.allowed_destinations?.length ? (
                          <button
                            type="button"
                            disabled={updatingStatusId === client.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              openLifecycleAction(client)
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full bg-orange-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm ring-1 ring-orange-300/50 transition hover:bg-orange-600 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <span aria-hidden="true" className="text-sm leading-none">→</span>
                            <span>{getLifecycleActionLabel(client)}</span>
                          </button>
                        ) : null}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleViewClient(client)
                          }}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-gray-800 dark:hover:text-indigo-400 transition"
                          title="View Client Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {isCompanyAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteClient(client.id)
                            }}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 transition"
                            title="Delete Client"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-2 border-t border-gray-200/80 px-4 py-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {(safePage - 1) * CLIENT_PAGE_SIZE + 1}-{Math.min(safePage * CLIENT_PAGE_SIZE, filteredClients.length)} of {filteredClients.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={safePage <= 1}
                className="rounded-lg border border-gray-200 px-3 py-1.5 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Previous
              </button>
              <span className="font-semibold text-gray-700 dark:text-gray-200">Page {safePage} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={safePage >= totalPages}
                className="rounded-lg border border-gray-200 px-3 py-1.5 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={Boolean(stageSelectionClient)}
        onClose={() => setStageSelectionClient(null)}
        title="Update Client Stage"
        description={stageSelectionClient ? `Choose the next business state for ${stageSelectionClient.name}.` : ''}
        size="md"
      >
        <div className="space-y-2">
          {(lifecycleRules[stageSelectionClient?.status || '']?.allowed_destinations || []).map((stage) => {
            const meta = getStatusMeta(stage)
            return (
              <button
                key={stage}
                type="button"
                onClick={() => {
                  const client = stageSelectionClient
                  setStageSelectionClient(null)
                  handleStatusChange(client.id, stage, client)
                }}
                className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left text-sm font-semibold transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                <span className={`h-2 w-2 rounded-full ${meta.dotClass}`}></span>
                <span>{meta.label}</span>
              </button>
            )
          })}
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(transitionBlocker)}
        onClose={() => setTransitionBlocker(null)}
        title="Cannot Update Client Stage"
        description="Complete the missing information, then retry the stage movement."
        size="md"
        footer={(
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setTransitionBlocker(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                const client = transitionBlocker?.client
                setTransitionBlocker(null)
                if (client) {
                  handleEditClient(client)
                }
              }}
            >
              Complete Missing Information
            </Button>
            {transitionBlocker?.detail?.missing_fields?.some((item) => item.field === 'kickoff_meeting') ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const client = transitionBlocker?.client
                  setTransitionBlocker(null)
                  if (client?.id) navigate(`/clients/${client.id}/workspace?tab=meetings`)
                }}
              >
                Open Workspace
              </Button>
            ) : null}
          </div>
        )}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                {transitionBlocker?.detail?.message || 'This client cannot move stages yet.'}
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-700 dark:text-amber-300">
                {(transitionBlocker?.detail?.missing_fields || []).map((item) => (
                  <li key={item.field}>{item.label || String(item.field).replace(/_/g, ' ')}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
            Client stays in current stage until backend lifecycle validation accepts the transition.
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(reasonRequest)}
        onClose={() => setReasonRequest(null)}
        title="Update Client Stage"
        description={reasonRequest?.newStatus ? `Why is this client moving to ${getStatusMeta(reasonRequest.newStatus).label}?` : ''}
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setReasonRequest(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!transitionReason.trim() || updatingStatusId === reasonRequest?.clientId}
              onClick={async () => {
                const request = reasonRequest
                setReasonRequest(null)
                await handleStatusChange(request.clientId, request.newStatus, request.client, transitionReason)
              }}
            >
              Update Stage
            </Button>
          </div>
        )}
      >
        <div className="space-y-2">
          <label htmlFor="client-lifecycle-reason" className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Reason
          </label>
          <textarea
            id="client-lifecycle-reason"
            value={transitionReason}
            onChange={(event) => setTransitionReason(event.target.value)}
            rows={4}
            placeholder="Record the business reason for this stage change"
            className={`${inputClassName} min-h-24 resize-y`}
          />
        </div>
      </Modal>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <Modal
          isOpen={showCreateModal}
          onClose={closeCreateModal}
          title={editingClient ? 'Edit client' : 'Create client'}
          description={clientFormStep === 1 ? 'Step 1 of 2: identify the client and how to contact them.' : 'Step 2 of 2: add ownership, billing, address, and handoff details.'}
          size="lg"
          bodyClassName="bg-gray-50/60 dark:bg-gray-950/30"
          footer={(
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                <span className={clientFormStep === 1 ? 'text-indigo-600 dark:text-indigo-300' : ''}>Step 1: Contact</span>
                <span className="h-px w-8 bg-gray-300 dark:bg-gray-700" />
                <span className={clientFormStep === 2 ? 'text-indigo-600 dark:text-indigo-300' : ''}>Step 2: Details</span>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (clientFormStep === 2) {
                      setClientFormStep(1)
                      return
                    }
                    closeCreateModal()
                  }}
                >
                  {clientFormStep === 2 ? 'Back' : 'Cancel'}
                </Button>
                {clientFormStep === 1 ? (
                  <Button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault()
                      if (validateClientForm()) setClientFormStep(2)
                    }}
                  >
                    Next
                  </Button>
                ) : (
                  <Button type="submit" form="client-create-form" loading={submitting} loadingText="Saving">
                    {editingClient ? 'Update client' : 'Create client'}
                  </Button>
                )}
              </div>
            </div>
          )}
        >
          <form id="client-create-form" onSubmit={editingClient ? handleUpdateClient : handleCreateClient} className="space-y-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
                <div className="flex gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${clientFormStep === 1 ? 'bg-indigo-600 text-white shadow-sm' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}>
                    {clientFormStep === 1 ? '1' : <CheckCircle2 className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Contact setup</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">Capture the required client identity, company, email, phone, and industry.</p>
                  </div>
                </div>
                <div className={`hidden h-px w-16 translate-y-4 sm:block ${clientFormStep === 2 ? 'bg-emerald-300 dark:bg-emerald-800' : 'bg-gray-200 dark:bg-gray-800'}`} />
                <div className="flex gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${clientFormStep === 2 ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                    2
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${clientFormStep === 2 ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>Client details</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">Add owner, billing type, budget, timeline, location, tags, and notes.</p>
                  </div>
                </div>
              </div>
            </div>

            {clientFormStep === 1 ? (
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Client name" required>
                  <input type="text" value={formData.name} onChange={(e) => updateClientField('name', e.target.value)} className="input min-h-11" required aria-invalid={Boolean(formErrors.name)} placeholder="Primary contact or account name" />
                  {formErrors.name ? <p className="mt-1 text-xs text-red-600" role="alert">{formErrors.name}</p> : null}
                </FormField>
                <FormField label="Company name">
                  <input type="text" value={formData.company_name} onChange={(e) => updateClientField('company_name', e.target.value)} className="input min-h-11" placeholder="Organization name" />
                </FormField>
                <FormField label="Email">
                  <input type="email" value={formData.email} onChange={(e) => updateClientField('email', e.target.value)} className="input min-h-11" aria-invalid={Boolean(formErrors.email)} placeholder="client@example.com" />
                  {formErrors.email ? <p className="mt-1 text-xs text-red-600" role="alert">{formErrors.email}</p> : null}
                </FormField>
                <FormField label="Primary phone">
                  <PhoneInput value={formData.contact} onChange={(e) => updateClientField('contact', e.target.value)} className="input min-h-11" placeholder="Enter number" />
                </FormField>
                <FormField label="Alternate phone">
                  <PhoneInput value={formData.alternate_contact} onChange={(e) => updateClientField('alternate_contact', e.target.value)} className="input min-h-11" placeholder="Enter number" />
                </FormField>
                <FormField label="Industry">
                  <input type="text" value={formData.industry} onChange={(e) => updateClientField('industry', e.target.value)} className="input min-h-11" placeholder="SaaS, Retail, Healthcare" />
                </FormField>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="Assigned to">
                    <CreatableSelectField value={formData.assigned_to} onChange={(value) => updateClientField('assigned_to', value)} className="input min-h-11" createLabel="Create user" onCreate={() => setShowQuickEmployeeModal(true)} canCreate={isCompanyAdmin || isLead}>
                      <option value="">Select owner</option>
                      {leads.map(lead => (
                        <option key={lead.id} value={lead.id}>{lead.first_name} {lead.last_name}</option>
                      ))}
                      {assignableUsers
                        .filter(u => u.role === 'manager')
                        .map(manager => (
                          <option key={manager.id} value={manager.id}>{manager.first_name} {manager.last_name}</option>
                        ))}
                    </CreatableSelectField>
                  </FormField>
                  <FormField label="Client type">
                    <select value={formData.client_type} onChange={(e) => updateClientField('client_type', e.target.value)} className="input min-h-11">
                      <option value="">Select type</option>
                      <option value="monthly">Monthly Client</option>
                      <option value="one_time">One Time Client</option>
                    </select>
                  </FormField>
                  <FormField label="Budget">
                    <input type="number" value={formData.budget} onChange={(e) => updateClientField('budget', e.target.value)} className="input min-h-11" step="0.01" placeholder="Total client budget" />
                  </FormField>
                  <FormField label="Start date">
                    <input type="date" value={formData.start_date} onChange={(e) => updateClientField('start_date', e.target.value)} className="input min-h-11" />
                  </FormField>
                  <FormField label="Delivery date">
                    <input type="date" value={formData.delivery_date} onChange={(e) => updateClientField('delivery_date', e.target.value)} className="input min-h-11" />
                  </FormField>
                  <FormField label="Tags">
                    <input type="text" value={formData.tags} onChange={(e) => updateClientField('tags', e.target.value)} className="input min-h-11" placeholder="important, vip, recurring" />
                  </FormField>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="Address">
                    <input type="text" value={formData.address} onChange={(e) => updateClientField('address', e.target.value)} className="input min-h-11" placeholder="Street address" />
                  </FormField>
                  <FormField label="City">
                    <input type="text" value={formData.city} onChange={(e) => updateClientField('city', e.target.value)} className="input min-h-11" />
                  </FormField>
                  <FormField label="State">
                    <input type="text" value={formData.state} onChange={(e) => updateClientField('state', e.target.value)} className="input min-h-11" />
                  </FormField>
                  <FormField label="Country">
                    <input type="text" value={formData.country} onChange={(e) => updateClientField('country', e.target.value)} className="input min-h-11" />
                  </FormField>
                  <FormField label="ZIP code">
                    <input type="text" value={formData.zip_code} onChange={(e) => updateClientField('zip_code', e.target.value)} className="input min-h-11" />
                  </FormField>
                </div>
                <FormField label="Notes">
                  <textarea value={formData.notes} onChange={(e) => updateClientField('notes', e.target.value)} className="input min-h-24" rows="3" placeholder="Contract context, preferred communication, or handoff notes" />
                </FormField>
              </div>
            )}
          </form>
        </Modal>
      )}
      {false && showCreateModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCreateModal(false)
              resetForm()
            }
          }}
        >
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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

      {/* Client Detail Modal - Redesigned & Beautiful */}
      {showDetailModal && selectedClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDetailModal(false)
          }}
        >
          <div
            className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl border border-gray-100 bg-white shadow-2xl transition-all dark:border-gray-800 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Hero Banner */}
            <div className="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 p-6 sm:p-8 text-white">
              <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-3xl"></div>
              <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-3xl"></div>

              <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/30 bg-white/20 text-2xl font-bold text-white shadow-lg backdrop-blur-md">
                    {selectedClient.name?.[0]?.toUpperCase() || 'C'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-bold tracking-tight text-white">{selectedClient.name}</h2>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${selectedClient.status === 'active' ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30' :
                        selectedClient.status === 'archived' ? 'bg-rose-500/20 text-rose-200 border border-rose-400/30' :
                          'bg-white/20 text-gray-200 border border-white/30'
                        }`}>
                        {selectedClient.status || 'Active'}
                      </span>
                    </div>
                    {selectedClient.company_name && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-indigo-100">
                        <Building2 className="h-4 w-4 opacity-80" />
                        {selectedClient.company_name}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => openClientWorkspace(selectedClient.id)}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/20 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/40"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Workspace
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDetailModal(false)
                      setSelectedClient(null)
                    }}
                    className="rounded-xl bg-black/20 p-2.5 text-white/80 backdrop-blur-md transition hover:bg-black/30 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 bg-gray-50/50 p-4 sm:grid-cols-4 dark:border-gray-800 dark:bg-gray-900/50">
              <div className="rounded-2xl border border-gray-200/60 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-800/80">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Budget</span>
                <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
                  ₹{getTotalBudget(selectedClient) > 0 ? getTotalBudget(selectedClient).toLocaleString() : '0'}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200/60 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-800/80">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Projects</span>
                <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
                  {selectedClient.projects?.length || selectedClient.project_ids?.length || 0} Linked
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200/60 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-800/80">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Documents</span>
                <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
                  {selectedClient.documents?.length || 0} Files
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200/60 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-800/80">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Assigned Lead</span>
                <p className="mt-1 text-sm font-semibold truncate text-gray-900 dark:text-white">
                  {selectedClient.assigned_to_name || 'Unassigned'}
                </p>
              </div>
            </div>

            {/* Modal Body Content */}
            <div className="space-y-6 p-6">
              <div className="grid gap-6 md:grid-cols-2">
                {/* Contact Information Card */}
                <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800/40">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white mb-4">
                    <User className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    Contact & Address
                  </h3>
                  <div className="space-y-3 text-xs">
                    {selectedClient.email ? (
                      <a href={`mailto:${selectedClient.email}`} className="flex items-center gap-2.5 text-gray-700 hover:text-indigo-600 dark:text-gray-300 dark:hover:text-indigo-400 transition">
                        <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                          <Mail className="h-3.5 w-3.5" />
                        </div>
                        <span className="font-medium">{selectedClient.email}</span>
                      </a>
                    ) : null}
                    {selectedClient.contact ? (
                      <div className="flex items-center gap-2.5 text-gray-700 dark:text-gray-300">
                        <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                          <Phone className="h-3.5 w-3.5" />
                        </div>
                        <span>{selectedClient.contact}</span>
                      </div>
                    ) : null}
                    {selectedClient.address ? (
                      <div className="flex items-start gap-2.5 text-gray-700 dark:text-gray-300">
                        <div className="rounded-lg bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 mt-0.5">
                          <MapPin className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <p>{selectedClient.address}</p>
                          {(selectedClient.city || selectedClient.state || selectedClient.country) && (
                            <p className="text-gray-500 dark:text-gray-400 text-[11px] mt-0.5">
                              {[selectedClient.city, selectedClient.state, selectedClient.country, selectedClient.zip_code].filter(Boolean).join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Additional Details Card */}
                <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800/40">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white mb-4">
                    <Briefcase className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    Account Details
                  </h3>
                  <div className="space-y-3 text-xs">
                    {selectedClient.industry && (
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
                        <span className="text-gray-500 dark:text-gray-400">Industry</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{selectedClient.industry}</span>
                      </div>
                    )}
                    {selectedClient.client_type && (
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
                        <span className="text-gray-500 dark:text-gray-400">Billing Type</span>
                        <span className="font-semibold capitalize text-indigo-600 dark:text-indigo-400">{selectedClient.client_type}</span>
                      </div>
                    )}
                    {selectedClient.tags?.length ? (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Tags</span>
                        <div className="flex flex-wrap gap-1">
                          {selectedClient.tags.map((tag, i) => (
                            <span key={i} className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Linked Projects Card */}
              <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800/40">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderKanban className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Linked Projects</h3>
                  </div>
                  {(isCompanyAdmin || isLead) && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProjectId('')
                          setProjectSearch('')
                          setShowAddProjectModal(true)
                        }}
                        className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        <FolderKanban className="h-3.5 w-3.5 text-indigo-500" />
                        Link Project
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
                        className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Create Project
                      </button>
                    </div>
                  )}
                </div>

                {selectedClient.projects && selectedClient.projects.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selectedClient.projects.map((project) => (
                      <div key={project.id} className="group rounded-xl border border-gray-200/70 bg-gray-50/50 p-4 transition hover:border-indigo-300 hover:bg-white hover:shadow-md dark:border-gray-800 dark:bg-gray-800/60 dark:hover:border-indigo-700">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400 transition">{project.name}</h4>
                            <span className="mt-1 inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                              {project.key}
                            </span>
                          </div>
                          {project.budget > 0 && (
                            <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                              ₹{Number(project.budget).toLocaleString()}
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-gray-200/60 pt-3 dark:border-gray-700/60">
                          <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                            {project.start_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-indigo-500" />
                                {timeService.formatDateOnly(project.start_date)}
                              </span>
                            )}
                            {project.delivery_date && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-amber-500" />
                                {timeService.formatDateOnly(project.delivery_date)}
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setShowDetailModal(false)
                              navigate(`/projects/${project.id}/board`)
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 transition hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                          >
                            Open Board <ExternalLink className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center dark:border-gray-800">
                    <p className="text-xs text-gray-500 dark:text-gray-400">No projects linked to this client yet.</p>
                  </div>
                )}
              </div>

              {/* Uploaded Documents Card */}
              <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800/40">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Uploaded Documents</h3>
                  </div>
                  {(isCompanyAdmin || isLead) && (
                    <button
                      type="button"
                      onClick={() => setShowDocumentModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Upload Document
                    </button>
                  )}
                </div>

                {selectedClient.documents && selectedClient.documents.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selectedClient.documents.map((doc, index) => (
                      <div key={index} className="flex items-center justify-between rounded-xl border border-gray-200/70 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/60">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-gray-900 dark:text-white">{doc.name}</p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">
                              {(doc.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                        <a
                          href={`${import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:8000'}${doc.url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg p-2 text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/50"
                          title="Download document"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center dark:border-gray-800">
                    <p className="text-xs text-gray-500 dark:text-gray-400">No documents uploaded yet.</p>
                  </div>
                )}
              </div>

              {/* Notes Card */}
              {selectedClient.notes && (
                <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800/40">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Internal Notes</h3>
                  <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{selectedClient.notes}</p>
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
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateProjectModal(false)
          }}
        >
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
                    <label className="block text-xs font-medium text-gray-700 mb-1">Project Name *</label>
                    <input
                      type="text"
                      value={projectForm.name}
                      onChange={(e) => {
                        const val = e.target.value
                        const autoKey = val.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 16)
                        setProjectForm({ ...projectForm, name: val, key: autoKey, project_id: autoKey })
                      }}
                      className="input"
                      required
                      placeholder="Enter project name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Project Key *</label>
                    <input
                      type="text"
                      readOnly
                      tabIndex={-1}
                      value={projectForm.key}
                      className="input bg-gray-100 dark:bg-gray-800 cursor-not-allowed font-mono"
                      placeholder="Auto-generated"
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
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDocumentModal(false)
          }}
        >
          <div className="bg-white rounded-lg max-w-md w-full" onClick={(e) => e.stopPropagation()}>
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
