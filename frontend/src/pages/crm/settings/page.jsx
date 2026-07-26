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
  Plus,
  Sparkles,
  Zap,
  Building2,
  Briefcase
} from 'lucide-react'
import { salesApi } from '../../../api/sales'
import { CRMEmptyState, CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'
import { Badge, Button, FormField, inputClassName, Modal } from '../../../components/ui'
import { useConfirmation } from '../../../hooks/useConfirmation'
import { asArray } from '../../phase4Utils'
import { MetaIntegrationSettings } from './MetaIntegrationSettings'

const STORAGE_KEY = 'sytask-crm-settings'

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
  { key: 'stages', title: 'Pipeline Stages', label: 'Stages', query: salesApi.getStages, create: salesApi.createStage, fields: ['name', 'order'] },
  { key: 'tags', title: 'Lead Sources', label: 'Sources', query: salesApi.getTags, create: salesApi.createTag, fields: ['name'] },
  { key: 'channels', title: 'Industries', label: 'Industries', query: salesApi.getChannels, create: salesApi.createChannel, fields: ['name'] },
  { key: 'categories', title: 'Services', label: 'Services', query: salesApi.getCategories, create: salesApi.createCategory, fields: ['name'] },
  { key: 'products', title: 'Default Task Templates', label: 'Templates', query: salesApi.getProducts, create: salesApi.createProduct, fields: ['name', 'category_id', 'rate', 'unit', 'state', 'city'] },
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
  const metaKey = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('meta')

  useEffect(() => {
    saveStorage(settings)
  }, [settings])

  if (metaKey) return <MetaInvestorDemo activeKey={metaKey} />

  return (
    <CRMPage>
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-zinc-700 via-violet-600 to-purple-600 p-6 text-white shadow-xl md:p-8 mb-6">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
                <Settings className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-indigo-200">CRM</p>
                <h1 className="text-2xl font-bold md:text-3xl">Settings</h1>
                <p className="mt-1 text-indigo-100">Workspace configuration for the CRM.</p>
              </div>
            </div>
            <Badge label="CRM Settings" colorKey="draft" className="bg-white/20 text-white border-0" />
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="Pipeline Controls"
          value={String(settings.pipeline.winReasons.length + settings.pipeline.lostReasons.length)}
          icon={Target}
          color="indigo"
          subtitle="Win and lost reasons"
        />
        <StatCard
          label="CRM Masters"
          value={String(settings.crm.leadSources.length + settings.crm.industries.length + settings.crm.services.length)}
          icon={Layers3}
          color="emerald"
          subtitle="Sources, industries, services"
        />
        <StatCard
          label="Team Controls"
          value={String(settings.teams.roles.length + settings.teams.permissions.length)}
          icon={Users2}
          color="amber"
          subtitle="Roles, permissions, owners"
        />
        <StatCard
          label="Automation Presets"
          value={String(settings.automation.projectTemplates.length + settings.preferences.defaultViews.length)}
          icon={ListChecks}
          color="blue"
          subtitle="Templates and defaults"
        />
      </div>

      {/* Pipeline Masters Section */}
      <PipelineMastersSection />

      <MetaIntegrationSettings />

      <div className="grid gap-6 xl:grid-cols-2">
      {/* CRM Settings */}
      <div className="grid gap-6 xl:grid-cols-2 mb-6">
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

      {/* Automation & Preferences */}
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
</div>
    </CRMPage>
  )
}

