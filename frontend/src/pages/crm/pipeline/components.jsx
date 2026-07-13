import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertCircle, CalendarDays, ChevronDown, Filter, MoreHorizontal, MoveRight, RefreshCw, Sparkles, Target, TrendingUp, Users } from 'lucide-react'
import { CRMEmptyState, CRMSection } from '../../../components/crm'
import { Badge, Button, Skeleton } from '../../../components/ui'
import { formatCurrency, formatShortDate, getLeadContactLabel, getLeadDealValue, getLeadOwnerLabel, getLeadPriority, getLeadStageKey, getLeadTags, getStageDealValue, getStageKey } from './utils'

const leadColumnStyle = 'w-[260px] flex-none snap-start'
const stageAccents = ['#ea580c', '#d97706', '#b45309', '#f59e0b', '#ca8a04', '#f97316', '#a16207']
const iconTileStyles = [
  'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
]

export const PipelineBoardShell = ({ title, description, actions, children }) => (
  <div className="space-y-4">
    <CRMSection
      title={title}
      description={description}
      actions={actions}
      className="overflow-hidden rounded-2xl"
    >
      {children}
    </CRMSection>
  </div>
)

export const PipelineTopMetrics = memo(function PipelineTopMetrics({ visibleLeads = [], stages = [], currency = 'INR' }) {
  const metrics = useMemo(() => {
    const totalLeads = visibleLeads.length
    const totalValue = visibleLeads.reduce((sum, lead) => sum + getLeadDealValue(lead), 0)
    const activeStages = stages.filter((stage) => stage.leads?.length).length
    const wonLeads = visibleLeads.filter((lead) => getLeadStageKey(lead).includes('won')).length
    const hotLeads = visibleLeads.filter((lead) => ['critical', 'high'].includes(getLeadPriority(lead))).length
    return [
      { label: 'Total Leads', value: totalLeads, helper: 'Visible after filters', icon: Users, tone: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200' },
      { label: 'Total Value', value: formatCurrency(totalValue, currency), helper: 'Pipeline value', icon: TrendingUp, tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200' },
      { label: 'Hot Leads', value: hotLeads, helper: 'Critical or high priority', icon: Target, tone: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200' },
      { label: 'Active Stages', value: activeStages, helper: 'With at least one lead', icon: Sparkles, tone: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200' },
      { label: 'Won', value: wonLeads, helper: 'Visible won leads', icon: CalendarDays, tone: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200' },
    ]
  }, [currency, stages, visibleLeads])

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {metrics.map((metric) => (
        <article key={metric.label} className="rounded-xl border border-surface-border/80 bg-surface/95 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${metric.tone}`}>
              <metric.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-text-secondary dark:text-gray-400">{metric.label}</p>
              <p className="mt-1 truncate text-xl font-semibold tracking-tight text-text-primary dark:text-gray-100">{metric.value}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-text-secondary dark:text-gray-400">{metric.helper}</p>
        </article>
      ))}
    </div>
  )
})

export const PipelineFiltersBar = memo(function PipelineFiltersBar({
  filters,
  onChange,
  onResetFilters,
  ownerOptions,
  stageOptions,
  searchValue,
  onSearchChange,
  currency = 'INR',
}) {
  return (
    <div className="rounded-2xl border border-surface-border/80 bg-surface/95 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 gap-3 md:grid-cols-[minmax(220px,1.5fr)_repeat(3,minmax(150px,1fr))]">
          <label className="block">
            <span className="sr-only">Search</span>
            <div className="relative">
              <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                value={searchValue}
                onChange={(event) => onSearchChange?.(event.target.value)}
                className="input pl-10"
                placeholder="Search in pipeline..."
                aria-label="Search pipeline"
              />
            </div>
          </label>
          <label className="block">
            <span className="sr-only">Owner</span>
            <select
              className="input"
              value={filters.owner}
              onChange={(event) => onChange({ owner: event.target.value })}
              aria-label="Filter by owner"
            >
              <option value="">Owner: All</option>
              {ownerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Priority</span>
            <select
              className="input"
              value={filters.priority}
              onChange={(event) => onChange({ priority: event.target.value })}
              aria-label="Filter by priority"
            >
              <option value="">Priority: All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Current Stage</span>
            <select
              className="input"
              value={filters.stage}
              onChange={(event) => onChange({ stage: event.target.value })}
              aria-label="Filter by stage"
            >
              <option value="">Stage: All</option>
              {stageOptions.map((stage) => (
                <option key={stage.value} value={stage.value}>
                  {stage.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            if (onResetFilters) {
              onResetFilters()
              return
            }
            onChange({
              q: '',
              owner: '',
              priority: '',
              tags: '',
              minValue: '',
              maxValue: '',
              createdFrom: '',
              createdTo: '',
              stage: '',
            })
          }}
        >
          <Filter className="h-4 w-4" />
          Reset filters
        </Button>
      </div>
      <div className="space-y-4">
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,.8fr)_minmax(0,.8fr)_minmax(0,1fr)]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-text-secondary dark:text-gray-200">Tags</span>
            <input
              className="input"
              value={filters.tags}
              onChange={(event) => onChange({ tags: event.target.value })}
              placeholder="Enter comma-separated tags"
              aria-label="Filter by tags"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-text-secondary dark:text-gray-200">Min deal value</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min="0"
              value={filters.minValue}
              onChange={(event) => onChange({ minValue: event.target.value })}
              placeholder={currency === 'INR' ? '0' : 'Min value'}
              aria-label="Minimum deal value"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-text-secondary dark:text-gray-200">Max deal value</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min="0"
              value={filters.maxValue}
              onChange={(event) => onChange({ maxValue: event.target.value })}
              placeholder="No cap"
              aria-label="Maximum deal value"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-text-secondary dark:text-gray-200">Created from</span>
              <input
                className="input"
                type="date"
                value={filters.createdFrom}
                onChange={(event) => onChange({ createdFrom: event.target.value })}
                aria-label="Filter by created from date"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-text-secondary dark:text-gray-200">Created to</span>
              <input
                className="input"
                type="date"
                value={filters.createdTo}
                onChange={(event) => onChange({ createdTo: event.target.value })}
                aria-label="Filter by created to date"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  )
})

export const PipelineLoadingState = memo(function PipelineLoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <article key={item} className="rounded-2xl border border-surface-border/80 bg-surface/95 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/85">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-8 w-28" />
            <Skeleton className="mt-2 h-4 w-36" />
          </article>
        ))}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {[1, 2, 3, 4].map((column) => (
          <div key={column} className="w-80 flex-none rounded-[28px] border border-surface-border/80 bg-surface/95 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/85">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="mt-2 h-4 w-28" />
            <div className="mt-4 space-y-3">
              {[1, 2, 3].map((card) => (
                <div key={card} className="rounded-2xl border border-surface-border/80 bg-surface-muted p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-3 h-4 w-1/2" />
                  <Skeleton className="mt-4 h-4 w-1/3" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})

export const PipelineErrorState = memo(function PipelineErrorState({ onRetry, message = 'We could not load the CRM pipeline right now.' }) {
  return (
    <CRMEmptyState
      icon={AlertCircle}
      title="Pipeline unavailable"
      description={message}
      action={(
        <Button onClick={onRetry} variant="primary">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      )}
    />
  )
})

export const PipelineEmptyBoardState = memo(function PipelineEmptyBoardState({ onResetFilters }) {
  return (
    <CRMEmptyState
      icon={MoveRight}
      title="No leads in the pipeline"
      description="Create leads in Sales or clear the filters to see the board."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={onResetFilters}>
            Clear filters
          </Button>
        </div>
      }
    />
  )
})

export const PipelineSearchEmptyState = memo(function PipelineSearchEmptyState({ onResetFilters }) {
  return (
    <CRMEmptyState
      icon={Sparkles}
      title="No matching leads"
      description="Try widening your search or clearing one of the filters."
      action={<Button variant="secondary" onClick={onResetFilters}>Reset filters</Button>}
    />
  )
})

export const PipelineStageEmptyState = memo(function PipelineStageEmptyState({ label }) {
  return (
    <div className="rounded-2xl border border-dashed border-surface-border/80 bg-gradient-to-b from-surface to-surface-muted px-4 py-10 text-center text-sm text-text-secondary dark:border-gray-800 dark:from-gray-900 dark:to-gray-950 dark:text-gray-400">
      No leads in {label}
    </div>
  )
})

export const PipelineBoard = memo(function PipelineBoard({
  stages = [],
  currency = 'INR',
  activeLeadId = null,
  onMoveLeadToStage,
  getAllowedStageKeys,
  onCopyLeadId,
  onLeadSelect,
  onResetFilters,
  visibleLeads = [],
  hasActiveFilters = false,
}) {
  const hasStages = stages.length > 0
  const totalLeads = stages.reduce((sum, stage) => sum + (stage.leads?.length || 0), 0)

  if (!hasStages) {
    return <PipelineEmptyBoardState onResetFilters={onResetFilters} />
  }

  if (hasActiveFilters && visibleLeads.length === 0) {
    return <PipelineSearchEmptyState onResetFilters={onResetFilters} />
  }

  if (totalLeads === 0) {
    return <PipelineEmptyBoardState onResetFilters={onResetFilters} />
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="flex gap-4 overflow-x-auto scroll-smooth pb-4 pr-2 snap-x snap-mandatory">
          {stages.map((stage, index) => (
            <PipelineColumn
              key={stage.key || stage.id || stage.name || index}
              stage={stage}
              stages={stages}
              accent={stageAccents[index % stageAccents.length]}
              currency={currency}
              activeLeadId={activeLeadId}
              onMoveLeadToStage={onMoveLeadToStage}
              getAllowedStageKeys={getAllowedStageKeys}
              onCopyLeadId={onCopyLeadId}
              onLeadSelect={onLeadSelect}
            />
          ))}
        </div>
      </div>
    </div>
  )
})

export const PipelineColumn = memo(function PipelineColumn({
  stage,
  stages = [],
  accent = stageAccents[0],
  currency = 'INR',
  activeLeadId = null,
  onMoveLeadToStage,
  getAllowedStageKeys,
  onCopyLeadId,
  onLeadSelect,
}) {
  const leads = stage.leads || []
  const isActive = leads.some((lead) => (lead.id || lead._id) === activeLeadId)
  const allowedStageKeys = useMemo(() => new Set(getAllowedStageKeys?.(stage) || []), [getAllowedStageKeys, stage])
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: stage.key })
  return (
    <section
      ref={setDroppableRef}
      className={`flex max-h-[calc(100vh-15rem)] flex-none flex-col overflow-hidden rounded-xl border border-surface-border/80 bg-surface/95 shadow-sm transition-shadow dark:border-gray-800 dark:bg-gray-900 ${leadColumnStyle} snap-start ${isOver ? 'ring-2 ring-primary-500/30 shadow-lg' : ''}`}
      aria-label={`${stage.name} stage`}
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />
      <header className="sticky top-0 z-20 border-b border-surface-border/80 bg-surface/95 px-3.5 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold tracking-tight text-text-primary dark:text-gray-100">
              {stage.name}
            </h3>
            <p className="mt-2 text-xs font-semibold text-text-secondary dark:text-gray-200">
              {formatCurrency(getStageDealValue(leads), currency)}
            </p>
          </div>
          <Badge label={`${leads.length}`} colorKey="draft" />
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] text-text-muted dark:text-gray-400">
          <span>Avg age: {Math.round((leads.reduce((sum, lead) => sum + Number(lead.days_in_stage || 0), 0) / Math.max(leads.length, 1)) || 0)} days</span>
          <span className="text-rose-500">Hot: {leads.filter((lead) => ['critical', 'high'].includes(getLeadPriority(lead))).length}</span>
        </div>
      </header>
      <div
        className={`flex-1 space-y-3 overflow-y-auto bg-surface-muted/70 p-3 dark:bg-gray-950/30 ${isActive ? 'bg-primary-50/30 dark:bg-primary-950/10' : ''}`}
        data-stage-key={stage.key}
      >
        <SortableContext items={leads.map((lead) => lead.id || lead._id)} strategy={verticalListSortingStrategy}>
          {leads.length === 0 ? (
            <PipelineStageEmptyState label={stage.name} />
          ) : (
            leads.map((lead, index) => (
              <PipelineLeadCard
                key={lead.id || lead._id || `${stage.key}-${index}`}
                lead={lead}
                stage={stage}
                stages={stages}
                currency={currency}
                onMoveLeadToStage={onMoveLeadToStage}
                allowedStageKeys={allowedStageKeys}
                onCopyLeadId={onCopyLeadId}
                onLeadSelect={onLeadSelect}
              />
            ))
          )}
        </SortableContext>
      </div>
    </section>
  )
})

function StageProgress({ stage, stages = [] }) {
  const currentIndex = Math.max(0, stages.findIndex((item) => item.key === stage.key))
  const total = Math.max(stages.length, 1)
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[11px] font-medium text-text-muted dark:text-gray-400">
        <span>Step {currentIndex + 1} of {total}</span>
        <span>{Math.round(((currentIndex + 1) / total) * 100)}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted dark:bg-gray-800">
        <div className="h-full rounded-full bg-primary-500" style={{ width: `${((currentIndex + 1) / total) * 100}%` }} />
      </div>
    </div>
  )
}

export const PipelineLeadCard = memo(function PipelineLeadCard({
  lead,
  stage,
  stages = [],
  currency = 'INR',
  onMoveLeadToStage,
  allowedStageKeys = new Set(),
  onCopyLeadId,
  onLeadSelect,
}) {
  const tags = getLeadTags(lead)
  const priority = getLeadPriority(lead)
  const dealValue = getLeadDealValue(lead)
  const ownerLabel = getLeadOwnerLabel(lead)
  const contactLabel = getLeadContactLabel(lead)
  const sortableId = lead.id || lead._id
  const [menuOpen, setMenuOpen] = useState(false)
  const actionButtonRef = useRef(null)
  const [menuPosition, setMenuPosition] = useState(null)
  const stageActions = useMemo(() => {
    const wantedActions = [
      { label: 'Follow Up Call', stageNames: ['Follow Up Call', 'Contacted'] },
      { label: 'Schedule a Meeting', stageNames: ['Schedule a Meeting', 'Discovery Scheduled'] },
      { label: 'Send Proposal', stageNames: ['Send Proposal', 'Proposal Sent'] },
      { label: 'Negotiation', stageNames: ['Negotiation'] },
      { label: 'Won', stageNames: ['Won'] },
      { label: 'Lost', stageNames: ['Lost'] },
    ]
    const stageLookup = new Map()
    ;(stages || []).forEach((candidate) => {
      const key = getStageKey(candidate)
      const canonicalName = String(candidate?.name || candidate?.label || candidate?.title || '').toLowerCase()
      stageLookup.set(canonicalName, { key, label: candidate?.name || candidate?.label || candidate?.title || 'Stage' })
      stageLookup.set(String(key).toLowerCase(), { key, label: candidate?.name || candidate?.label || candidate?.title || 'Stage' })
    })
    const preferredActions = wantedActions
      .map((action) => {
        for (const candidateName of action.stageNames) {
          const found = stageLookup.get(candidateName.toLowerCase())
          if (found && allowedStageKeys.has(found.key)) {
            return { key: found.key, label: action.label }
          }
        }
        return null
      })
      .filter(Boolean)
    const preferredKeys = new Set(preferredActions.map((action) => action.key))
    const fallbackActions = (stages || [])
      .filter((candidate) => allowedStageKeys.has(candidate.key) && !preferredKeys.has(candidate.key))
      .map((candidate) => ({ key: candidate.key, label: candidate.name || candidate.label || candidate.title || 'Stage' }))
    return [...preferredActions, ...fallbackActions]
  }, [allowedStageKeys, stages])
  const previousStage = useMemo(() => stages.find((candidate) => candidate.key === stage.previousStageKey), [stage.previousStageKey, stages])
  const nextStage = useMemo(() => stages.find((candidate) => candidate.key === stage.nextStageKey), [stage.nextStageKey, stages])
  const canMovePrevious = previousStage ? allowedStageKeys.has(previousStage.key) : false
  const canMoveNext = nextStage ? allowedStageKeys.has(nextStage.key) : false

  useEffect(() => {
    if (!menuOpen) return undefined
    const updatePosition = () => {
      const rect = actionButtonRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = 224
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12)
      setMenuPosition({ top: rect.bottom + 8, left, width })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [menuOpen])
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    data: { stageKey: getStageKey(stage) },
  })

  const leadStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <article
      ref={setNodeRef}
      style={leadStyle}
      className="group rounded-xl border border-surface-border/80 bg-surface/95 p-3 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-primary-500/30 dark:border-gray-800 dark:bg-gray-900"
      aria-label={`${lead.company_name || contactLabel} lead card`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className={`mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg ${iconTileStyles[Math.abs(String(sortableId || '').length) % iconTileStyles.length]} transition-colors focus-visible:ring-2 focus-visible:ring-primary-500/30`}
          aria-label={`Drag ${lead.company_name || contactLabel}`}
          {...attributes}
          {...listeners}
        >
          <MoveRight className="h-4 w-4 rotate-90" />
        </button>
        <button
          type="button"
          onClick={() => onLeadSelect?.(lead)}
          className="min-w-0 flex-1 text-left focus-visible:outline-none"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="truncate text-sm font-semibold text-text-primary dark:text-gray-100">
                {lead.company_name || contactLabel}
              </h4>
              <p className="mt-1 truncate text-xs text-text-secondary dark:text-gray-400">
                {contactLabel}
              </p>
            </div>
            <div className="inline-flex h-6 min-w-14 items-center justify-center rounded-full border border-dashed border-surface-border/80 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted dark:border-gray-800 dark:text-gray-500">
              AI
            </div>
          </div>
        </button>
      </div>

      <div className="mt-3 grid gap-1.5 text-xs text-text-secondary dark:text-gray-400">
        <LeadMetaRow label="Owner" value={ownerLabel} />
        <LeadMetaRow label="Value" value={formatCurrency(dealValue, currency)} strong />
        <LeadMetaRow label="Priority" value={<Badge label={priority} colorKey={priority} />} />
        <LeadMetaRow label="Days in stage" value={String(Math.max(Number(lead.days_in_stage || 0), 0))} />
        <LeadMetaRow label="Created" value={formatShortDate(lead.created_at || lead.createdAt || lead.created_date)} />
        <LeadMetaRow label="Stage" value={stage.name} />
      </div>
      <StageProgress stage={stage} stages={stages} />

      {tags.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.slice(0, 4).map((tag) => (
            <Badge key={tag} label={tag} colorKey="draft" className="text-[10px]" />
          ))}
          {tags.length > 4 ? (
            <span className="inline-flex items-center rounded-full bg-surface-muted px-2.5 py-1 text-[10px] font-medium text-text-muted dark:bg-gray-800 dark:text-gray-400">
              +{tags.length - 4}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="relative" ref={actionButtonRef}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal className="h-4 w-4" />
            Actions
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          {menuOpen ? (
            <div
              className="fixed z-50 overflow-hidden rounded-2xl border border-surface-border/80 bg-surface/95 p-2 shadow-lg dark:border-gray-800 dark:bg-gray-900"
              style={menuPosition || { width: 224 }}
            >
              <ActionItem
                label="Copy lead ID"
                onClick={() => {
                  onCopyLeadId?.(lead)
                  setMenuOpen(false)
                }}
              />
              {stageActions.map((action) => (
                <ActionItem
                  key={action.key}
                  label={`Move to ${action.label}`}
                  onClick={() => {
                    onMoveLeadToStage?.(lead, action.key)
                    setMenuOpen(false)
                  }}
                />
              ))}
              <ActionItem
                label="Move to previous stage"
                disabled={!canMovePrevious}
                onClick={() => {
                  if (!canMovePrevious) return
                  onMoveLeadToStage?.(lead, stage.previousStageKey)
                  setMenuOpen(false)
                }}
              />
              <ActionItem
                label="Move to next stage"
                disabled={!canMoveNext}
                onClick={() => {
                  if (!canMoveNext) return
                  onMoveLeadToStage?.(lead, stage.nextStageKey)
                  setMenuOpen(false)
                }}
              />
            </div>
          ) : null}
        </div>
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted dark:text-gray-500">
          {stage.name}
        </span>
      </div>
    </article>
  )
})

function LeadMetaRow({ label, value, strong = false }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span>{label}</span>
      <span className={strong ? 'font-semibold text-text-primary dark:text-gray-100' : 'text-text-secondary dark:text-gray-200'}>
        {value}
      </span>
    </div>
  )
}

export const PipelineInsightRail = memo(function PipelineInsightRail({ visibleLeads = [], stages = [], currency = 'INR', onLeadSelect }) {
  const hotLeads = useMemo(() => (
    visibleLeads
      .filter((lead) => ['critical', 'high'].includes(getLeadPriority(lead)))
      .slice(0, 3)
  ), [visibleLeads])

  const stageTotal = Math.max(visibleLeads.length, 1)
  const stagePerformance = stages
    .map((stage, index) => ({
      name: stage.name,
      count: stage.leads?.length || 0,
      value: getStageDealValue(stage.leads || []),
      color: stageAccents[index % stageAccents.length],
    }))
    .filter((stage) => stage.count > 0)

  const recent = visibleLeads.slice(0, 3)

  return (
    <aside className="space-y-4">
      <section className="rounded-2xl border border-surface-border/80 bg-surface/95 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-950/40 dark:text-primary-200">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-text-primary dark:text-gray-100">AI Assistant</h3>
              <p className="text-xs text-text-secondary dark:text-gray-400">Top priorities</p>
            </div>
          </div>
          <Badge label="Beta" colorKey="draft" />
        </div>
        <div className="mt-4 space-y-3">
          {hotLeads.length ? hotLeads.map((lead, index) => (
            <button
              key={lead.id || lead._id || index}
              type="button"
              onClick={() => onLeadSelect?.(lead)}
            className="w-full rounded-xl border border-orange-100 bg-orange-50/50 p-3 text-left transition hover:border-primary-200 hover:bg-primary-50/50 dark:border-orange-950/40 dark:bg-orange-950/10 dark:hover:border-primary-800 dark:hover:bg-primary-950/20"
            >
              <div className="flex gap-3">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-700 dark:bg-orange-950/50 dark:text-orange-200">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-xs font-semibold text-text-primary dark:text-gray-100">
                    {lead.company_name || getLeadContactLabel(lead)}
                  </p>
                  <p className="mt-1 text-xs text-primary-700 dark:text-primary-300">View now</p>
                </div>
              </div>
            </button>
          )) : (
            <p className="rounded-xl bg-surface-muted p-3 text-xs text-text-secondary dark:bg-gray-950/40 dark:text-gray-400">No urgent leads in the current view.</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-surface-border/80 bg-surface/95 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-text-primary dark:text-gray-100">Stage Performance</h3>
        <div className="mt-4 space-y-3">
          {stagePerformance.slice(0, 6).map((stage) => {
            const percent = Math.round((stage.count / stageTotal) * 100)
            return (
              <div key={stage.name}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-text-secondary dark:text-gray-300">{stage.name}</span>
                  <span className="font-semibold text-text-primary dark:text-gray-100">{stage.count} ({percent}%)</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted dark:bg-gray-800">
                  <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: stage.color }} />
                </div>
                <p className="mt-1 text-[11px] text-text-muted dark:text-gray-400">{formatCurrency(stage.value, currency)}</p>
              </div>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-surface-border/80 bg-surface/95 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-text-primary dark:text-gray-100">Recent Activities</h3>
          <span className="text-xs font-medium text-primary-700 dark:text-primary-300">View all</span>
        </div>
        <div className="mt-4 space-y-3">
          {recent.map((lead, index) => (
            <button
              key={lead.id || lead._id || index}
              type="button"
              onClick={() => onLeadSelect?.(lead)}
            className="flex w-full items-start gap-3 rounded-xl p-2 text-left transition hover:bg-surface-muted dark:hover:bg-gray-800/60"
            >
              <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${iconTileStyles[index % iconTileStyles.length]}`}>
                <MoveRight className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-text-primary dark:text-gray-100">{lead.company_name || getLeadContactLabel(lead)}</span>
                <span className="mt-1 block truncate text-[11px] text-text-secondary dark:text-gray-400">
                  {getLeadOwnerLabel(lead)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </aside>
  )
})

function ActionItem({ label, onClick, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick?.()
      }}
      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"
    >
      <span>{label}</span>
    </button>
  )
}
