import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search, Plus, Filter, X, Clock,
  AlertTriangle, CheckCircle2, Send, Eye,
  Palette, FileText, Layers, ExternalLink,
  Sparkles, Users, ArrowRight, RotateCcw, RefreshCcw,
  LayoutList
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDistanceToNow, isPast, parseISO } from 'date-fns'
import { extractErrorMessage } from '../api/axios'
import { contentProductionApi } from '../api/contentProduction'
import { projectsApi } from '../api/projects'
import { clientsAPI } from '../api/clients'
import { Button, FormField, Modal } from '../components/ui'
import { asArray } from './phase4Utils'
import { useAuthStore } from '../store/authStore'
import { hasCapability } from '../utils/rbac'

// ── Lifecycle tabs ────────────────────────────────────────────────────────

const LIFECYCLE_TABS = [
  { key: 'all', label: 'All', icon: LayoutList },
  { key: 'idea', label: 'Idea', icon: Sparkles },
  { key: 'briefing', label: 'Briefing', icon: FileText },
  { key: 'script', label: 'Script', icon: FileText },
  { key: 'production', label: 'Production', icon: Palette },
  { key: 'internal_review', label: 'Internal Review', icon: Eye },
  { key: 'client_review', label: 'Client Review', icon: Users },
  { key: 'revision_required', label: 'Revision Required', icon: RotateCcw },
  { key: 'approved', label: 'Approved', icon: CheckCircle2 },
  { key: 'ready_to_publish', label: 'Ready to Publish', icon: Send },
  { key: 'published', label: 'Published', icon: ExternalLink },
]

const PLATFORMS = ['Instagram', 'YouTube', 'LinkedIn', 'Facebook', 'Twitter/X', 'Pinterest', 'Email', 'Blog', 'Other']
const CONTENT_TYPES = ['reel', 'static_post', 'carousel', 'story', 'blog', 'youtube', 'email_campaign', 'shoot_day', 'custom']
const PRIORITIES = ['low', 'medium', 'high', 'urgent']

const STATUS_COLORS = {
  idea: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  briefing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  script: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  production: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  internal_review: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  client_review: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  revision_required: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  ready_to_publish: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  // Legacy
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  planned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  scheduled: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
}

const PRIORITY_COLORS = {
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  medium: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
  high: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300',
  urgent: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300',
}

// Accent color for each lifecycle stage — used for the pipeline dot, the active
// pipeline fill, and the item-card left border (mirrors the Work module's
// color-coded lifecycle styling).
const STAGE_COLORS = {
  idea: '#A855F7',
  briefing: '#3B82F6',
  script: '#6366F1',
  production: '#F59E0B',
  internal_review: '#F97316',
  client_review: '#06B6D4',
  revision_required: '#EF4444',
  approved: '#10B981',
  ready_to_publish: '#14B8A6',
  published: '#2FB47C',
  // Legacy
  draft: '#9CA3AF',
  planned: '#3B82F6',
  scheduled: '#14B8A6',
}

// Left-border + background tint per stage so list rows read as color-coded
// sections (same treatment Work uses for scheduled/at-risk rows).
const CARD_ACCENTS = {
  idea: 'border-l-purple-400 bg-purple-50/50 dark:border-l-purple-500 dark:bg-purple-950/25',
  briefing: 'border-l-blue-400 bg-blue-50/50 dark:border-l-blue-500 dark:bg-blue-950/25',
  script: 'border-l-indigo-400 bg-indigo-50/50 dark:border-l-indigo-500 dark:bg-indigo-950/25',
  production: 'border-l-amber-400 bg-amber-50/50 dark:border-l-amber-500 dark:bg-amber-950/25',
  internal_review: 'border-l-orange-400 bg-orange-50/50 dark:border-l-orange-500 dark:bg-orange-950/25',
  client_review: 'border-l-cyan-400 bg-cyan-50/50 dark:border-l-cyan-500 dark:bg-cyan-950/25',
  revision_required: 'border-l-red-400 bg-red-50/50 dark:border-l-red-500 dark:bg-red-950/25',
  approved: 'border-l-green-400 bg-green-50/50 dark:border-l-green-500 dark:bg-green-950/25',
  ready_to_publish: 'border-l-teal-400 bg-teal-50/50 dark:border-l-teal-500 dark:bg-teal-950/25',
  published: 'border-l-emerald-400 bg-emerald-50/50 dark:border-l-emerald-500 dark:bg-emerald-950/25',
  // Legacy
  draft: 'border-l-gray-300 bg-gray-50/50 dark:border-l-gray-600 dark:bg-gray-950/25',
  planned: 'border-l-blue-400 bg-blue-50/50 dark:border-l-blue-500 dark:bg-blue-950/25',
  scheduled: 'border-l-teal-400 bg-teal-50/50 dark:border-l-teal-500 dark:bg-teal-950/25',
}

