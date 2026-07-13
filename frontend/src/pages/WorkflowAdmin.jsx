import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { workflowsApi } from '../api/workflows'
import { useAuthStore } from '../store/authStore'
import { hasCompanyAdminAccess } from '../utils/roles'
import { PageHeader, Button, Modal, FormField, EmptyState, Badge, ConfirmDialog } from '../components/ui'

const defaultWorkflowForm = { name: '', description: '', initial_status: 'todo', is_default: false }
const defaultStatusForm = { name: '', key: '', description: '', color: '#0052CC', category: 'todo', order: 0 }
const defaultTransitionForm = { name: '', from_status: '', to_status: '' }
const emptyEditing = { type: '', id: null }
const emptyConfirm = { type: '', item: null, loading: false }

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
    <div className="space-y-6 p-6">
      <PageHeader
        title="Workflow Admin"
        description="Manage statuses, transitions, and workflow definitions for your company."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={openCreateStatus}>New status</Button>
            <Button variant="secondary" onClick={openCreateTransition}>New transition</Button>
            <Button onClick={openCreateWorkflow}>New workflow</Button>
          </div>
        )}
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Workflows</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">{workflows.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Statuses</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">{statuses.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Transitions</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">{transitions.length}</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-900">Workflow definitions</h2>
          <div className="mt-4 space-y-3">
            {loading ? <p className="text-sm text-gray-500">Loading...</p> : workflows.length ? workflows.map((workflow) => (
              <div key={workflow.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{workflow.name}</p>
                    <p className="text-sm text-gray-500">{workflow.description || 'No description'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {workflow.is_default ? <Badge label="Default" colorKey="scheduled" /> : null}
                    <Badge label={workflow.is_active ? 'Active' : 'Inactive'} colorKey={workflow.is_active ? 'scheduled' : 'secondary'} />
                    <Button variant="secondary" size="sm" onClick={() => openEditWorkflow(workflow)}>Edit</Button>
                    <Button variant="secondary" size="sm" onClick={() => toggleWorkflow(workflow.id)}>
                      {workflow.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => requestDeleteWorkflow(workflow)}>Delete</Button>
                  </div>
                </div>
                <div className="mt-3 text-xs text-gray-500">
                  Initial status: {workflow.initial_status || 'none'}
                </div>
              </div>
            )) : <EmptyState title="No workflows" description="Create the first workflow to define your process." />}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-base font-semibold text-gray-900">Statuses and transitions</h2>
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Statuses</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {statuses.length ? statuses.map((status) => (
                  <div key={status.id} className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1">
                    <Badge label={status.name} colorKey={status.category || 'scheduled'} />
                    <Button type="button" variant="ghost" size="sm" className="min-h-8 px-2 text-xs" onClick={() => openEditStatus(status)}>Edit</Button>
                    <Button type="button" variant="danger" size="sm" className="min-h-8 px-2 text-xs" onClick={() => requestDeleteStatus(status)}>Delete</Button>
                  </div>
                )) : <p className="text-sm text-gray-500">No statuses yet</p>}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Transitions</h3>
              <div className="mt-2 space-y-2">
                {transitions.length ? transitions.map((transition) => (
                  <div key={transition.id} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600">
                    <div className="flex items-center justify-between gap-2">
                      <span>{transition.name}: {transition.from_status} → {transition.to_status}</span>
                      <div className="flex gap-2">
                        <Button type="button" variant="ghost" size="sm" className="min-h-8 px-2 text-xs" onClick={() => openEditTransition(transition)}>Edit</Button>
                        <Button type="button" variant="danger" size="sm" className="min-h-8 px-2 text-xs" onClick={() => requestDeleteTransition(transition)}>Delete</Button>
                      </div>
                    </div>
                  </div>
                )) : <p className="text-sm text-gray-500">No transitions yet</p>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Modal isOpen={workflowOpen} onClose={resetWorkflowModal} title={editing.type === 'workflow' ? 'Edit workflow' : 'Create workflow'}>
        <form onSubmit={editing.type === 'workflow' ? handleSaveWorkflow : handleCreateWorkflow} className="space-y-4">
          <FormField label="Name" required>
            <input className="input" required value={workflowForm.name} onChange={(e) => setWorkflowForm({ ...workflowForm, name: e.target.value })} />
          </FormField>
          <FormField label="Description">
            <textarea className="input" rows={3} value={workflowForm.description} onChange={(e) => setWorkflowForm({ ...workflowForm, description: e.target.value })} />
          </FormField>
          <FormField label="Initial status" required>
            <select className="input" required value={workflowForm.initial_status} onChange={(e) => setWorkflowForm({ ...workflowForm, initial_status: e.target.value })}>
              <option value="">Select status</option>
              {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </FormField>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={workflowForm.is_default} onChange={(e) => setWorkflowForm({ ...workflowForm, is_default: e.target.checked })} />
            Default workflow
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={resetWorkflowModal}>Cancel</Button>
            <Button type="submit" loading={saving}>{editing.type === 'workflow' ? 'Save' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={statusOpen} onClose={resetStatusModal} title={editing.type === 'status' ? 'Edit status' : 'Create status'}>
        <form onSubmit={editing.type === 'status' ? handleSaveStatus : handleCreateStatus} className="space-y-4">
          <FormField label="Name" required><input className="input" required value={statusForm.name} onChange={(e) => setStatusForm({ ...statusForm, name: e.target.value })} /></FormField>
          <FormField label="Key" required><input className="input" required value={statusForm.key} onChange={(e) => setStatusForm({ ...statusForm, key: e.target.value })} /></FormField>
          <FormField label="Description"><textarea className="input" rows={3} value={statusForm.description} onChange={(e) => setStatusForm({ ...statusForm, description: e.target.value })} /></FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Color"><input className="input" value={statusForm.color} onChange={(e) => setStatusForm({ ...statusForm, color: e.target.value })} /></FormField>
            <FormField label="Category">
              <select className="input" value={statusForm.category} onChange={(e) => setStatusForm({ ...statusForm, category: e.target.value })}>
                <option value="todo">Todo</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </FormField>
          </div>
          <FormField label="Order">
            <input type="number" className="input" value={statusForm.order} onChange={(e) => setStatusForm({ ...statusForm, order: Number(e.target.value) })} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={resetStatusModal}>Cancel</Button>
            <Button type="submit" loading={saving}>{editing.type === 'status' ? 'Save' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={transitionOpen} onClose={resetTransitionModal} title={editing.type === 'transition' ? 'Edit transition' : 'Create transition'}>
        <form onSubmit={editing.type === 'transition' ? handleSaveTransition : handleCreateTransition} className="space-y-4">
          <FormField label="Name" required><input className="input" required value={transitionForm.name} onChange={(e) => setTransitionForm({ ...transitionForm, name: e.target.value })} /></FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="From status" required>
              <select className="input" required value={transitionForm.from_status} onChange={(e) => setTransitionForm({ ...transitionForm, from_status: e.target.value })}>
                <option value="">Select</option>
                {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </FormField>
            <FormField label="To status" required>
              <select className="input" required value={transitionForm.to_status} onChange={(e) => setTransitionForm({ ...transitionForm, to_status: e.target.value })}>
                <option value="">Select</option>
                {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </FormField>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={resetTransitionModal}>Cancel</Button>
            <Button type="submit" loading={saving}>{editing.type === 'transition' ? 'Save' : 'Create'}</Button>
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
