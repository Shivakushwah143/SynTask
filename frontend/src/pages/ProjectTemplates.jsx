import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import { ClipboardCheck, Edit2, Eye, EyeOff, Plus, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/axios'
import { Badge, Button, EmptyState, FormField, Modal, PageHeader, SkeletonCard, inputClassName } from '../components/ui'

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
                {template.project_type && <span>• {template.project_type}</span>}
                {template.estimated_hours && <span>• {template.estimated_hours}h est.</span>}
                {template.version > 1 && <span>• v{template.version}</span>}
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

function TemplateFormModal({ title, template, onSubmit, onClose }) {
  const [name, setName] = useState(template?.name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [projectType, setProjectType] = useState(template?.project_type || '')
  const [priority, setPriority] = useState(template?.default_priority || 'medium')
  const [estimatedHours, setEstimatedHours] = useState(template?.estimated_hours || '')
  const [submitting, setSubmitting] = useState(false)

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
      formData.append('task_templates_json', JSON.stringify(template?.task_templates || []))
      await onSubmit(formData)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Template name" required>
          <input className={inputClassName} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website Redesign" />
        </FormField>
        <FormField label="Description">
          <textarea className={inputClassName} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this template is for" />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
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
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={submitting}>{template ? 'Save Changes' : 'Create Template'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function GenerateProjectModal({ template, onGenerate, onClose }) {
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [projectId, setProjectId] = useState('')
  const [leadId, setLeadId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!name.trim() || !key.trim() || !projectId.trim() || !leadId.trim() || !startDate) {
      toast.error('All required fields must be filled')
      return
    }
    setSubmitting(true)
    try {
      await onGenerate(template.id, {
        name: name.trim(),
        key: key.trim(),
        project_id: projectId.trim(),
        lead_id: leadId,
        start_date: startDate,
        delivery_date: deliveryDate || '',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Create Project from "${template.name}"`} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-surface-border bg-surface-muted p-3 text-sm text-text-muted">
          This will create a project with {template.task_count} tasks based on the template.
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
          <FormField label="Start date" required>
            <input type="datetime-local" className={inputClassName} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FormField>
          <FormField label="Delivery date">
            <input type="datetime-local" className={inputClassName} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </FormField>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={submitting} loadingText="Creating"><Sparkles className="h-4 w-4" /> Generate Project</Button>
        </div>
      </form>
    </Modal>
  )
}