function formatStatusLabel(status) {
  if (!status) return 'Unknown'
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Main Component ────────────────────────────────────────────────────────

export default function ContentWorkspace() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // State from URL params
  const activeTab = searchParams.get('status') || 'all'
  const search = searchParams.get('search') || ''
  const clientFilter = searchParams.get('client_id') || ''
  const platformFilter = searchParams.get('platform') || ''
  const priorityFilter = searchParams.get('priority') || ''

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Permission truth mirrors the backend capability checks — the UI only hides
  // what the backend would reject.
  const user = useAuthStore((s) => s.user)
  const can = (capability) => hasCapability(user, capability)
  // List pagination — the workspace aggregate returns every item, so the list
  // is paged client-side (same pattern as the Tasks page) to keep the page
  // tidy when large volumes of content are loaded.
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20
  const [createForm, setCreateForm] = useState({
    title: '', project_id: '', client_id: '', service_id: '', deliverable_id: '', platform: 'Instagram',
    content_type: 'custom', priority: 'medium', description: '',
    objective: '', target_audience: '', key_message: '', hook: '', cta: '', tone: '',
    due_date: '', deadline: '',
  })

  // Templates — reusable content structures (Content Type, Platform, defaults).
  const [templates, setTemplates] = useState([])
  useEffect(() => {
    if (!showCreateModal) return
    let cancelled = false
    contentProductionApi.getTemplates()
      .then((res) => { if (!cancelled) setTemplates(asArray(res?.data, ['templates'])) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [showCreateModal])

  const applyTemplate = (templateId) => {
    const template = templates.find((t) => t.id === templateId)
    if (!template) return
    setCreateForm((prev) => ({
      ...prev,
      content_type: template.content_type || prev.content_type,
      platform: template.platform || prev.platform,
      objective: template.default_objective || prev.objective,
      target_audience: template.default_target_audience || prev.target_audience,
      key_message: template.default_key_message || prev.key_message,
      tone: template.default_tone || prev.tone,
      cta: template.default_cta || prev.cta,
      tags: template.default_tags?.length ? template.default_tags : prev.tags,
      assets_required: template.default_assets_required?.length ? template.default_assets_required : prev.assets_required,
    }))
    toast.success(`Template "${template.name}" applied`)
  }

  // Build query params
  const queryParams = useMemo(() => {
    const params = {}
    if (activeTab !== 'all') params.status = activeTab
    if (search) params.search = search
    if (clientFilter) params.client_id = clientFilter
    if (platformFilter) params.platform = platformFilter
    if (priorityFilter) params.priority = priorityFilter
    return params
  }, [activeTab, search, clientFilter, platformFilter, priorityFilter])

  // Queries
  const { data: workspaceData, isLoading, isError, refetch } = useQuery(
    ['content-workspace', queryParams],
    () => contentProductionApi.getWorkspace(queryParams),
    { staleTime: 30 * 1000 }
  )

  const { data: projectsData } = useQuery(
    ['content-projects'],
    () => projectsApi.getProjects({ limit: 100 }),
    { staleTime: 5 * 60 * 1000 }
  )

  // Dependent relationship flow: Client → Service → Project → Deliverable.
  // Each select narrows to records belonging to the previous selection; the
  // backend re-validates every supplied relation (frontend is UX, not security).
  const [clients, setClients] = useState([])
  const [services, setServices] = useState([])
  const [deliverables, setDeliverables] = useState([])

  useEffect(() => {
    if (!showCreateModal || clients.length) return
    let cancelled = false
    clientsAPI.listClients()
      .then((res) => { if (!cancelled) setClients(asArray(res, ['clients', 'data'])) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [showCreateModal, clients.length])

  useEffect(() => {
    if (!showCreateModal || !createForm.client_id) { setServices([]); return }
    let cancelled = false
    clientsAPI.listServices(createForm.client_id)
      .then((res) => { if (!cancelled) setServices(asArray(res, ['services', 'data'])) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [showCreateModal, createForm.client_id])

  useEffect(() => {
    if (!showCreateModal || !createForm.client_id) { setDeliverables([]); return }
    let cancelled = false
    clientsAPI.listDeliverables(createForm.client_id, { project_id: createForm.project_id || undefined })
      .then((res) => { if (!cancelled) setDeliverables(asArray(res, ['deliverables', 'data'])) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [showCreateModal, createForm.client_id, createForm.project_id])

  const items = workspaceData?.data?.items || []
  const lifecycleCounts = workspaceData?.data?.lifecycle_counts || {}
  const overview = workspaceData?.data?.overview || {}
  const projects = asArray(projectsData?.data, ['projects'])

  // Paged slice of the current filtered list
  const totalCount = items.length
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Return to the first page whenever the tab or filters change
  useEffect(() => {
    setPage(1)
  }, [activeTab, search, clientFilter, platformFilter, priorityFilter])

  const hasActiveFilters = Boolean(search || clientFilter || platformFilter || priorityFilter)

  const activeStage = LIFECYCLE_TABS.find((tab) => tab.key === activeTab) || LIFECYCLE_TABS[0]
  const pageTitle = activeTab === 'all' ? 'All Content' : `${activeStage.label} Content`

  // Create mutation
  const createMutation = useMutation(
    (payload) => contentProductionApi.createItem(payload),
    {
      onSuccess: (res) => {
        queryClient.invalidateQueries(['content-workspace'])
        queryClient.invalidateQueries(['content-calendar-items'])
        toast.success('Content item created')
        setShowCreateModal(false)
        // Navigate to the new item
        if (res?.data?.item?.id) {
          navigate(`/content/${res.data.item.id}`)
        }
      },
      onError: (err) => toast.error(extractErrorMessage(err?.response?.data?.detail) || 'Failed to create content item'),
    }
  )

  const handleCreate = (e) => {
    e.preventDefault()
    if (!createForm.title.trim()) {
      toast.error('Title is required')
      return
    }
    if (!createForm.project_id) {
      toast.error('Please select a project')
      return
    }
    // Normalize datetime fields — convert "" → null, "YYYY-MM-DD" → "YYYY-MM-DDT00:00:00"
    const payload = { ...createForm }
    const DATETIME_KEYS = ['due_date', 'deadline', 'publish_date', 'start_date', 'end_date', 'shoot_date']
    for (const key of DATETIME_KEYS) {
      const v = payload[key]
      if (!v) { delete payload[key] }
      else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { payload[key] = v + 'T00:00:00' }
    }
    createMutation.mutate(payload)
  }

  const handleTabChange = (tab) => {
    const params = new URLSearchParams(searchParams)
    if (tab === 'all') {
      params.delete('status')
    } else {
      params.set('status', tab)
    }
    setSearchParams(params)
  }

  const handleSearchChange = (value) => {
    const params = new URLSearchParams(searchParams)
    if (value) {
      params.set('search', value)
    } else {
      params.delete('search')
    }
    setSearchParams(params)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const resetFilters = () => {
    const params = new URLSearchParams(searchParams)
    for (const key of ['search', 'client_id', 'platform', 'priority']) params.delete(key)
    setSearchParams(params)
  }

  const openItem = (item) => {
    navigate(`/content/${item.id}`)
  }

  if (isLoading) {
    return <LoadingSkeleton />
  }

  return (
    <div className="space-y-4">
      {/* Lifecycle Pipeline — stage color dots + arrows, active stage filled
          with its own color (mirrors Work's TaskLifecyclePipeline) */}
      <ContentLifecyclePipeline
        current={activeTab}
        counts={lifecycleCounts}
        total={overview.total || 0}
        onSelect={handleTabChange}
      />

      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-pink-600 via-rose-600 to-fuchsia-600 p-3.5 text-white shadow-xl md:p-4">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2 backdrop-blur-sm">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold md:text-2xl">{pageTitle}</h1>
              <p className="mt-0.5 text-xs text-pink-100">Plan, create, review, and publish content across the full lifecycle</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:self-center">
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              aria-busy={refreshing || undefined}
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {can('content.create') && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <Plus className="h-3.5 w-3.5" />
                New Content
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Overview Stats — color-coded icon chips per metric */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <StatCard
          label="Due Today"
          value={overview.due_today}
          icon={Clock}
          colorClass="bg-amber-500/10 text-amber-600"
        />
        <StatCard
          label="Overdue"
          value={overview.overdue}
          icon={AlertTriangle}
          colorClass="bg-red-500/10 text-red-600"
        />
        <StatCard
          label="In Production"
          value={overview.in_production}
          icon={Palette}
          colorClass="bg-pink-500/10 text-pink-600"
        />
        <StatCard
          label="Internal Review"
          value={overview.awaiting_internal_review}
          icon={Eye}
          colorClass="bg-orange-500/10 text-orange-600"
        />
        <StatCard
          label="Client Review"
          value={overview.awaiting_client_approval}
          icon={Users}
          colorClass="bg-cyan-500/10 text-cyan-600"
        />
        <StatCard
          label="Revision"
          value={overview.revision_required}
          icon={RotateCcw}
          colorClass="bg-rose-500/10 text-rose-600"
        />
        <StatCard
          label="Ready"
          value={overview.ready_to_publish}
          icon={Send}
          colorClass="bg-teal-500/10 text-teal-600"
        />
        <StatCard
          label="Total"
          value={overview.total}
          icon={Layers}
          colorClass="bg-gray-500/10 text-gray-600"
        />
      </div>

      {/* Search & Filters */}
      <div className="rounded-2xl border border-surface-border bg-surface p-3 shadow-sm dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="input pl-10 text-sm"
              placeholder="Search by title, ID, or campaign..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            {search && (
              <button type="button" onClick={() => handleSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                showFilters
                  ? 'bg-pink-600 text-white hover:bg-pink-700'
                  : 'border border-surface-border text-text-secondary hover:bg-surface-muted dark:border-[var(--color-app-border)] dark:hover:bg-[var(--color-app-surface-muted)]'
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              Filters
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-2 rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-surface-muted dark:border-[var(--color-app-border)] dark:hover:bg-[var(--color-app-surface-muted)]"
              >
                <X className="h-3.5 w-3.5" />
                Reset
              </button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-surface-border pt-3 dark:border-[var(--color-app-border)]">
            <select className="input text-xs" value={platformFilter} onChange={(e) => {
              const params = new URLSearchParams(searchParams)
              if (e.target.value) params.set('platform', e.target.value); else params.delete('platform')
              setSearchParams(params)
            }}>
              <option value="">All Platforms</option>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="input text-xs" value={priorityFilter} onChange={(e) => {
              const params = new URLSearchParams(searchParams)
              if (e.target.value) params.set('priority', e.target.value); else params.delete('priority')
              setSearchParams(params)
            }}>
              <option value="">All Priorities</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Content Items List — the page scrolls naturally with the list */}
      <div>
        {isError ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-50/20 p-6 text-center text-red-800 dark:bg-red-950/20 dark:text-red-300">
              <p className="font-semibold">Unable to load content items.</p>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-surface-border bg-surface p-12 text-center dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
              <Palette className="mx-auto h-12 w-12 text-pink-300 dark:text-pink-800" />
              <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">No content items found</p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {activeTab !== 'all' ? 'Try a different lifecycle stage or clear filters' : 'Create your first content item to get started'}
              </p>
              {can('content.create') && (
                <Button className="mt-4" onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  New Content
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-surface-border bg-surface shadow-sm dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-surface-border text-sm dark:divide-[var(--color-app-border)]">
                  <thead className="bg-surface-muted dark:bg-[var(--color-app-surface-muted)]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Content</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Client / Project</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Platform</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Priority</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Deadline</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Assignee</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Next</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border dark:divide-[var(--color-app-border)]">
                    {pageItems.map((item) => (
                      <ContentItemRow key={item.id} item={item} onClick={() => openItem(item)} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-surface-border px-4 py-3 dark:border-[var(--color-app-border)]">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>
              Showing {totalCount === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, totalCount)} of {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-surface-muted disabled:opacity-40 dark:border-[var(--color-app-border)] dark:text-gray-400 dark:hover:bg-[var(--color-app-surface-muted)]"
              >
                Previous
              </button>
              <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {safePage} / {pageCount}
              </span>
              <button
                type="button"
                disabled={safePage >= pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-surface-muted disabled:opacity-40 dark:border-[var(--color-app-border)] dark:text-gray-400 dark:hover:bg-[var(--color-app-surface-muted)]"
              >
                Next
              </button>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Content Item"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {templates.length > 0 && (
            <FormField label="Start from Template (optional)">
              <select
                className="input"
                value=""
                onChange={(e) => applyTemplate(e.target.value)}
              >
                <option value="">Blank content</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </FormField>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Title" required>
              <input
                type="text"
                className="input"
                value={createForm.title}
                onChange={(e) => setCreateForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Content title..."
                required
              />
            </FormField>
            <FormField label="Client (optional — links business context)">
              <select
                className="input"
                value={createForm.client_id}
                onChange={(e) => setCreateForm(prev => ({ ...prev, client_id: e.target.value, service_id: '', deliverable_id: '' }))}
              >
                <option value="">No client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormField>
            {createForm.client_id && (
              <FormField label="Service (optional)">
                <select
                  className="input"
                  value={createForm.service_id}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, service_id: e.target.value }))}
                >
                  <option value="">No service</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </FormField>
            )}
            <FormField label="Project" required>
              <select
                className="input"
                value={createForm.project_id}
                onChange={(e) => setCreateForm(prev => ({ ...prev, project_id: e.target.value }))}
                required
              >
                <option value="">Select Project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </FormField>
            {createForm.client_id && (
              <FormField label="Deliverable (optional)">
                <select
                  className="input"
                  value={createForm.deliverable_id}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, deliverable_id: e.target.value }))}
                >
                  <option value="">No deliverable</option>
                  {deliverables.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </FormField>
            )}
            <FormField label="Platform">
              <select className="input" value={createForm.platform} onChange={(e) => setCreateForm(prev => ({ ...prev, platform: e.target.value }))}>
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </FormField>
            <FormField label="Content Type">
              <select className="input" value={createForm.content_type} onChange={(e) => setCreateForm(prev => ({ ...prev, content_type: e.target.value }))}>
                {CONTENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </FormField>
            <FormField label="Priority">
              <select className="input" value={createForm.priority} onChange={(e) => setCreateForm(prev => ({ ...prev, priority: e.target.value }))}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </FormField>
            <FormField label="Deadline">
              <input type="date" className="input" value={createForm.deadline} onChange={(e) => setCreateForm(prev => ({ ...prev, deadline: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Description">
            <textarea className="input" rows={2} value={createForm.description} onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Brief description..." />
          </FormField>
          <FormField label="Objective">
            <input type="text" className="input" value={createForm.objective} onChange={(e) => setCreateForm(prev => ({ ...prev, objective: e.target.value }))} placeholder="What is the goal?" />
          </FormField>
          <FormField label="Target Audience">
            <input type="text" className="input" value={createForm.target_audience} onChange={(e) => setCreateForm(prev => ({ ...prev, target_audience: e.target.value }))} placeholder="Who is this for?" />
          </FormField>
          <FormField label="Key Message">
            <input type="text" className="input" value={createForm.key_message} onChange={(e) => setCreateForm(prev => ({ ...prev, key_message: e.target.value }))} placeholder="Core message..." />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isLoading}>
              {createMutation.isLoading ? 'Creating...' : 'Create Content'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

// Lifecycle stage bar — every stage is its own chip with a status-colored dot,
// arrows flow between consecutive stages, and the active chip fills with its
// stage color. Mirrors Work's TaskLifecyclePipeline.
function ContentLifecyclePipeline({ current = 'all', counts = {}, total = 0, onSelect }) {
  const allTab = LIFECYCLE_TABS[0]
  const stages = LIFECYCLE_TABS.slice(1)

  const renderChip = (tab, isPlain) => {
    const isActive = current === tab.key
    const stageColor = STAGE_COLORS[tab.key] || '#EC4899'
    const count = isPlain ? total : Number(counts[tab.key] || 0)
    const Icon = tab.icon
    return (
      <button
        key={tab.key}
        type="button"
        role="tab"
        aria-selected={isActive}
        onClick={() => onSelect?.(tab.key)}
        title={`Show ${tab.label} content`}
        className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all ${
          isActive
            ? 'border-transparent text-white shadow-sm'
            : isPlain
              ? 'border-transparent text-gray-500 hover:bg-white/70 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800/80 dark:hover:text-gray-200'
              : 'border-gray-200/70 bg-white/70 text-gray-700 backdrop-blur-sm hover:border-gray-300 hover:bg-white hover:shadow-sm dark:border-gray-600/50 dark:bg-gray-900/40 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:bg-gray-800'
        }`}
        style={isActive ? { backgroundColor: stageColor } : undefined}
      >
        {isPlain ? null : (
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.9)' : stageColor }}
          />
        )}
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span>{tab.label}</span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
            isActive ? 'bg-white/25 text-white' : 'bg-gray-200/90 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
          }`}
        >
          {count}
        </span>
      </button>
    )
  }

  return (
    <div
      role="tablist"
      aria-label="Content lifecycle stages"
      className="flex items-center overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {renderChip(allTab, true)}
      <span className="mx-1.5 w-px shrink-0 self-stretch bg-gray-300/80 dark:bg-gray-600/70" aria-hidden="true" />
      {stages.map((tab, index) => (
        <div key={tab.key} className="flex shrink-0 items-center">
          {index > 0 ? (
            <span aria-hidden="true" className="mx-1 text-gray-300 dark:text-gray-600">
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          ) : null}
          {renderChip(tab, false)}
        </div>
      ))}
    </div>
  )
}

// Color-coded stat card with a tinted icon chip (same style as Work's summary cards).
function StatCard({ label, value, icon: Icon, colorClass }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-3 shadow-sm transition hover:border-primary-300 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] dark:hover:border-primary-400">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colorClass}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase text-text-muted">{label}</p>
          <p className="mt-0.5 text-lg font-bold leading-tight text-text-primary">{value || 0}</p>
        </div>
      </div>
    </div>
  )
}

// Full-page loading skeleton that mirrors the current page layout:
// pipeline strip → hero → stat cards → filters → table (header + rows).
function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Lifecycle pipeline strip */}
      <div className="flex items-center gap-2 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-9 w-28 shrink-0 animate-pulse rounded-lg bg-surface-muted dark:bg-[var(--color-app-surface-muted)]" />
        ))}
      </div>

      {/* Hero */}
      <div className="h-20 animate-pulse rounded-2xl bg-surface-muted dark:bg-[var(--color-app-surface-muted)]" />

      {/* Overview stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-muted dark:bg-[var(--color-app-surface-muted)]" />
        ))}
      </div>

      {/* Search & filters bar */}
      <div className="h-12 animate-pulse rounded-2xl bg-surface-muted dark:bg-[var(--color-app-surface-muted)]" />

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-surface-border bg-surface shadow-sm dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
        <div className="h-10 animate-pulse bg-surface-muted dark:bg-[var(--color-app-surface-muted)]" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-t border-surface-border px-4 py-4 dark:border-[var(--color-app-border)]"
          >
            <div className="h-8 w-1.5 animate-pulse rounded-full bg-surface-muted dark:bg-[var(--color-app-surface-muted)]" />
            <div className="h-3 w-44 animate-pulse rounded bg-surface-muted dark:bg-[var(--color-app-surface-muted)]" />
            <div className="hidden h-3 w-24 animate-pulse rounded bg-surface-muted dark:bg-[var(--color-app-surface-muted)] sm:block" />
            <div className="hidden h-3 w-20 animate-pulse rounded bg-surface-muted dark:bg-[var(--color-app-surface-muted)] md:block" />
            <div className="ml-auto h-6 w-16 animate-pulse rounded-full bg-surface-muted dark:bg-[var(--color-app-surface-muted)]" />
          </div>
        ))}
      </div>
    </div>
  )
}

// Sales-style list row — all details (platform, type, status, priority,
// deadline, assignee, next action) align in one horizontal line per item,
// with a status-colored left border + row tint for color coding.
function ContentItemRow({ item, onClick }) {
  const statusClass = STATUS_COLORS[item.status] || STATUS_COLORS.idea
  const priorityClass = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium
  const accentClass = CARD_ACCENTS[item.status] || CARD_ACCENTS.idea
  const stageColor = STAGE_COLORS[item.status] || STAGE_COLORS.idea
  const isOverdue = item.due_date && isPast(parseISO(item.due_date)) && !item.completed

  return (
    <tr
      onClick={onClick}
      className={`group cursor-pointer border-l-4 transition-colors hover:bg-surface-muted/70 dark:hover:bg-[var(--color-app-surface-muted)] ${accentClass}`}
    >
      <td className="min-w-[220px] px-4 py-3">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClick() }}
          className="block w-full truncate text-left text-sm font-medium text-text-primary hover:text-primary-600 hover:underline dark:text-gray-100"
          title={item.title}
        >
          {item.title}
        </button>
        <div className="mt-0.5 flex items-center gap-2">
          {item.content_id && <span className="font-mono text-xs text-gray-400 dark:text-gray-500">{item.content_id}</span>}
          {item.current_version > 1 && <span className="text-xs text-gray-400 dark:text-gray-500">{`v${item.current_version}`}</span>}
        </div>
      </td>
      <td className="max-w-[180px] px-4 py-3 text-gray-700 dark:text-gray-300">
        <div className="truncate text-xs">
          {item.client_name && <span className="font-medium">{item.client_name}</span>}
          {item.client_name && item.project_name && <span className="text-gray-400"> · </span>}
          {item.project_name && <span className="text-gray-500 dark:text-gray-400">{item.project_name}</span>}
          {!item.client_name && !item.project_name && <span className="text-gray-400 dark:text-gray-600">-</span>}
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-300">
        {item.platform ? <span className="inline-flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-gray-400" />{item.platform}</span> : <span className="text-gray-400 dark:text-gray-600">-</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-300">
        {item.content_type ? <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-gray-400" />{item.content_type.replace(/_/g, ' ')}</span> : <span className="text-gray-400 dark:text-gray-600">-</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass}`}>
          {formatStatusLabel(item.status)}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${priorityClass}`}>
          {item.priority}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        {item.deadline ? (
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-xs ${isOverdue ? 'font-semibold text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
              <Clock className="h-3.5 w-3.5" />
              {formatDistanceToNow(parseISO(item.deadline), { addSuffix: true })}
            </span>
            {isOverdue && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                <AlertTriangle className="h-3 w-3 mr-0.5" />
                Overdue
              </span>
            )}
          </div>
        ) : <span className="text-gray-400 dark:text-gray-600">-</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-300">
        {item.assignee_name ? <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-gray-400" />{item.assignee_name}</span> : <span className="text-gray-400 dark:text-gray-600">-</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: stageColor }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: stageColor }} />
          {/* Backend-owned lifecycle metadata (item.next_action) — the frontend
              keeps NO second lifecycle map so the workspace list, item detail,
              and overview can never disagree about what happens next. */}
          {item.next_action || formatStatusLabel(item.status)}
        </span>
      </td>
    </tr>
  )
}

function Globe({ className }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
}
