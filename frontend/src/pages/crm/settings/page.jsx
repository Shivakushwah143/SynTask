import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import {
  ArrowDown,
  ArrowUp,
  Layers3,
  ListChecks,
  Settings,
  Target,
  Trash2,
  Users2,
} from 'lucide-react'
import { salesApi } from '../../../api/sales'
import { CRMEmptyState, CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'
import { Badge, Button, FormField, inputClassName, Modal } from '../../../components/ui'
import { useConfirmation } from '../../../hooks/useConfirmation'
import { asArray } from '../../phase4Utils'

const STORAGE_KEY = 'sytask-crm-settings'

const DEFAULT_SETTINGS = {
  pipeline: {
    winReasons: ['Budget approved', 'Strong fit', 'Decision made', 'Contract ready'],
    lostReasons: ['No response', 'Budget mismatch', 'Lost to competitor', 'Timing changed'],
  },
  crm: {
    leadSources: ['Inbound', 'Referral', 'Outbound', 'Partner'],
    industries: ['Marketing', 'E-commerce', 'SaaS', 'Healthcare'],
    services: ['SEO', 'Social Media', 'Performance Marketing', 'Web Development'],
  },
  teams: {
    roles: ['admin', 'manager', 'employee', 'lead'],
    permissions: ['crm.view', 'crm.edit', 'crm.pipeline', 'crm.settings'],
    defaultOwners: ['Sales Manager', 'Account Executive', 'Customer Success'],
  },
  automation: {
    projectTemplates: ['SEO Launch', 'Social Media Growth', 'Performance Marketing Sprint'],
    defaultTaskTemplates: ['Kickoff call', 'Weekly follow-up', 'Review proposal'],
    defaultTeamAssignment: ['Project Manager', 'Designer', 'Copywriter'],
  },
  preferences: {
    defaultViews: ['Dashboard', 'Pipeline', 'Leads'],
    defaultFilters: ['Owner', 'Stage', 'Priority'],
  },
}

const PIPELINE_RESOURCES = [
  { key: 'stages', title: 'Pipeline Stages', query: salesApi.getStages, create: salesApi.createStage, fields: ['name', 'order'] },
  { key: 'tags', title: 'Lead Sources', query: salesApi.getTags, create: salesApi.createTag, fields: ['name'] },
  { key: 'channels', title: 'Industries', query: salesApi.getChannels, create: salesApi.createChannel, fields: ['name'] },
  { key: 'categories', title: 'Services', query: salesApi.getCategories, create: salesApi.createCategory, fields: ['name'] },
  { key: 'products', title: 'Default Task Templates', query: salesApi.getProducts, create: salesApi.createProduct, fields: ['name', 'category_id', 'rate', 'unit', 'state', 'city'] },
]

const toFormState = (resource) =>
  resource.fields.reduce((form, field) => ({ ...form, [field]: field === 'rate' || field === 'order' ? '0' : '' }), {})

const readStorage = () => {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw)
    return {
      pipeline: { ...DEFAULT_SETTINGS.pipeline, ...(parsed.pipeline || {}) },
      crm: { ...DEFAULT_SETTINGS.crm, ...(parsed.crm || {}) },
      teams: { ...DEFAULT_SETTINGS.teams, ...(parsed.teams || {}) },
      automation: { ...DEFAULT_SETTINGS.automation, ...(parsed.automation || {}) },
      preferences: { ...DEFAULT_SETTINGS.preferences, ...(parsed.preferences || {}) },
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

const saveStorage = (next) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export default function CRMSettingsPage() {
  const [settings, setSettings] = useState(() => readStorage())

  useEffect(() => {
    saveStorage(settings)
  }, [settings])

  return (
    <CRMPage>
      <CRMPageTitle
        eyebrow="CRM"
        title="Settings"
        description="Workspace configuration for the CRM. Pipeline masters reuse existing Sales endpoints; the remaining settings are persisted locally until dedicated APIs land."
        actions={<Badge label="CRM settings" colorKey="draft" />}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CRMStatCard icon={Target} label="Pipeline controls" value={String(settings.pipeline.winReasons.length + settings.pipeline.lostReasons.length)} helper="Win and lost reasons." tone="blue" />
        <CRMStatCard icon={Layers3} label="CRM masters" value={String(settings.crm.leadSources.length + settings.crm.industries.length + settings.crm.services.length)} helper="Sources, industries, services." tone="emerald" />
        <CRMStatCard icon={Users2} label="Team controls" value={String(settings.teams.roles.length + settings.teams.permissions.length)} helper="Roles, permissions, owners." tone="amber" />
        <CRMStatCard icon={ListChecks} label="Automation presets" value={String(settings.automation.projectTemplates.length + settings.preferences.defaultViews.length)} helper="Templates and defaults." tone="slate" />
      </div>

      <PipelineMastersSection />

      <div className="grid gap-6 xl:grid-cols-2">
        <EditableListSection
          title="CRM"
          description="Lead sources, industries, and services."
          settings={settings.crm}
          onChange={(section, values) => setSettings((current) => ({ ...current, [section]: values }))}
          sectionKey="crm"
          groups={[
            { key: 'leadSources', label: 'Lead Sources' },
            { key: 'industries', label: 'Industries' },
            { key: 'services', label: 'Services' },
          ]}
        />
        <EditableListSection
          title="Teams"
          description="Roles, permissions, and default owners."
          settings={settings.teams}
          onChange={(section, values) => setSettings((current) => ({ ...current, [section]: values }))}
          sectionKey="teams"
          groups={[
            { key: 'roles', label: 'Roles' },
            { key: 'permissions', label: 'Permissions' },
            { key: 'defaultOwners', label: 'Default Owners' },
          ]}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <EditableListSection
          title="Automation"
          description="Project templates, default task templates, and team assignment."
          settings={settings.automation}
          onChange={(section, values) => setSettings((current) => ({ ...current, [section]: values }))}
          sectionKey="automation"
          groups={[
            { key: 'projectTemplates', label: 'Project Templates' },
            { key: 'defaultTaskTemplates', label: 'Default Task Templates' },
            { key: 'defaultTeamAssignment', label: 'Default Team Assignment' },
          ]}
        />
        <EditableListSection
          title="Preferences"
          description="Default views and filters for CRM entry points."
          settings={settings.preferences}
          onChange={(section, values) => setSettings((current) => ({ ...current, [section]: values }))}
          sectionKey="preferences"
          groups={[
            { key: 'defaultViews', label: 'Default Views' },
            { key: 'defaultFilters', label: 'Default Filters' },
          ]}
        />
      </div>
    </CRMPage>
  )
}

function PipelineMastersSection() {
  const queryClient = useQueryClient()
  const { confirm } = useConfirmation()
  const [activeResource, setActiveResource] = useState(PIPELINE_RESOURCES[0])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => toFormState(PIPELINE_RESOURCES[0]))
  const { data, isLoading } = useQuery(['crm-settings-resource', activeResource.key], activeResource.query)
  const rows = asArray(data, [activeResource.key]).slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
  const categoriesQuery = useQuery(['crm-settings-categories'], salesApi.getCategories)
  const categories = asArray(categoriesQuery.data, ['categories'])

  const mutation = useMutation((payload) => activeResource.create(payload), {
    onSuccess: () => {
      toast.success(`${activeResource.title} saved`)
      queryClient.invalidateQueries(['crm-settings-resource', activeResource.key])
      if (activeResource.key === 'products') queryClient.invalidateQueries(['crm-settings-categories'])
      setOpen(false)
      setForm(toFormState(activeResource))
    },
    onError: (error) => {
      toast.error(error?.response?.data?.detail || 'Unable to save setting')
    },
  })

  useEffect(() => {
    setForm(toFormState(activeResource))
  }, [activeResource])

  const persistStageOrder = async (nextRows) => {
    if (activeResource.key !== 'stages') return
    await Promise.all(
      nextRows.map((row, index) => (
        salesApi.updateStageMaster(row.id, {
          name: row.name,
          order: index,
          is_default: Boolean(row.is_default),
        })
      ))
    )
    await queryClient.invalidateQueries(['crm-settings-resource', activeResource.key])
  }

  const moveStage = async (index, direction) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= rows.length) return
    const nextRows = [...rows]
    const [moved] = nextRows.splice(index, 1)
    nextRows.splice(targetIndex, 0, moved)
    try {
      await persistStageOrder(nextRows)
      toast.success('Stage order updated')
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Unable to reorder stages')
    }
  }

  const deleteStage = async (stage) => {
    const confirmed = await confirm({
      title: 'Delete stage',
      message: `Delete ${stage.name}? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDangerous: true,
    })
    if (!confirmed) return
    try {
      await salesApi.deleteStageMaster(stage.id)
      toast.success('Stage deleted')
      await queryClient.invalidateQueries(['crm-settings-resource', activeResource.key])
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Unable to delete stage')
    }
  }

  return (
    <CRMSection
      title="Pipeline"
      description="Manage stages, win reasons, and lost reasons using the existing Sales configuration APIs."
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          {PIPELINE_RESOURCES.map((resource) => (
            <Button
              key={resource.key}
              variant={resource.key === activeResource.key ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveResource(resource)}
            >
              {resource.title}
            </Button>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Add {activeResource.title}
          </Button>
        </div>
      )}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(isLoading ? Array.from({ length: 3 }, (_, index) => ({ id: `s-${index}` })) : rows).map((row, index) => (
          <article key={row.id || row.name || row.label} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{row.name || row.label || row.title || row.category_name || row.product_name || 'Item'}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{row.status || (row.is_active === false ? 'Inactive' : 'Active')}</p>
              </div>
              {activeResource.key === 'stages' && !isLoading ? (
                <Badge label={`#${index + 1}`} colorKey="draft" />
              ) : null}
            </div>
            {activeResource.key === 'stages' && !isLoading ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => moveStage(index, -1)} disabled={index === 0}>
                  <ArrowUp className="mr-1 h-4 w-4" />
                  Up
                </Button>
                <Button variant="secondary" size="sm" onClick={() => moveStage(index, 1)} disabled={index === rows.length - 1}>
                  <ArrowDown className="mr-1 h-4 w-4" />
                  Down
                </Button>
                <Button variant="secondary" size="sm" onClick={() => deleteStage(row)}>
                  <Trash2 className="mr-1 h-4 w-4" />
                  Delete
                </Button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {!rows.length ? (
        <div className="mt-4">
          <CRMEmptyState
            icon={Settings}
            title={`No ${activeResource.title.toLowerCase()}`}
            description={`Add your first ${activeResource.title.toLowerCase()} to configure the CRM.`}
          />
        </div>
      ) : null}

      <Modal isOpen={open} onClose={() => setOpen(false)} title={`Add ${activeResource.title}`}>
        <div className="space-y-4">
          {activeResource.fields.map((field) => (
            <FormField key={field} label={field.replaceAll('_', ' ')}>
              {field === 'category_id' ? (
                <select className={inputClassName} value={form.category_id} onChange={(event) => setForm((state) => ({ ...state, category_id: event.target.value }))}>
                  <option value="">Select category</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              ) : (
                <input
                  className={inputClassName}
                  type={field === 'rate' || field === 'order' ? 'number' : 'text'}
                  value={form[field]}
                  onChange={(event) => setForm((state) => ({ ...state, [field]: event.target.value }))}
                />
              )}
            </FormField>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={mutation.isLoading} onClick={() => mutation.mutate(form)}>Save</Button>
        </div>
      </Modal>
    </CRMSection>
  )
}

function EditableListSection({ title, description, settings, onChange, sectionKey, groups }) {
  return (
    <CRMSection title={title} description={description}>
      <div className="grid gap-4">
        {groups.map((group) => (
          <EditableList key={group.key} label={group.label} values={settings[group.key] || []} onChange={(values) => onChange(sectionKey, { ...settings, [group.key]: values })} />
        ))}
      </div>
    </CRMSection>
  )
}

function EditableList({ label, values, onChange }) {
  const [input, setInput] = useState('')

  const addValue = () => {
    const next = input.trim()
    if (!next) return
    onChange([...values, next])
    setInput('')
  }

  const removeValue = (index) => {
    onChange(values.filter((_, valueIndex) => valueIndex !== index))
  }

  return (
    <section className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</h3>
        <Badge label={`${values.length} items`} colorKey="draft" />
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className={inputClassName}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={`Add ${label.toLowerCase()}`}
        />
        <Button variant="secondary" onClick={addValue}>Add</Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {values.length ? values.map((value, index) => (
          <button
            key={`${label}-${value}-${index}`}
            type="button"
            onClick={() => removeValue(index)}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            aria-label={`Remove ${value}`}
          >
            {value}
            <span aria-hidden="true">×</span>
          </button>
        )) : (
          <span className="text-sm text-gray-500 dark:text-gray-400">No items yet.</span>
        )}
      </div>
    </section>
  )
}