const META_DEMO_FEATURES = [
  {
    key: 'command-center',
    title: 'Meta Command Center',
    status: 'Working demo',
    summary: 'One governed control room for WhatsApp, Instagram, and Messenger.',
    proof: ['Tenant-scoped Meta contracts', 'Unified channel health', 'No auto-send guardrail'],
  },
  {
    key: 'whatsapp',
    title: 'WhatsApp Inbox',
    status: 'Working',
    summary: 'Inbound WhatsApp messages normalize into SynTask conversations.',
    proof: ['Phone-number scoped matching', 'CRM timeline event', 'Draft-only reply state'],
  },
  {
    key: 'instagram',
    title: 'Instagram DMs',
    status: 'Working',
    summary: 'Instagram professional-account DMs enter same inbox pipeline.',
    proof: ['Scoped sender IDs', 'Connection health checks', 'Composer restrictions'],
  },
  {
    key: 'messenger',
    title: 'Messenger Inbox',
    status: 'Working',
    summary: 'Facebook Page Messenger conversations route into CRM inbox.',
    proof: ['Page-scoped sender IDs', '24-hour policy guardrails', 'Channel context'],
  },
  {
    key: 'ai-drafts',
    title: 'AI Reply Drafts',
    status: 'Working',
    summary: 'AI drafts replies with approval required and no provider send.',
    proof: ['Draft / approved / rejected states', 'Metadata-only audit logs', 'No Send button'],
  },
  {
    key: 'identity',
    title: 'Identity Linking',
    status: 'Working',
    summary: 'SynTask suggests cross-channel customer links only from deterministic evidence.',
    proof: ['Human-confirmed links', 'No auto-merge', 'CRM timeline traceability'],
  },
  {
    key: 'approval-queue',
    title: 'Human Approval Queue',
    status: 'Coming soon',
    summary: 'Manual provider send approval queue lands in next phase.',
    proof: ['Current build already blocks auto-send'],
  },
  {
    key: 'analytics',
    title: 'Omnichannel Analytics',
    status: 'Coming soon',
    summary: 'Channel performance, response speed, and AI draft analytics land next.',
    proof: ['Conversation data model ready'],
  },
  {
    key: 'readiness',
    title: 'Partner Readiness',
    status: 'Coming soon',
    summary: 'Meta App Review and partner evidence dashboard comes later.',
    proof: ['No false partner badge claims'],
  },
  {
    key: 'connect',
    title: 'Customer Meta Connect',
    status: 'Coming soon',
    summary: 'Tenant self-service credential/OAuth flow comes later.',
    proof: ['Encrypted credential reference model ready'],
  },
]

function MetaInvestorDemo({ activeKey }) {
  const active = META_DEMO_FEATURES.find((item) => item.key === activeKey) || META_DEMO_FEATURES[0]
  const working = META_DEMO_FEATURES.filter((item) => item.status !== 'Coming soon')
  const pending = META_DEMO_FEATURES.filter((item) => item.status === 'Coming soon')

  return (
    <CRMPage>
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-zinc-700 via-violet-600 to-purple-600 p-6 text-white shadow-xl md:p-8 mb-6">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-indigo-200">Meta Omnichannel</p>
                <h1 className="text-2xl font-bold md:text-3xl">{active.title}</h1>
                <p className="mt-1 text-indigo-100">{active.summary}</p>
              </div>
            </div>
            <Badge label={active.status} colorKey={active.status === 'Coming soon' ? 'draft' : 'active'} className="bg-white/20 text-white border-0" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <CRMStatCard icon={Target} label="Working features" value={String(working.length)} helper="Ready to show investors." tone="emerald" />
        <CRMStatCard icon={ListChecks} label="Guardrails" value="4" helper="Tenant, audit, no auto-send, no auto-merge." tone="blue" />
        <CRMStatCard icon={Settings} label="Pending phases" value={String(pending.length)} helper="Outbound, analytics, readiness, connect." tone="amber" />
      </div>

      <CRMSection title="Investor Demo Proof" description="What is built now, visible in SynTask, and backed by tested contracts.">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{active.title}</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{active.summary}</p>
              </div>
              <Badge label={active.status} colorKey={active.status === 'Coming soon' ? 'draft' : 'active'} />
            </div>
            <ul className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-200">
              {active.proof.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Demo Script</h3>
            <ol className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <li>1. Open Meta Omnichannel.</li>
              <li>2. Show WhatsApp, Instagram, Messenger inbox routes.</li>
              <li>3. Show identity linking: human confirmed, no auto-merge.</li>
              <li>4. Show AI draft: approve/reject only, no send.</li>
              <li>5. Say outbound send, analytics, partner readiness come next.</li>
            </ol>
          </div>
        </div>
      </CRMSection>

      <CRMSection title="Built Now" description="No Coming Soon labels here. These are investor-showable capabilities.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {working.map((item) => (
            <div key={item.key} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{item.title}</h3>
                <Badge label="Working" colorKey="active" />
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{item.summary}</p>
            </div>
          ))}
        </div>
      </CRMSection>

      <CRMSection title="Next Phases" description="Kept honest. These stay marked Coming Soon.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {pending.map((item) => (
            <div key={item.key} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.title}</h3>
                <Badge label="Coming soon" colorKey="draft" />
              </div>
              <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">{item.summary}</p>
            </div>
          ))}
        </div>
      </CRMSection>
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
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 mb-6">
      <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
              <Target className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">Pipeline</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Manage stages, win reasons, and lost reasons</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PIPELINE_RESOURCES.map((resource) => (
              <Button
                key={resource.key}
                variant={resource.key === activeResource.key ? 'primary' : 'secondary'}
                size="sm"
                className="shrink-0"
                onClick={() => setActiveResource(resource)}
                title={resource.title}
              >
                {resource.label}
              </Button>
            ))}
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Add {activeResource.label}
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(isLoading ? Array.from({ length: 3 }, (_, index) => ({ id: `s-${index}` })) : rows).map((row, index) => (
            <div key={row.id || row.name || row.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{row.name || row.label || row.title || row.category_name || row.product_name || 'Item'}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{row.status || (row.is_active === false ? 'Inactive' : 'Active')}</p>
                </div>
                {activeResource.key === 'stages' && !isLoading && (
                  <Badge label={`#${index + 1}`} colorKey="draft" />
                )}
              </div>
              {activeResource.key === 'stages' && !isLoading && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => moveStage(index, -1)} disabled={index === 0} className="gap-1">
                    <ArrowUp className="h-3.5 w-3.5" />
                    Up
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => moveStage(index, 1)} disabled={index === rows.length - 1} className="gap-1">
                    <ArrowDown className="h-3.5 w-3.5" />
                    Down
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => deleteStage(row)} className="gap-1 text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300">
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
        {!rows.length && (
          <div className="mt-4">
            <CRMEmptyState
              icon={Settings}
              title={`No ${activeResource.title.toLowerCase()}`}
              description={`Add your first ${activeResource.title.toLowerCase()} to configure the CRM.`}
            />
          </div>
        )}
      </div>

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
    </div>
  )
}

