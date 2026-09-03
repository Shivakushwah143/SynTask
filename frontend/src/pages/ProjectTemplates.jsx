import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import { ClipboardCheck, Edit2, Eye, EyeOff, GripVertical, Plus, Sparkles, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/axios'
import { clientsAPI } from '../api/clients'
import { Badge, Button, EmptyState, FormField, Modal, PageHeader, SkeletonCard, inputClassName } from '../components/ui'

const DEFAULT_TASK_TEMPLATE = {
  ref_id: '',
  title: '',
  description: '',
  priority: 'medium',
  relative_start_day: 0,
  relative_due_day: 3,
  estimated_hours: null,
  review_required: true,
  required_for_project_completion: true,
  assignee_placeholder: '',
  reviewer_placeholder: '',
  depends_on_refs: [],
  checklist: [],
  tags: [],
}

// Collect all unique placeholders from template tasks
function collectPlaceholders(tasks) {
  const assigneePlaceholders = new Set()
  const reviewerPlaceholders = new Set()
  for (const t of tasks) {
    if (t.assignee_placeholder) assigneePlaceholders.add(t.assignee_placeholder)
    if (t.reviewer_placeholder) reviewerPlaceholders.add(t.reviewer_placeholder)
  }
  return { assigneePlaceholders: [...assigneePlaceholders], reviewerPlaceholders: [...reviewerPlaceholders] }
}

export default function ProjectTemplates() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [generatingTemplate, setGeneratingTemplate] = useState(null)

  const { data, isLoading, isError } = useQuery('project-templates', async () => (await api.get('/project-templates/')).data)
  const templates = data?.templates || []

  const handleCreate = useCallback(async (formData) => {
    try {
      await api.post('/project-templates/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Template created')
      queryClient.invalidateQueries('project-templates')
      setShowCreate(false)
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create template')
    }
  }, [queryClient])

  const handleUpdate = useCallback(async (templateId, formData) => {
    try {
      await api.put(`/project-templates/${templateId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Template updated')
      queryClient.invalidateQueries('project-templates')
      setShowEdit(false)
      setEditingTemplate(null)
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update template')
    }
  }, [queryClient])

  const handleToggleEnabled = useCallback(async (template) => {
    try {
      const formData = new FormData()
      formData.append('enabled', template.enabled ? 'false' : 'true')
      await api.put(`/project-templates/${template.id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success(template.enabled ? 'Template disabled' : 'Template enabled')
      queryClient.invalidateQueries('project-templates')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update template')
    }
  }, [queryClient])

  const handleGenerate = useCallback(async (templateId, projectData) => {
    try {
      const formData = new FormData()
      Object.keys(projectData).forEach(key => {
        if (projectData[key] !== null && projectData[key] !== undefined) {
          formData.append(key, projectData[key])
        }
      })
      const response = await api.post(`/project-templates/${templateId}/generate`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success(response.data?.message || 'Project created from template')
      setShowGenerate(false)
      setGeneratingTemplate(null)
      queryClient.invalidateQueries('project-templates')
      return response.data
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to generate project')
      return null
    }
  }, [queryClient])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Templates"
        description="Reusable project blueprints with task definitions."
        actions={(
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Create Template
          </Button>
        )}
      />
      {isLoading ? <SkeletonCard /> : isError ? (
        <EmptyState icon={ClipboardCheck} title="Could not load templates" description="The project templates could not be loaded." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <div key={template.id} className={`rounded-lg border bg-surface p-4 shadow-sm transition hover:shadow-md ${template.enabled ? 'border-surface-border' : 'border-surface-border opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold text-text-primary">{template.name}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-text-muted">{template.description || 'No description'}</p>
                </div>
                <Badge label={template.enabled ? 'Active' : 'Disabled'} colorKey={template.enabled ? 'completed' : 'cancelled'} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-muted">
                <span>{template.task_count} tasks</span>
                {template.project_type && <span>&bull; {template.project_type}</span>}
                {template.estimated_hours && <span>&bull; {template.estimated_hours}h est.</span>}
                {template.version > 1 && <span>&bull; v{template.version}</span>}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Button size="sm" variant="primary" onClick={() => { setGeneratingTemplate(template); setShowGenerate(true) }}>
                  <Sparkles className="h-3.5 w-3.5" /> Use Template
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { setEditingTemplate(template); setShowEdit(true) }}>
                  <Edit2 className="h-3.5 w-3.5" /> Edit
                </Button>
                <button
                  type="button"
                  onClick={() => handleToggleEnabled(template)}
                  className="rounded-md border border-surface-border p-1.5 text-text-muted hover:bg-surface-muted"
                  aria-label={template.enabled ? 'Disable template' : 'Enable template'}
                >
                  {template.enabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
          {!templates.length && (
            <div className="col-span-full">
              <EmptyState icon={ClipboardCheck} title="No project templates" description="Create your first template to standardize project setup." />
            </div>
          )}
        </div>
      )}

      {showCreate && <TemplateFormModal title="Create Template" onSubmit={handleCreate} onClose={() => setShowCreate(false)} />}
      {showEdit && editingTemplate && <TemplateFormModal title="Edit Template" template={editingTemplate} onSubmit={(fd) => handleUpdate(editingTemplate.id, fd)} onClose={() => { setShowEdit(false); setEditingTemplate(null) }} />}
      {showGenerate && generatingTemplate && <GenerateProjectModal template={generatingTemplate} onGenerate={handleGenerate} onClose={() => { setShowGenerate(false); setGeneratingTemplate(null) }} />}
    </div>
  )
}

// ── Template Task Editor ─────────────────────────────────────────────────

const OPTIONAL_TASK_FIELDS = [
  { key: 'relative_start_day', label: 'Start day (relative)', type: 'number' },
  { key: 'relative_due_day', label: 'Due day (relative)', type: 'number' },
  { key: 'estimated_hours', label: 'Est. hours', type: 'number' },
  { key: 'assignee_placeholder', label: 'Assignee placeholder', type: 'text', placeholder: 'e.g. developer' },
  { key: 'reviewer_placeholder', label: 'Reviewer placeholder', type: 'text', placeholder: 'e.g. reviewer' },
  { key: 'depends_on_refs', label: 'Dependencies (comma-separated ref_ids)', type: 'deps', placeholder: 'e.g. task_0, task_1' },
  { key: 'review_required', label: 'Review required', type: 'checkbox' },
  { key: 'required_for_project_completion', label: 'Required for completion', type: 'checkbox' },
  { key: 'checklist', label: 'Checklist', type: 'checklist' },
]

// Determine which optional fields a task already has non-default values for
function detectActiveFields(task) {
  const active = []
  for (const f of OPTIONAL_TASK_FIELDS) {
    const val = task[f.key]
    if (f.type === 'checkbox') {
      // Active if user explicitly set it to false (default is true)
      if (val === false) active.push(f.key)
    } else if (f.type === 'checklist') {
      if (Array.isArray(val) && val.length > 0) active.push(f.key)
    } else if (f.type === 'deps') {
      if (Array.isArray(val) && val.length > 0) active.push(f.key)
    } else if (f.type === 'number') {
      if (val != null && val !== 0 && val !== 3) active.push(f.key)
    } else {
      if (val) active.push(f.key)
    }
  }
  return active
}

function TemplateTaskEditor({ tasks, onChange }) {
  const [activeFieldsMap, setActiveFieldsMap] = useState(() => {
    const map = {}
    tasks.forEach((t, i) => { map[i] = new Set(detectActiveFields(t)) })
    return map
  })
  const [savedTasks, setSavedTasks] = useState(new Set())
  const [openMenuIdx, setOpenMenuIdx] = useState(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (openMenuIdx === null) return
    const handler = (e) => {
      if (!e.target.closest('[data-field-menu]')) setOpenMenuIdx(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenuIdx])

  const saveTask = (idx) => {
    const task = tasks[idx]
    if (!task.title?.trim()) { toast.error('Task title is required'); return }
    if (!task.ref_id?.trim()) { toast.error('Task ref ID is required'); return }
    setSavedTasks(prev => { const next = new Set(prev); next.add(idx); return next })
  }

  const editTask = (idx) => {
    setSavedTasks(prev => { const next = new Set(prev); next.delete(idx); return next })
  }

  const addTask = () => {
    const idx = tasks.length
    onChange([...tasks, { ...DEFAULT_TASK_TEMPLATE, ref_id: `task_${idx}` }])
    setActiveFieldsMap(prev => ({ ...prev, [idx]: new Set() }))
    // New task starts in editing mode
    setSavedTasks(prev => { const next = new Set(prev); return next })
  }

  const updateTask = (idx, field, value) => {
    const updated = [...tasks]
    updated[idx] = { ...updated[idx], [field]: value }
    onChange(updated)
  }

  const addField = (idx, fieldKey) => {
    setActiveFieldsMap(prev => {
      const next = { ...prev }
      const set = new Set(prev[idx] || [])
      set.add(fieldKey)
      next[idx] = set
      return next
    })
    setOpenMenuIdx(null)
  }

  const removeField = (idx, fieldKey) => {
    // Reset field to default value
    const defaults = { ...DEFAULT_TASK_TEMPLATE }
    updateTask(idx, fieldKey, defaults[fieldKey])
    setActiveFieldsMap(prev => {
      const next = { ...prev }
      const set = new Set(prev[idx] || [])
      set.delete(fieldKey)
      next[idx] = set
      return next
    })
  }

  const removeTask = (idx) => {
    const removed_ref = tasks[idx].ref_id
    const updated = tasks.filter((_, i) => i !== idx)
    updated.forEach(t => {
      t.depends_on_refs = (t.depends_on_refs || []).filter(r => r !== removed_ref)
    })
    onChange(updated)
    setActiveFieldsMap(prev => {
      const next = {}
      for (const [k, v] of Object.entries(prev)) {
        const ki = parseInt(k)
        if (ki < idx) next[ki] = v
        else if (ki > idx) next[ki - 1] = v
      }
      return next
    })
    setSavedTasks(prev => {
      const next = new Set()
      for (const i of prev) {
        if (i < idx) next.add(i)
        else if (i > idx) next.add(i - 1)
      }
      return next
    })
  }

  const renderOptionalField = (f, task, idx) => {
    if (f.type === 'checkbox') {
      return (
        <div key={f.key} className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={task[f.key] !== false} onChange={(e) => updateTask(idx, f.key, e.target.checked)} className="h-3.5 w-3.5 rounded" />
            {f.label}
          </label>
          <button type="button" onClick={() => removeField(idx, f.key)} className="text-[10px] text-red-400 hover:text-red-600">&times;</button>
        </div>
      )
    }
    if (f.type === 'deps') {
      return (
        <div key={f.key} className="flex items-center gap-2">
          <FormField label={f.label} className="flex-1">
            <input className={inputClassName} value={(task[f.key] || []).join(', ')} onChange={(e) => updateTask(idx, f.key, e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder={f.placeholder} />
          </FormField>
          <button type="button" onClick={() => removeField(idx, f.key)} className="text-[10px] text-red-400 hover:text-red-600 mt-5">&times;</button>
        </div>
      )
    }
    if (f.type === 'checklist') {
      return (
        <div key={f.key} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">Checklist ({(task.checklist || []).length} items)</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { const cl = [...(task.checklist || []), { text: '', required: false }]; updateTask(idx, 'checklist', cl) }} className="text-[10px] text-primary-600 hover:text-primary-700">+ Add item</button>
              <button type="button" onClick={() => removeField(idx, f.key)} className="text-[10px] text-red-400 hover:text-red-600">&times;</button>
            </div>
          </div>
          {(task.checklist || []).map((item, ci) => (
            <div key={ci} className="flex items-center gap-2">
              <input className={`${inputClassName} text-xs flex-1`} value={typeof item === 'string' ? item : item.text || ''} onChange={(e) => { const cl = [...(task.checklist || [])]; if (typeof cl[ci] === 'string') cl[ci] = e.target.value; else cl[ci] = { ...cl[ci], text: e.target.value }; updateTask(idx, 'checklist', cl) }} placeholder="Checklist item" />
              <label className="flex items-center gap-1 text-[10px] text-text-muted whitespace-nowrap">
                <input type="checkbox" checked={typeof item === 'object' && item.required} onChange={(e) => { const cl = [...(task.checklist || [])]; if (typeof cl[ci] === 'string') cl[ci] = { text: cl[ci], required: e.target.checked }; else cl[ci] = { ...cl[ci], required: e.target.checked }; updateTask(idx, 'checklist', cl) }} className="h-3 w-3 rounded" />
                Req.
              </label>
              <button type="button" onClick={() => { const cl = (task.checklist || []).filter((_, j) => j !== ci); updateTask(idx, 'checklist', cl) }} className="text-red-400 hover:text-red-600 text-xs">&times;</button>
            </div>
          ))}
        </div>
      )
    }
    // Default: text/number input
    return (
      <div key={f.key} className="flex items-center gap-2">
        <FormField label={f.label} className="flex-1">
          <input type={f.type} className={inputClassName} value={task[f.key] ?? ''} onChange={(e) => updateTask(idx, f.key, f.type === 'number' ? (e.target.value ? parseFloat(e.target.value) : null) : e.target.value)} placeholder={f.placeholder || ''} min={f.type === 'number' ? '0' : undefined} step={f.key === 'estimated_hours' ? '0.5' : undefined} />
        </FormField>
        <button type="button" onClick={() => removeField(idx, f.key)} className="text-[10px] text-red-400 hover:text-red-600 mt-5">&times;</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-text-primary">Task Definitions ({tasks.length})</label>
        <Button size="sm" variant="secondary" type="button" onClick={addTask}>
          <Plus className="h-3 w-3" /> Add Task
        </Button>
      </div>
      {tasks.map((task, idx) => {
        const isSaved = savedTasks.has(idx)
        const activeFields = activeFieldsMap[idx] || new Set()
        const availableFields = OPTIONAL_TASK_FIELDS.filter(f => !activeFields.has(f.key))

        // Collapsed summary for saved tasks
        if (isSaved) {
          return (
            <div key={idx} className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-900/20 p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <GripVertical className="h-4 w-4 text-text-muted flex-shrink-0" />
                <span className="text-xs font-medium text-text-muted flex-shrink-0">Task {idx + 1}</span>
                <span className="text-sm font-medium text-text-primary truncate">{task.title}</span>
                <span className="text-[10px] text-text-muted flex-shrink-0">ref: {task.ref_id}</span>
                <Badge label={task.priority} colorKey={task.priority === 'critical' ? 'cancelled' : task.priority === 'high' ? 'pending' : 'completed'} />
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button type="button" onClick={() => editTask(idx)} className="rounded p-1 text-text-muted hover:bg-surface-muted hover:text-text-primary">
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => removeTask(idx)} className="rounded p-1 text-red-500 hover:bg-red-50 hover:text-red-700">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        }

        // Full editor for unsaved tasks
        return (
          <div key={idx} className="rounded-lg border border-surface-border bg-surface-muted p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-text-muted" />
                <span className="text-xs font-medium text-text-muted">Task {idx + 1}</span>
                <span className="text-[10px] text-text-muted">ref: {task.ref_id}</span>
              </div>
              <button type="button" onClick={() => removeTask(idx)} className="text-red-500 hover:text-red-700">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {/* Core fields: always visible */}
            <div className="grid gap-2 sm:grid-cols-2">
              <FormField label="Title" required>
                <input className={inputClassName} value={task.title} onChange={(e) => updateTask(idx, 'title', e.target.value)} placeholder="Task title" />
              </FormField>
              <FormField label="Ref ID" required>
                <input className={inputClassName} value={task.ref_id} onChange={(e) => updateTask(idx, 'ref_id', e.target.value)} placeholder="task_0" />
              </FormField>
            </div>
            <FormField label="Description">
              <textarea className={inputClassName} rows={2} value={task.description || ''} onChange={(e) => updateTask(idx, 'description', e.target.value)} placeholder="Optional description" />
            </FormField>
            <div className="grid gap-2 sm:grid-cols-1">
              <FormField label="Priority">
                <select className={inputClassName} value={task.priority} onChange={(e) => updateTask(idx, 'priority', e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </FormField>
            </div>
            {/* Active optional fields */}
            {OPTIONAL_TASK_FIELDS.filter(f => activeFields.has(f.key)).map(f => (
              <div key={f.key} className="border-t border-surface-border pt-2">
                {renderOptionalField(f, task, idx)}
              </div>
            ))}
            {/* Add field button + dropdown */}
            {availableFields.length > 0 && (
              <div className="relative" data-field-menu>
                <button
                  type="button"
                  onClick={() => setOpenMenuIdx(openMenuIdx === idx ? null : idx)}
                  className="flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-700"
                >
                  <Plus className="h-3 w-3" /> Add field
                </button>
                {openMenuIdx === idx && (
                  <div className="absolute z-10 mt-1 w-56 rounded-md border border-surface-border bg-white shadow-lg dark:bg-gray-800">
                    {availableFields.map(f => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => addField(idx, f.key)}
                        className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-muted"
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Save Task button */}
            <div className="border-t border-surface-border pt-2 flex justify-end">
              <Button size="sm" type="button" onClick={() => saveTask(idx)}>
                Save Task
              </Button>
            </div>
          </div>
        )
      })}
      {tasks.length === 0 && (
        <p className="rounded-lg border border-dashed border-surface-border p-4 text-center text-xs text-text-muted">
          No task definitions. Click &quot;Add Task&quot; to define tasks for this template.
        </p>
      )}
    </div>
  )
}

// ── Template Form Modal ──────────────────────────────────────────────────

function TemplateFormModal({ title, template, onSubmit, onClose }) {
  const [name, setName] = useState(template?.name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [projectType, setProjectType] = useState(template?.project_type || '')
  const [priority, setPriority] = useState(template?.default_priority || 'medium')
  const [estimatedHours, setEstimatedHours] = useState(template?.estimated_hours || '')
  const [taskTemplates, setTaskTemplates] = useState(template?.task_templates || [])
  const [submitting, setSubmitting] = useState(false)

  // For edit mode, load existing template tasks from API
  useEffect(() => {
    if (template?.id) {
      api.get(`/project-templates/${template.id}`).then(res => {
        if (res.data?.task_templates) {
          setTaskTemplates(res.data.task_templates)
        }
      }).catch(() => { /* keep existing state */ })
    }
  }, [template?.id])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!name.trim()) { toast.error('Name is required'); return }
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('name', name.trim())
      formData.append('description', description)
      formData.append('project_type', projectType)
      formData.append('default_priority', priority)
      if (estimatedHours) formData.append('estimated_hours', String(estimatedHours))
      formData.append('task_templates_json', JSON.stringify(taskTemplates))
      await onSubmit(formData)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={title} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto">
        <FormField label="Template name" required>
          <input className={inputClassName} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website Redesign" />
        </FormField>
        <FormField label="Description">
          <textarea className={inputClassName} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this template is for" />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Project type">
            <input className={inputClassName} value={projectType} onChange={(e) => setProjectType(e.target.value)} placeholder="e.g. software" />
          </FormField>
          <FormField label="Default priority">
            <select className={inputClassName} value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </FormField>
          <FormField label="Estimated hours">
            <input type="number" className={inputClassName} value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} min="0" step="0.5" placeholder="Optional" />
          </FormField>
        </div>
        <TemplateTaskEditor tasks={taskTemplates} onChange={setTaskTemplates} />
        <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-white dark:bg-gray-900 border-t border-surface-border pt-3">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={submitting}>{template ? 'Save Changes' : 'Create Template'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Generate Project Modal ───────────────────────────────────────────────

function GenerateProjectModal({ template, onGenerate, onClose }) {
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [projectId, setProjectId] = useState('')
  const [leadId, setLeadId] = useState('')
  const [clientId, setClientId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [assigneeMap, setAssigneeMap] = useState({})
  const [reviewerMap, setReviewerMap] = useState({})

  const { data: clientsData } = useQuery('clients-list', async () => {
    const res = await clientsAPI.listClients({})
    return res.data?.clients || []
  })
  const clients = clientsData || []

  // Load template tasks to discover placeholders
  const { data: templateDetail } = useQuery(
    ['project-template-detail', template.id],
    async () => (await api.get(`/project-templates/${template.id}`)).data,
    { enabled: !!template.id }
  )
  const templateTasks = templateDetail?.task_templates || []
  const { assigneePlaceholders, reviewerPlaceholders } = collectPlaceholders(templateTasks)
  const hasUnresolvedPlaceholders =
    assigneePlaceholders.some(p => !assigneeMap[p]) ||
    reviewerPlaceholders.some(p => !reviewerMap[p])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!name.trim() || !key.trim() || !projectId.trim() || !leadId.trim() || !startDate) {
      toast.error('All required fields must be filled')
      return
    }
    if (hasUnresolvedPlaceholders) {
      toast.error('Please map all assignee and reviewer placeholders before generating.')
      return
    }
    setSubmitting(true)
    try {
      await onGenerate(template.id, {
        name: name.trim(),
        key: key.trim(),
        project_id: projectId.trim(),
        lead_id: leadId,
        client_id: clientId || '',
        start_date: startDate,
        delivery_date: deliveryDate || '',
        assignee_map_json: JSON.stringify(assigneeMap),
        reviewer_map_json: JSON.stringify(reviewerMap),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Create Project from "${template.name}"`} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto">
        <div className="rounded-lg border border-surface-border bg-surface-muted p-3 text-sm text-text-muted">
          This will create a project with {templateTasks.length} tasks based on the template.
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Project name" required>
            <input className={inputClassName} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website Redesign Phase 1" />
          </FormField>
          <FormField label="Project key" required>
            <input className={inputClassName} value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. WRD" />
          </FormField>
          <FormField label="Project ID" required>
            <input className={inputClassName} value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="e.g. PROJ-001" />
          </FormField>
          <FormField label="Owner user ID" required>
            <input className={inputClassName} value={leadId} onChange={(e) => setLeadId(e.target.value)} placeholder="User ID" />
          </FormField>
          <FormField label="Client (for client-facing projects)">
            <select className={inputClassName} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">No client (internal project)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name || c.company_name || c.id}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Start date" required>
            <input type="datetime-local" className={inputClassName} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FormField>
          <FormField label="Delivery date">
            <input type="datetime-local" className={inputClassName} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </FormField>
        </div>

        {/* Placeholder mapping */}
        {(assigneePlaceholders.length > 0 || reviewerPlaceholders.length > 0) && (
          <div className="rounded-lg border border-surface-border p-3 space-y-3">
            <p className="text-xs font-semibold text-text-primary">
              Map Template Placeholders to Users
              {hasUnresolvedPlaceholders && <span className="ml-2 text-red-500">(all required)</span>}
            </p>
            {assigneePlaceholders.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-text-muted uppercase mb-1">Assignee Placeholders</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {assigneePlaceholders.map(p => (
                    <FormField key={p} label={p} required>
                      <input
                        className={inputClassName}
                        value={assigneeMap[p] || ''}
                        onChange={(e) => setAssigneeMap({ ...assigneeMap, [p]: e.target.value })}
                        placeholder="User ID"
                      />
                    </FormField>
                  ))}
                </div>
              </div>
            )}
            {reviewerPlaceholders.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-text-muted uppercase mb-1">Reviewer Placeholders</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {reviewerPlaceholders.map(p => (
                    <FormField key={p} label={p} required>
                      <input
                        className={inputClassName}
                        value={reviewerMap[p] || ''}
                        onChange={(e) => setReviewerMap({ ...reviewerMap, [p]: e.target.value })}
                        placeholder="User ID"
                      />
                    </FormField>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-white dark:bg-gray-900 border-t border-surface-border pt-3">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={submitting} loadingText="Creating" disabled={hasUnresolvedPlaceholders && (assigneePlaceholders.length > 0 || reviewerPlaceholders.length > 0)}>
            <Sparkles className="h-4 w-4" /> Generate Project
          </Button>
        </div>
      </form>
    </Modal>
  )
}
