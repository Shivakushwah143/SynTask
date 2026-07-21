import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { 
  workflowsApi 
} from '../api/workflows'
import { useAuthStore } from '../store/authStore'
import { hasCompanyAdminAccess } from '../utils/roles'
import { 
  PageHeader, 
  Button, 
  Modal, 
  FormField, 
  EmptyState, 
  Badge, 
  ConfirmDialog 
} from '../components/ui'
import { 
  Workflow, 
  GitBranch, 
  Settings, 
  Plus, 
  Edit, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  ArrowRight, 
  Circle, 
  Layers, 
  Activity,
  Zap,
  Award
} from 'lucide-react'

const defaultWorkflowForm = { name: '', description: '', initial_status: 'todo', is_default: false }
const defaultStatusForm = { name: '', key: '', description: '', color: '#0052CC', category: 'todo', order: 0 }
const defaultTransitionForm = { name: '', from_status: '', to_status: '' }
const emptyEditing = { type: '', id: null }
const emptyConfirm = { type: '', item: null, loading: false }

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

// Workflow Card Component
const WorkflowCard = ({ workflow, onEdit, onToggle, onDelete, statuses }) => {
  const statusMap = statuses.reduce((acc, s) => ({ ...acc, [s.key]: s }), {})
  const initialStatus = statusMap[workflow.initial_status]

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white">
            <Workflow className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{workflow.name}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{workflow.description || 'No description'}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {workflow.is_default && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  <Award className="h-3 w-3 mr-1" />
                  Default
                </span>
              )}
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                workflow.is_active 
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
              }`}>
                {workflow.is_active ? (
                  <><CheckCircle2 className="h-3 w-3 mr-1" /> Active</>
                ) : (
                  <><XCircle className="h-3 w-3 mr-1" /> Inactive</>
                )}
              </span>
              {initialStatus && (
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  <Circle className="h-3 w-3 mr-1" />
                  Start: {initialStatus.name}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={() => onEdit(workflow)} 
            className="gap-1.5"
          >
            <Edit className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={() => onToggle(workflow.id)} 
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {workflow.is_active ? 'Deactivate' : 'Activate'}
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => onDelete(workflow)} 
            className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// Status Badge Component
const StatusBadge = ({ status, onEdit, onDelete }) => {
  const categoryColors = {
    todo: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  }

  return (
    <div 
      className="group flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: status.color || '#0052CC' }} />
        <span className={`text-xs font-medium ${categoryColors[status.category] || 'text-gray-700 dark:text-gray-300'}`}>
          {status.name}
        </span>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onEdit(status)}
          className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-gray-700"
          aria-label="Edit status"
        >
          <Edit className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(status)}
          className="rounded p-1 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
          aria-label="Delete status"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

// Transition Card Component
const TransitionCard = ({ transition, onEdit, onDelete, statuses }) => {
  const statusMap = statuses.reduce((acc, s) => ({ ...acc, [s.key]: s }), {})
  const fromStatus = statusMap[transition.from_status]
  const toStatus = statusMap[transition.to_status]

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3 transition hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-900/30 dark:hover:border-indigo-700">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {fromStatus?.name || transition.from_status}
          </span>
          <ArrowRight className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {toStatus?.name || transition.to_status}
          </span>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">{transition.name}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onEdit(transition)}
          className="rounded p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-gray-700"
          aria-label="Edit transition"
        >
          <Edit className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(transition)}
          className="rounded p-1.5 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
          aria-label="Delete transition"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

const WorkflowAdmin = () => {
  const { user } = useAuthStore()
  const canManage = hasCompanyAdminAccess(user?.role)
  const [loading, setLoading] = useState(true)
  const [workflows, setWorkflows] = useState([])
  const [statuses, setStatuses] = useState([])
  const [transitions, setTransitions] = useState([])
  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [transitionOpen, setTransitionOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(emptyEditing)
  const [workflowForm, setWorkflowForm] = useState(defaultWorkflowForm)
  const [statusForm, setStatusForm] = useState(defaultStatusForm)
  const [transitionForm, setTransitionForm] = useState(defaultTransitionForm)
  const [confirmDelete, setConfirmDelete] = useState(emptyConfirm)

  const loadData = async () => {
    try {
      setLoading(true)
      const [workflowResponse, statusResponse, transitionResponse] = await Promise.all([
        workflowsApi.getWorkflows(),
        workflowsApi.getStatuses(),
        workflowsApi.getTransitions(),
      ])
      setWorkflows(workflowResponse.data.workflows || [])
      setStatuses(statusResponse.data.statuses || [])
      setTransitions(transitionResponse.data.transitions || [])
    } catch (error) {
      toast.error('Failed to load workflow data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const statusOptions = useMemo(() => statuses.map((status) => ({ value: status.key, label: status.name || status.key })), [statuses])

  const resetWorkflowModal = () => {
    setWorkflowForm(defaultWorkflowForm)
    setEditing(emptyEditing)
    setWorkflowOpen(false)
  }

  const resetStatusModal = () => {
    setStatusForm(defaultStatusForm)
    setEditing(emptyEditing)
    setStatusOpen(false)
  }

  const resetTransitionModal = () => {
    setTransitionForm(defaultTransitionForm)
    setEditing(emptyEditing)
    setTransitionOpen(false)
  }

  const openCreateWorkflow = () => {
    setEditing(emptyEditing)
    setWorkflowForm(defaultWorkflowForm)
    setWorkflowOpen(true)
  }

  const openEditWorkflow = (workflow) => {
    setEditing({ type: 'workflow', id: workflow.id })
    setWorkflowForm({
      name: workflow.name || '',
      description: workflow.description || '',
      initial_status: workflow.initial_status || 'todo',
      is_default: Boolean(workflow.is_default),
    })
    setWorkflowOpen(true)
  }

  const openCreateStatus = () => {
    setEditing(emptyEditing)
    setStatusForm(defaultStatusForm)
    setStatusOpen(true)
  }

  const openEditStatus = (status) => {
    setEditing({ type: 'status', id: status.id })
    setStatusForm({
      name: status.name || '',
      key: status.key || '',
      description: status.description || '',
      color: status.color || '#0052CC',
      category: status.category || 'todo',
      order: status.order || 0,
    })
    setStatusOpen(true)
  }

  const openCreateTransition = () => {
    setEditing(emptyEditing)
    setTransitionForm(defaultTransitionForm)
    setTransitionOpen(true)
  }

  const openEditTransition = (transition) => {
    setEditing({ type: 'transition', id: transition.id })
    setTransitionForm({
      name: transition.name || '',
      from_status: transition.from_status || '',
      to_status: transition.to_status || '',
    })
    setTransitionOpen(true)
  }

  const handleCreateWorkflow = async (event) => {
    event.preventDefault()
    try {
      setSaving(true)
      await workflowsApi.createWorkflow(workflowForm)
      toast.success('Workflow created')
      resetWorkflowModal()
      await loadData()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create workflow')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveWorkflow = async (event) => {
    event.preventDefault()
    try {
      setSaving(true)
      await workflowsApi.updateWorkflow(editing.id, workflowForm)
      toast.success('Workflow updated')
      resetWorkflowModal()
      await loadData()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update workflow')
    } finally {
      setSaving(false)
    }
  }

  const requestDeleteWorkflow = (workflow) => {
    setConfirmDelete({ type: 'workflow', item: workflow, loading: false })
  }

  const deleteWorkflow = async (workflowId) => {
    try {
      setConfirmDelete((state) => ({ ...state, loading: true }))
      await workflowsApi.deleteWorkflow(workflowId)
      toast.success('Workflow deleted')
      setConfirmDelete(emptyConfirm)
      await loadData()
    } catch (error) {
      setConfirmDelete((state) => ({ ...state, loading: false }))
      toast.error(error.response?.data?.detail || 'Failed to delete workflow')
    }
  }

  const handleCreateStatus = async (event) => {
    event.preventDefault()
    try {
      setSaving(true)
      await workflowsApi.createStatus(statusForm)
      toast.success('Status created')
      resetStatusModal()
      await loadData()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create status')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveStatus = async (event) => {
    event.preventDefault()
    try {
      setSaving(true)
      await workflowsApi.updateStatus(editing.id, statusForm)
      toast.success('Status updated')
      resetStatusModal()
      await loadData()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update status')
    } finally {
      setSaving(false)
    }
  }

  const requestDeleteStatus = (status) => {
    setConfirmDelete({ type: 'status', item: status, loading: false })
  }

  const deleteStatus = async (statusId) => {
    try {
      setConfirmDelete((state) => ({ ...state, loading: true }))
      await workflowsApi.deleteStatus(statusId)
      toast.success('Status deleted')
      setConfirmDelete(emptyConfirm)
      await loadData()
    } catch (error) {
      setConfirmDelete((state) => ({ ...state, loading: false }))
      toast.error(error.response?.data?.detail || 'Failed to delete status')
    }
  }

  const handleCreateTransition = async (event) => {
    event.preventDefault()
    try {
      setSaving(true)
      await workflowsApi.createTransition(transitionForm)
      toast.success('Transition created')
      resetTransitionModal()
      await loadData()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create transition')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveTransition = async (event) => {
    event.preventDefault()
    try {
      setSaving(true)
      await workflowsApi.updateTransition(editing.id, transitionForm)
      toast.success('Transition updated')
      resetTransitionModal()
      await loadData()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update transition')
    } finally {
      setSaving(false)
    }
  }

  const requestDeleteTransition = (transition) => {
    setConfirmDelete({ type: 'transition', item: transition, loading: false })
  }

  const deleteTransition = async (transitionId) => {
    try {
      setConfirmDelete((state) => ({ ...state, loading: true }))
      await workflowsApi.deleteTransition(transitionId)
      toast.success('Transition deleted')
      setConfirmDelete(emptyConfirm)
      await loadData()
    } catch (error) {
      setConfirmDelete((state) => ({ ...state, loading: false }))
      toast.error(error.response?.data?.detail || 'Failed to delete transition')
    }
  }

  const getDeleteConfirmCopy = () => {
    const item = confirmDelete.item || {}
    if (confirmDelete.type === 'workflow') {
      return {
        title: `Delete workflow "${item.name || 'Untitled workflow'}"?`,
        message: `This will remove the workflow definition "${item.name || 'Untitled workflow'}". Statuses and transitions that depend on this workflow may no longer be available to users.`,
        label: 'Delete workflow',
      }
    }
    if (confirmDelete.type === 'status') {
      const transitionCount = transitions.filter((transition) => transition.from_status === item.key || transition.to_status === item.key).length
      return {
        title: `Delete status "${item.name || item.key || 'Untitled status'}"?`,
        message: `This will remove status "${item.name || item.key || 'Untitled status'}" from the workflow. ${transitionCount} transition${transitionCount === 1 ? '' : 's'} currently reference this status and may need reassignment.`,
        label: 'Delete status',
      }
    }
    if (confirmDelete.type === 'transition') {
      return {
        title: `Delete transition "${item.name || 'Untitled transition'}"?`,
        message: `This will remove the allowed movement from "${item.from_status || 'source'}" to "${item.to_status || 'target'}". Users will no longer be able to move work through this path.`,
        label: 'Delete transition',
      }
    }
    return { title: 'Confirm delete', message: '', label: 'Delete' }
  }

  const handleConfirmDelete = () => {
    const itemId = confirmDelete.item?.id
    if (!itemId) return
    if (confirmDelete.type === 'workflow') {
      deleteWorkflow(itemId)
      return
    }
    if (confirmDelete.type === 'status') {
      deleteStatus(itemId)
      return
    }
    if (confirmDelete.type === 'transition') {
      deleteTransition(itemId)
    }
  }

  const toggleWorkflow = async (workflowId) => {
    try {
      await workflowsApi.toggleWorkflow(workflowId)
      await loadData()
    } catch {
      toast.error('Failed to change workflow state')
    }
  }

  if (!canManage) {
    return (
      <div className="p-6">
        <EmptyState title="Access restricted" description="Workflow configuration is available to company admins only." />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
              <Settings className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">Workflow Admin</h1>
              <p className="mt-1 text-indigo-100">Manage statuses, transitions, and workflow definitions for your company.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={openCreateStatus}
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
            >
              <Plus className="h-4 w-4" />
              New Status
            </button>
            <button
              onClick={openCreateTransition}
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
            >
              <GitBranch className="h-4 w-4" />
              New Transition
            </button>
            <button
              onClick={openCreateWorkflow}
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
            >
              <Workflow className="h-4 w-4" />
              New Workflow
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Workflows"
          value={workflows.length}
          icon={Workflow}
          color="indigo"
          subtitle="Process definitions"
        />
        <StatCard
          label="Statuses"
          value={statuses.length}
          icon={Circle}
          color="emerald"
          subtitle="State definitions"
        />
        <StatCard
          label="Transitions"
          value={transitions.length}
          icon={GitBranch}
          color="amber"
          subtitle="Allowed movements"
        />
      </div>

      {/* Main Content */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Workflows Section */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                <Workflow className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Workflow Definitions</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{workflows.length} workflows</p>
              </div>
            </div>
          </div>
          <div className="p-4 space-y-3">
            {loading ? (
              <div className="py-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>
            ) : workflows.length ? (
              workflows.map((workflow) => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  onEdit={openEditWorkflow}
                  onToggle={toggleWorkflow}
                  onDelete={requestDeleteWorkflow}
                  statuses={statuses}
                />
              ))
            ) : (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                  <Workflow className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white">No workflows</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Create the first workflow to define your process.</p>
              </div>
            )}
          </div>
        </div>

        {/* Statuses & Transitions Section */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 bg-gradient-to-r from-purple-50/50 to-white p-4 dark:border-gray-700 dark:from-purple-950/20 dark:to-gray-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
                <Layers className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Statuses & Transitions</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{statuses.length} statuses, {transitions.length} transitions</p>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Statuses */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Statuses</h3>
                <button
                  onClick={openCreateStatus}
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add status
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {statuses.length ? statuses.map((status) => (
                  <StatusBadge
                    key={status.id}
                    status={status}
                    onEdit={openEditStatus}
                    onDelete={requestDeleteStatus}
                  />
                )) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No statuses yet</p>
                )}
              </div>
            </div>

            {/* Transitions */}
            <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Transitions</h3>
                <button
                  onClick={openCreateTransition}
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add transition
                </button>
              </div>
              <div className="space-y-2">
                {transitions.length ? transitions.map((transition) => (
                  <TransitionCard
                    key={transition.id}
                    transition={transition}
                    onEdit={openEditTransition}
                    onDelete={requestDeleteTransition}
                    statuses={statuses}
                  />
                )) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No transitions yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={workflowOpen} onClose={resetWorkflowModal} title={editing.type === 'workflow' ? 'Edit Workflow' : 'Create Workflow'} size="md">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
            <Workflow className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {editing.type === 'workflow' ? 'Edit Workflow' : 'Create New Workflow'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {editing.type === 'workflow' ? 'Update workflow details' : 'Define a new process workflow'}
            </p>
          </div>
        </div>
        <form onSubmit={editing.type === 'workflow' ? handleSaveWorkflow : handleCreateWorkflow} className="space-y-4">
          <FormField label="Name" required>
            <input className="input bg-gray-50 dark:bg-gray-900/50" required value={workflowForm.name} onChange={(e) => setWorkflowForm({ ...workflowForm, name: e.target.value })} placeholder="e.g. Project Approval" />
          </FormField>
          <FormField label="Description">
            <textarea className="input bg-gray-50 dark:bg-gray-900/50" rows={3} value={workflowForm.description} onChange={(e) => setWorkflowForm({ ...workflowForm, description: e.target.value })} placeholder="Describe the workflow purpose" />
          </FormField>
          <FormField label="Initial Status" required>
            <select className="input bg-gray-50 dark:bg-gray-900/50" required value={workflowForm.initial_status} onChange={(e) => setWorkflowForm({ ...workflowForm, initial_status: e.target.value })}>
              <option value="">Select status</option>
              {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </FormField>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" checked={workflowForm.is_default} onChange={(e) => setWorkflowForm({ ...workflowForm, is_default: e.target.checked })} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700" />
            Default workflow
          </label>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <Button type="button" variant="secondary" onClick={resetWorkflowModal}>Cancel</Button>
            <Button type="submit" loading={saving}>{editing.type === 'workflow' ? 'Save Changes' : 'Create Workflow'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={statusOpen} onClose={resetStatusModal} title={editing.type === 'status' ? 'Edit Status' : 'Create Status'} size="md">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <Circle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {editing.type === 'status' ? 'Edit Status' : 'Create New Status'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {editing.type === 'status' ? 'Update status details' : 'Add a new workflow status'}
            </p>
          </div>
        </div>
        <form onSubmit={editing.type === 'status' ? handleSaveStatus : handleCreateStatus} className="space-y-4">
          <FormField label="Name" required>
            <input className="input bg-gray-50 dark:bg-gray-900/50" required value={statusForm.name} onChange={(e) => setStatusForm({ ...statusForm, name: e.target.value })} placeholder="e.g. In Review" />
          </FormField>
          <FormField label="Key" required>
            <input className="input bg-gray-50 dark:bg-gray-900/50 font-mono" required value={statusForm.key} onChange={(e) => setStatusForm({ ...statusForm, key: e.target.value })} placeholder="in_review" />
          </FormField>
          <FormField label="Description">
            <textarea className="input bg-gray-50 dark:bg-gray-900/50" rows={2} value={statusForm.description} onChange={(e) => setStatusForm({ ...statusForm, description: e.target.value })} placeholder="Describe this status" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Color">
              <input type="color" className="input h-10 p-1 bg-gray-50 dark:bg-gray-900/50" value={statusForm.color} onChange={(e) => setStatusForm({ ...statusForm, color: e.target.value })} />
            </FormField>
            <FormField label="Category">
              <select className="input bg-gray-50 dark:bg-gray-900/50" value={statusForm.category} onChange={(e) => setStatusForm({ ...statusForm, category: e.target.value })}>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </FormField>
          </div>
          <FormField label="Order">
            <input type="number" className="input bg-gray-50 dark:bg-gray-900/50" value={statusForm.order} onChange={(e) => setStatusForm({ ...statusForm, order: Number(e.target.value) })} />
          </FormField>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <Button type="button" variant="secondary" onClick={resetStatusModal}>Cancel</Button>
            <Button type="submit" loading={saving}>{editing.type === 'status' ? 'Save Changes' : 'Create Status'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={transitionOpen} onClose={resetTransitionModal} title={editing.type === 'transition' ? 'Edit Transition' : 'Create Transition'} size="md">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
            <GitBranch className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {editing.type === 'transition' ? 'Edit Transition' : 'Create New Transition'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {editing.type === 'transition' ? 'Update transition details' : 'Define allowed status movement'}
            </p>
          </div>
        </div>
        <form onSubmit={editing.type === 'transition' ? handleSaveTransition : handleCreateTransition} className="space-y-4">
          <FormField label="Name" required>
            <input className="input bg-gray-50 dark:bg-gray-900/50" required value={transitionForm.name} onChange={(e) => setTransitionForm({ ...transitionForm, name: e.target.value })} placeholder="e.g. Start Review" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="From Status" required>
              <select className="input bg-gray-50 dark:bg-gray-900/50" required value={transitionForm.from_status} onChange={(e) => setTransitionForm({ ...transitionForm, from_status: e.target.value })}>
                <option value="">Select</option>
                {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </FormField>
            <FormField label="To Status" required>
              <select className="input bg-gray-50 dark:bg-gray-900/50" required value={transitionForm.to_status} onChange={(e) => setTransitionForm({ ...transitionForm, to_status: e.target.value })}>
                <option value="">Select</option>
                {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </FormField>
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <Button type="button" variant="secondary" onClick={resetTransitionModal}>Cancel</Button>
            <Button type="submit" loading={saving}>{editing.type === 'transition' ? 'Save Changes' : 'Create Transition'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(confirmDelete.type)}
        title={getDeleteConfirmCopy().title}
        message={getDeleteConfirmCopy().message}
        confirmLabel={getDeleteConfirmCopy().label}
        loading={confirmDelete.loading}
        onConfirm={handleConfirmDelete}
        onClose={() => setConfirmDelete(emptyConfirm)}
      />
    </div>
  )
}

export default WorkflowAdmin