function EditableListSection({ title, description, settings, onChange, sectionKey, groups }) {
  const colors = {
    crm: 'from-blue-500 to-cyan-500',
    teams: 'from-emerald-500 to-teal-500',
    automation: 'from-purple-500 to-pink-500',
    preferences: 'from-amber-500 to-orange-500',
  }

  const iconMap = {
    crm: Building2,
    teams: Users2,
    automation: Zap,
    preferences: Settings,
  }

  const Icon = iconMap[sectionKey] || Settings
  const gradient = colors[sectionKey] || 'from-gray-500 to-gray-600'

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className={`border-b border-gray-200 bg-gradient-to-r from-${gradient.split(' ')[0]}-50/50 to-white p-4 dark:border-gray-700 dark:from-${gradient.split(' ')[0]}-950/20 dark:to-gray-800`}>
        <div className="flex items-center gap-3">
          <div className={`rounded-lg bg-${gradient.split(' ')[0]}-100 p-2 dark:bg-${gradient.split(' ')[0]}-900/30`}>
            <Icon className={`h-5 w-5 text-${gradient.split(' ')[0]}-600 dark:text-${gradient.split(' ')[0]}-400`} />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">{title}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {groups.map((group) => (
          <EditableList key={group.key} label={group.label} values={settings[group.key] || []} onChange={(values) => onChange(sectionKey, { ...settings, [group.key]: values })} />
        ))}
      </div>
    </div>
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
    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{label}</h3>
        <Badge label={`${values.length} items`} colorKey="draft" />
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className={`${inputClassName} bg-white dark:bg-gray-800`}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={`Add ${label.toLowerCase()}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addValue()
            }
          }}
        />
        <Button variant="secondary" onClick={addValue} className="gap-1">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {values.length ? values.map((value, index) => (
          <button
            key={`${label}-${value}-${index}`}
            type="button"
            onClick={() => removeValue(index)}
            className="group inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-rose-800 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
            aria-label={`Remove ${value}`}
          >
            {value}
            <span className="text-gray-400 transition-colors group-hover:text-rose-500 dark:text-gray-500 dark:group-hover:text-rose-400">×</span>
          </button>
        )) : (
          <span className="text-sm text-gray-500 dark:text-gray-400">No items yet.</span>
        )}
      </div>
    </div>
  )
}
