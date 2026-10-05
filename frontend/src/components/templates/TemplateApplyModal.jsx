import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, Edit2, Info, Plus, Sparkles, Trash2, Zap, FileText, Layout } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../api/axios'
import { Badge, Button, EmptyState, FormField, Modal, SkeletonCard, inputClassName } from '../ui'
import { useQuery } from 'react-query'

// ── Color schemes for template cards ────────────────────────────────────
const TEMPLATE_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'bg-blue-100 text-blue-600', badge: 'bg-blue-100 text-blue-700', dark: 'dark:bg-blue-950/30 dark:border-blue-800' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'bg-emerald-100 text-emerald-600', badge: 'bg-emerald-100 text-emerald-700', dark: 'dark:bg-emerald-950/30 dark:border-emerald-800' },
  { bg: 'bg-violet-50', border: 'border-violet-200', icon: 'bg-violet-100 text-violet-600', badge: 'bg-violet-100 text-violet-700', dark: 'dark:bg-violet-950/30 dark:border-violet-800' },
  { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'bg-amber-100 text-amber-600', badge: 'bg-amber-100 text-amber-700', dark: 'dark:bg-amber-950/30 dark:border-amber-800' },
  { bg: 'bg-rose-50', border: 'border-rose-200', icon: 'bg-rose-100 text-rose-600', badge: 'bg-rose-100 text-rose-700', dark: 'dark:bg-rose-950/30 dark:border-rose-800' },
  { bg: 'bg-cyan-50', border: 'border-cyan-200', icon: 'bg-cyan-100 text-cyan-600', badge: 'bg-cyan-100 text-cyan-700', dark: 'dark:bg-cyan-950/30 dark:border-cyan-800' },
]

const TYPE_ICONS = {
  software: Layout,
  marketing: Zap,
  default: FileText,
}

// ── Views ─────────────────────────────────────────────────────────────
const VIEW_BROWSE = 'browse'
const VIEW_PREVIEW = 'preview'
const VIEW_CUSTOMIZE = 'customize'

// ── Main Modal ─────────────────────────────────────────────────────────
export default function TemplateApplyModal({ isOpen, onClose, projectId, projectName, projectStartDate, onApplied }) {
  const [view, setView] = useState(VIEW_BROWSE)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [customizedTasks, setCustomizedTasks] = useState([])
  const [assigneeMap, setAssigneeMap] = useState({})
  const [reviewerMap, setReviewerMap] = useState({})
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState(null)

  const { data: templatesData, isLoading: loadingTemplates } = useQuery(
    'project-templates-list',
    async () => (await api.get('/project-templates/')).data,
    { enabled: isOpen }
  )
  const templates = templatesData?.templates || []

  const { data: templateDetail, isLoading: loadingTasks } = useQuery(
    ['project-template-detail', selectedTemplate?.id],
    async () => (await api.get(`/project-templates/${selectedTemplate.id}`)).data,
    { enabled: isOpen && !!selectedTemplate?.id }
  )

  useEffect(() => {
    if (templateDetail?.task_templates) {
      setCustomizedTasks(templateDetail.task_templates.map(t => ({ ...t })))
    }
  }, [templateDetail])

  const { assigneePlaceholders, reviewerPlaceholders } = useMemo(() => {
    const ap = new Set(), rp = new Set()
    for (const t of customizedTasks) {
      if (t.assignee_placeholder) ap.add(t.assignee_placeholder)
      if (t.reviewer_placeholder) rp.add(t.reviewer_placeholder)
    }
    return { assigneePlaceholders: [...ap], reviewerPlaceholders: [...rp] }
  }, [customizedTasks])

  const reset = useCallback(() => {
    setView(VIEW_BROWSE); setSelectedTemplate(null); setCustomizedTasks([])
    setAssigneeMap({}); setReviewerMap({}); setResult(null)
  }, [])

  const handleClose = useCallback(() => { reset(); onClose() }, [reset, onClose])

  const handleSelectTemplate = useCallback((template) => {
    setSelectedTemplate(template); setView(VIEW_PREVIEW)
  }, [])

  const handleApply = useCallback(async (tasksToApply) => {
    if (!selectedTemplate || !projectId) return
    setApplying(true)
    try {
      const fd = new FormData()
      fd.append('template_id', selectedTemplate.id)
      fd.append('customized_tasks_json', JSON.stringify(tasksToApply || customizedTasks))
      fd.append('assignee_map_json', JSON.stringify(assigneeMap))
      fd.append('reviewer_map_json', JSON.stringify(reviewerMap))
      fd.append('application_id', `app_${projectId}_${selectedTemplate.id}_${Date.now()}`)
      if (projectStartDate) fd.append('start_date', projectStartDate)
      const res = await api.post(`/project-templates/apply/${projectId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setResult(res.data)
      toast.success(res.data?.message || 'Template applied successfully')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to apply template')
    } finally {
      setApplying(false)
    }
  }, [selectedTemplate, projectId, customizedTasks, assigneeMap, reviewerMap, projectStartDate])

  // Success state
  if (result) {
    return (
      <Modal isOpen={isOpen} onClose={() => { onApplied?.(); handleClose() }} title="Template Applied" size="lg">
        <div className="space-y-5 py-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-500 shadow-lg shadow-green-500/25">
            <Check className="h-7 w-7 text-white" strokeWidth={3} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-text-primary">Template Applied Successfully</h3>
            <p className="mt-1 text-sm text-text-muted">Your project now has a complete execution plan.</p>
          </div>
          <div className="mx-auto max-w-sm rounded-xl border border-surface-border bg-surface p-4 text-sm text-left space-y-2">
            <div className="flex justify-between"><span className="text-text-muted">Template</span><span className="font-medium text-text-primary">{result.template_name} v{result.template_version}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Tasks Created</span><span className="font-semibold text-emerald-600">{result.tasks_created}</span></div>
            {result.tasks_skipped > 0 && <div className="flex justify-between"><span className="text-text-muted">Skipped</span><span className="font-medium text-amber-600">{result.tasks_skipped}</span></div>}
          </div>
          <Button size="lg" onClick={() => { onApplied?.(); handleClose() }}>Go to Project</Button>
        </div>
      </Modal>
    )
  }

  const modalTitle = view === VIEW_BROWSE ? 'Use a Project Template' : view === VIEW_PREVIEW ? selectedTemplate?.name : 'Customize Plan'

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={modalTitle} size="xl">
      <div className="max-h-[75vh] overflow-y-auto">
        {view === VIEW_BROWSE && <BrowseView templates={templates} loading={loadingTemplates} onSelect={handleSelectTemplate} />}
        {view === VIEW_PREVIEW && templateDetail && (
          <PreviewView template={selectedTemplate} tasks={customizedTasks} loading={loadingTasks}
            onBack={() => { setSelectedTemplate(null); setView(VIEW_BROWSE) }}
            onCustomize={() => setView(VIEW_CUSTOMIZE)}
            onApply={() => handleApply(customizedTasks)} applying={applying} />
        )}
        {view === VIEW_CUSTOMIZE && (
          <CustomizeView tasks={customizedTasks} onChange={setCustomizedTasks}
            onBack={() => setView(VIEW_PREVIEW)} onApply={() => handleApply(customizedTasks)} applying={applying} />
        )}
      </div>
    </Modal>
  )
}

// ── Browse: purpose + color-coded template cards ────────────────────────
function BrowseView({ templates, loading, onSelect }) {
  if (loading) return <SkeletonCard />

  const enabled = templates.filter(t => t.enabled)

  return (
    <div className="space-y-5">
      {/* Purpose card */}
      <div className="rounded-xl border border-primary-200 bg-gradient-to-r from-primary-50 to-indigo-50 p-4 dark:from-primary-950/40 dark:to-indigo-950/30 dark:border-primary-800">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100 text-primary-600 dark:bg-primary-900/50 dark:text-primary-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-primary-900 dark:text-primary-100">Project Templates</h3>
            <p className="mt-1 text-xs leading-5 text-primary-700/80 dark:text-primary-300/70">
              Templates are reusable blueprints that help you quickly generate a complete execution plan.
              They can include tasks, checklists, dependencies, priorities, deadlines, and team roles.
              You can customize any template for this project — the original stays unchanged.
            </p>
          </div>
        </div>
      </div>

      {/* Section heading */}
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">Available Templates</h4>
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-text-muted">{enabled.length}</span>
      </div>

      {!enabled.length ? (
        <EmptyState icon={Sparkles} title="No templates available" description="Create a project template first to use this feature." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {enabled.map((template, idx) => {
            const color = TEMPLATE_COLORS[idx % TEMPLATE_COLORS.length]
            const TypeIcon = TYPE_ICONS[template.project_type] || TYPE_ICONS.default
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => onSelect(template)}
                className={`group rounded-xl border-2 p-4 text-left transition-all hover:shadow-lg hover:scale-[1.01] ${color.border} ${color.bg} ${color.dark}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color.icon} flex-shrink-0`}>
                    <TypeIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-text-primary group-hover:text-primary-600 truncate">{template.name}</h3>
                    <p className="mt-0.5 line-clamp-2 text-xs text-text-muted leading-4">{template.description || 'No description'}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${color.badge}`}>{template.task_count} tasks</span>
                  {template.project_type && <span className="rounded-md bg-white/60 px-2 py-0.5 text-[10px] font-medium text-text-muted dark:bg-black/20">{template.project_type}</span>}
                  {template.estimated_hours && <span className="rounded-md bg-white/60 px-2 py-0.5 text-[10px] font-medium text-text-muted dark:bg-black/20">{template.estimated_hours}h</span>}
                  {template.version > 1 && <span className="rounded-md bg-white/60 px-2 py-0.5 text-[10px] font-medium text-text-muted dark:bg-black/20">v{template.version}</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Preview: summary header + task list + actions ──────────────────────
function PreviewView({ template, tasks, loading, onBack, onCustomize, onApply, applying }) {
  const totalChecklist = tasks.reduce((sum, t) => sum + (t.checklist?.length || 0), 0)
  const totalDeps = tasks.reduce((sum, t) => sum + (t.depends_on_refs?.length || 0), 0)
  const totalHours = tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0)
  const uniquePlaceholders = useMemo(() => {
    const s = new Set()
    tasks.forEach(t => { if (t.assignee_placeholder) s.add(t.assignee_placeholder); if (t.reviewer_placeholder) s.add(t.reviewer_placeholder) })
    return s.size
  }, [tasks])

  if (loading) return <SkeletonCard />

  return (
    <div className="space-y-4">
      {/* Template header with gradient */}
      <div className="rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 p-4 text-white shadow-md">
        <h3 className="text-base font-bold">{template.name}</h3>
        {template.description && <p className="mt-1 text-xs text-white/80 leading-4">{template.description}</p>}
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-medium text-white/90">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-white/60" /> {tasks.length} Tasks</span>
          {totalChecklist > 0 && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-white/60" /> {totalChecklist} Checklist</span>}
          {totalDeps > 0 && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-white/60" /> {totalDeps} Dependencies</span>}
          {totalHours > 0 && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-white/60" /> {totalHours}h Est.</span>}
          {uniquePlaceholders > 0 && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-white/60" /> {uniquePlaceholders} Roles</span>}
        </div>
      </div>

      {/* Task list */}
      <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
        {tasks.map((task, idx) => (
          <div key={task.ref_id || idx} className="group rounded-lg border border-surface-border bg-surface p-3 transition hover:border-primary-200 hover:shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-muted text-[10px] font-bold text-text-muted">{idx + 1}</span>
              <span className="text-sm font-semibold text-text-primary flex-1">{task.title}</span>
              <Badge label={task.priority} colorKey={task.priority === 'critical' ? 'cancelled' : task.priority === 'high' ? 'pending' : 'completed'} />
            </div>
            {task.description && <p className="mt-1 pl-8 text-xs text-text-muted leading-4">{task.description}</p>}
            <div className="mt-1.5 flex flex-wrap gap-1.5 pl-8">
              {task.assignee_placeholder && <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">👤 {task.assignee_placeholder}</span>}
              {task.reviewer_placeholder && <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">🔍 {task.reviewer_placeholder}</span>}
              {task.depends_on_refs?.length > 0 && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">🔗 {task.depends_on_refs.join(', ')}</span>}
              {task.estimated_hours && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">⏱ {task.estimated_hours}h</span>}
              {task.checklist?.length > 0 && <span className="rounded-md bg-cyan-50 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">☑ {task.checklist.length}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between pt-3 border-t border-surface-border">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-text-muted hover:text-text-primary">
          <ChevronLeft className="h-4 w-4" /> Choose Another
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onCustomize} className="border-dashed">
            <Edit2 className="h-3.5 w-3.5" /> Customize
          </Button>
          <Button size="sm" onClick={onApply} loading={applying} loadingText="Applying..." className="bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 shadow-md shadow-primary-500/20">
            <Sparkles className="h-3.5 w-3.5" /> Apply Template
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Customize: compact task cards, expand to edit, add task shows full form ──
function CustomizeView({ tasks, onChange, onBack, onApply, applying }) {
  const [expandedTasks, setExpandedTasks] = useState(new Set())
  const [newTask, setNewTask] = useState(null) // temp task being created

  const toggleExpand = (idx) => {
    setExpandedTasks(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  const updateTask = (idx, field, value) => {
    const updated = [...tasks]
    updated[idx] = { ...updated[idx], [field]: value }
    onChange(updated)
  }

  const removeTask = (idx) => {
    const removedRef = tasks[idx].ref_id
    const updated = tasks.filter((_, i) => i !== idx)
    updated.forEach(t => { t.depends_on_refs = (t.depends_on_refs || []).filter(r => r !== removedRef) })
    onChange(updated)
    setExpandedTasks(prev => {
      const next = new Set()
      for (const i of prev) { if (i < idx) next.add(i); else if (i > idx) next.add(i - 1) }
      return next
    })
  }

  const startAddTask = () => {
    setNewTask({
      ref_id: `custom_${Date.now()}`, title: '', description: '', priority: 'medium',
      relative_start_day: 0, relative_due_day: 3, estimated_hours: null,
      review_required: true, assignee_placeholder: '', reviewer_placeholder: '',
      depends_on_refs: [], tags: [], required_for_project_completion: true, checklist: [],
    })
  }

  const saveNewTask = () => {
    if (!newTask) return
    if (!newTask.title?.trim()) { toast.error('Task title is required'); return }
    onChange([...tasks, newTask])
    setNewTask(null)
  }

  const cancelNewTask = () => setNewTask(null)

  const updateNewTask = (field, value) => {
    setNewTask(prev => prev ? { ...prev, [field]: value } : null)
  }

  const addNewTaskChecklistItem = () => {
    setNewTask(prev => prev ? { ...prev, checklist: [...(prev.checklist || []), { text: '', required: false }] } : null)
  }

  const addChecklistItem = (taskIdx) => {
    const updated = [...tasks]
    updated[taskIdx] = { ...updated[taskIdx], checklist: [...(updated[taskIdx].checklist || []), { text: '', required: false }] }
    onChange(updated)
  }

  return (
    <div className="space-y-3">
      {/* Customize header */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
        <div className="flex items-start gap-2">
          <Edit2 className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-bold text-amber-800 dark:text-amber-200">Customizing for this project</p>
            <p className="text-[11px] text-amber-600/80 dark:text-amber-400/70">Click a task to expand and edit details. Changes only affect this project.</p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
        {tasks.map((task, idx) => {
          const isExpanded = expandedTasks.has(idx)
          return (
            <div key={task.ref_id || idx} className={`rounded-lg border transition-all ${isExpanded ? 'border-primary-200 bg-surface shadow-sm' : 'border-surface-border bg-surface hover:border-primary-200'}`}>
              {/* Compact row: always visible */}
              <div className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none" onClick={() => toggleExpand(idx)}>
                <span className="flex h-5 w-5 items-center justify-center rounded bg-surface-muted text-[10px] font-bold text-text-muted flex-shrink-0">{idx + 1}</span>
                <input
                  className="flex-1 bg-transparent text-sm font-medium text-text-primary border-none outline-none p-0 placeholder:text-text-muted focus:ring-0"
                  value={task.title}
                  onChange={(e) => { e.stopPropagation(); updateTask(idx, 'title', e.target.value) }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Task title"
                />
                <Badge label={task.priority} colorKey={task.priority === 'critical' ? 'cancelled' : task.priority === 'high' ? 'pending' : 'completed'} />
                <button onClick={(e) => { e.stopPropagation(); removeTask(idx) }} className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 flex-shrink-0" title="Remove task">
                  <Trash2 className="h-3 w-3" />
                </button>
                <span className={`text-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
              </div>

              {/* Expanded: all detail fields */}
              {isExpanded && (
                <div className="border-t border-surface-border px-3 py-2.5 space-y-2">
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    <FormField label="Description">
                      <textarea className={inputClassName} rows={2} value={task.description || ''} onChange={(e) => updateTask(idx, 'description', e.target.value)} placeholder="Optional description" />
                    </FormField>
                    <FormField label="Priority">
                      <select className={inputClassName} value={task.priority} onChange={(e) => updateTask(idx, 'priority', e.target.value)}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </FormField>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-3">
                    <FormField label="Start day">
                      <input type="number" className={inputClassName} value={task.relative_start_day ?? 0} onChange={(e) => updateTask(idx, 'relative_start_day', parseInt(e.target.value) || 0)} />
                    </FormField>
                    <FormField label="Due day">
                      <input type="number" className={inputClassName} value={task.relative_due_day ?? 3} onChange={(e) => updateTask(idx, 'relative_due_day', parseInt(e.target.value) || 3)} />
                    </FormField>
                    <FormField label="Est. hours">
                      <input type="number" className={inputClassName} value={task.estimated_hours || ''} onChange={(e) => updateTask(idx, 'estimated_hours', e.target.value ? parseFloat(e.target.value) : null)} step="0.5" />
                    </FormField>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    <FormField label="Assignee placeholder">
                      <input className={inputClassName} value={task.assignee_placeholder || ''} onChange={(e) => updateTask(idx, 'assignee_placeholder', e.target.value)} placeholder="e.g. developer" />
                    </FormField>
                    <FormField label="Reviewer placeholder">
                      <input className={inputClassName} value={task.reviewer_placeholder || ''} onChange={(e) => updateTask(idx, 'reviewer_placeholder', e.target.value)} placeholder="e.g. reviewer" />
                    </FormField>
                  </div>
                  {/* Checklist */}
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-text-muted">Checklist ({(task.checklist || []).length})</span>
                      <button type="button" onClick={() => addChecklistItem(idx)} className="text-[10px] text-primary-600 hover:text-primary-700 font-medium">+ Add item</button>
                    </div>
                    {(task.checklist || []).map((item, ci) => (
                      <div key={ci} className="flex items-center gap-1">
                        <input className={`${inputClassName} text-[11px] flex-1`} value={typeof item === 'string' ? item : item.text || ''} onChange={(e) => {
                          const cl = [...(task.checklist || [])]
                          if (typeof cl[ci] === 'string') cl[ci] = e.target.value
                          else cl[ci] = { ...cl[ci], text: e.target.value }
                          updateTask(idx, 'checklist', cl)
                        }} placeholder="Checklist item" />
                        <button type="button" onClick={() => updateTask(idx, 'checklist', (task.checklist || []).filter((_, j) => j !== ci))} className="text-red-400 text-xs px-1">&times;</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* New task form (only when adding) */}
      {newTask && (
        <div className="rounded-lg border-2 border-dashed border-primary-300 bg-primary-50/30 p-3 space-y-2 dark:border-primary-700 dark:bg-primary-950/20">
          <div className="flex items-center gap-2 text-xs font-bold text-primary-700 dark:text-primary-300">
            <Plus className="h-3.5 w-3.5" /> New Task
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <FormField label="Title" required>
              <input className={inputClassName} value={newTask.title} onChange={(e) => updateNewTask('title', e.target.value)} placeholder="Task title" autoFocus />
            </FormField>
            <FormField label="Priority">
              <select className={inputClassName} value={newTask.priority} onChange={(e) => updateNewTask('priority', e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </FormField>
          </div>
          <FormField label="Description">
            <textarea className={inputClassName} rows={2} value={newTask.description || ''} onChange={(e) => updateNewTask('description', e.target.value)} placeholder="Optional description" />
          </FormField>
          <div className="grid gap-1.5 sm:grid-cols-3">
            <FormField label="Start day">
              <input type="number" className={inputClassName} value={newTask.relative_start_day ?? 0} onChange={(e) => updateNewTask('relative_start_day', parseInt(e.target.value) || 0)} />
            </FormField>
            <FormField label="Due day">
              <input type="number" className={inputClassName} value={newTask.relative_due_day ?? 3} onChange={(e) => updateNewTask('relative_due_day', parseInt(e.target.value) || 3)} />
            </FormField>
            <FormField label="Est. hours">
              <input type="number" className={inputClassName} value={newTask.estimated_hours || ''} onChange={(e) => updateNewTask('estimated_hours', e.target.value ? parseFloat(e.target.value) : null)} step="0.5" />
            </FormField>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <FormField label="Assignee placeholder">
              <input className={inputClassName} value={newTask.assignee_placeholder || ''} onChange={(e) => updateNewTask('assignee_placeholder', e.target.value)} placeholder="e.g. developer" />
            </FormField>
            <FormField label="Reviewer placeholder">
              <input className={inputClassName} value={newTask.reviewer_placeholder || ''} onChange={(e) => updateNewTask('reviewer_placeholder', e.target.value)} placeholder="e.g. reviewer" />
            </FormField>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-text-muted">Checklist ({(newTask.checklist || []).length})</span>
              <button type="button" onClick={addNewTaskChecklistItem} className="text-[10px] text-primary-600 hover:text-primary-700 font-medium">+ Add item</button>
            </div>
            {(newTask.checklist || []).map((item, ci) => (
              <div key={ci} className="flex items-center gap-1">
                <input className={`${inputClassName} text-[11px] flex-1`} value={typeof item === 'string' ? item : item.text || ''} onChange={(e) => {
                  const cl = [...(newTask.checklist || [])]
                  if (typeof cl[ci] === 'string') cl[ci] = e.target.value
                  else cl[ci] = { ...cl[ci], text: e.target.value }
                  updateNewTask('checklist', cl)
                }} placeholder="Checklist item" />
                <button type="button" onClick={() => updateNewTask('checklist', (newTask.checklist || []).filter((_, j) => j !== ci))} className="text-red-400 text-xs px-1">&times;</button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={saveNewTask} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Check className="h-3 w-3" /> Save Task
            </Button>
            <Button size="sm" variant="secondary" onClick={cancelNewTask}>Cancel</Button>
          </div>
        </div>
      )}

      {!newTask && (
        <Button size="sm" variant="secondary" onClick={startAddTask} className="border-dashed border-2">
          <Plus className="h-3 w-3" /> Add Task
        </Button>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-surface-border">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-text-muted hover:text-text-primary">
          <ChevronLeft className="h-4 w-4" /> Back to Preview
        </Button>
        <Button size="sm" onClick={onApply} loading={applying} loadingText="Applying..." className="bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 shadow-md shadow-primary-500/20">
          <Sparkles className="h-3.5 w-3.5" /> Apply Template
        </Button>
      </div>
    </div>
  )
}
