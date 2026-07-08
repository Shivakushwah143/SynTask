import { memo, useMemo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertCircle, ChevronDown, MoreHorizontal, MoveRight, RefreshCw, Sparkles } from 'lucide-react'
import { CRMEmptyState, CRMSection } from '../../../components/crm'
import { Badge, Button, Skeleton } from '../../../components/ui'
import { formatCurrency, formatShortDate, getLeadContactLabel, getLeadDealValue, getLeadOwnerLabel, getLeadPriority, getLeadTags, getStageDealValue, getStageKey } from './utils'

const leadColumnStyle = 'w-80 flex-none snap-start'

export const PipelineBoardShell = ({ title, description, actions, children }) => (
  <div className="space-y-6">
    <CRMSection title={title} description={description} actions={actions}>
      {children}
    </CRMSection>
  </div>
)

export const PipelineTopMetrics = memo(function PipelineTopMetrics({ visibleLeads = [], stages = [], currency = 'INR' }) {
  const metrics = useMemo(() => {
    const totalLeads = visibleLeads.length
    const totalValue = visibleLeads.reduce((sum, lead) => sum + getLeadDealValue(lead), 0)
    const activeStages = stages.filter((stage) => stage.leads?.length).length
    return [
      { label: 'Visible leads', value: totalLeads, helper: 'Filtered by the current search and filters.' },
      { label: 'Active stages', value: activeStages, helper: 'Columns with at least one lead.' },
      { label: 'Visible deal value', value: formatCurrency(totalValue, currency), helper: 'Deal value derived from live board data.' },
    ]
  }, [currency, stages, visibleLeads])

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {metrics.map((metric) => (
        <article key={metric.label} className="rounded-2xl border border-surface-border/80 bg-white/90 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/85">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{metric.label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{metric.value}</p>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{metric.helper}</p>
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
    <CRMSection
      title="Pipeline Controls"
      description="Search and filters are persisted in the URL so pipeline views can be shared and restored."
      actions={
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
          Reset filters
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Search</span>
            <div className="relative">
              <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={searchValue}
                onChange={(event) => onSearchChange?.(event.target.value)}
                className="input pl-10"
                placeholder="Search company, contact, or owner"
                aria-label="Search pipeline"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Owner</span>
            <select
              className="input"
              value={filters.owner}
              onChange={(event) => onChange({ owner: event.target.value })}
              aria-label="Filter by owner"
            >
              <option value="">All owners</option>
              {ownerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Priority</span>
            <select
              className="input"
              value={filters.priority}
              onChange={(event) => onChange({ priority: event.target.value })}
              aria-label="Filter by priority"
            >
              <option value="">All priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Current Stage</span>
            <select
              className="input"
              value={filters.stage}
              onChange={(event) => onChange({ stage: event.target.value })}
              aria-label="Filter by stage"
            >
              <option value="">All stages</option>
              {stageOptions.map((stage) => (
                <option key={stage.value} value={stage.value}>
                  {stage.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Tags</span>
            <input
              className="input"
              value={filters.tags}
              onChange={(event) => onChange({ tags: event.target.value })}
              placeholder="Enter comma-separated tags"
              aria-label="Filter by tags"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Min deal value</span>
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
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Max deal value</span>
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
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Created from</span>
              <input
                className="input"
                type="date"
                value={filters.createdFrom}
                onChange={(event) => onChange({ createdFrom: event.target.value })}
                aria-label="Filter by created from date"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Created to</span>
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
    </CRMSection>
  )
})

export const PipelineLoadingState = memo(function PipelineLoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <article key={item} className="rounded-2xl border border-surface-border/80 bg-white/90 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/85">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-8 w-28" />
            <Skeleton className="mt-2 h-4 w-36" />
          </article>
        ))}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {[1, 2, 3, 4].map((column) => (
          <div key={column} className="w-80 flex-none rounded-[28px] border border-surface-border/80 bg-white/90 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/85">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="mt-2 h-4 w-28" />
            <div className="mt-4 space-y-3">
              {[1, 2, 3].map((card) => (
                <div key={card} className="rounded-2xl border border-surface-border/80 p-4">
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
      description="Create prospects in Sales or clear the filters to see the board."
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
    <div className="rounded-2xl border border-dashed border-surface-border/80 bg-white/70 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-400">
      No leads in {label}
    </div>
  )
})

export const PipelineBoard = memo(function PipelineBoard({
  stages = [],
  currency = 'INR',
  activeLeadId = null,
  onMoveLeadToStage,
  onCopyLeadId,
  onLeadSelect,
  onResetFilters,
  visibleLeads = [],
}) {
  const hasStages = stages.length > 0
  const totalLeads = stages.reduce((sum, stage) => sum + (stage.leads?.length || 0), 0)

  if (!hasStages) {
    return <PipelineEmptyBoardState onResetFilters={onResetFilters} />
  }

  if (totalLeads === 0) {
    return <PipelineEmptyBoardState onResetFilters={onResetFilters} />
  }

  if (visibleLeads.length === 0) {
    return <PipelineSearchEmptyState onResetFilters={onResetFilters} />
  }

  return (
    <div className="space-y-4">
      <PipelineTopMetrics visibleLeads={visibleLeads} stages={stages} currency={currency} />
      <div className="relative">
        <div className="flex gap-4 overflow-x-auto scroll-smooth pb-4 pr-2 snap-x snap-mandatory">
          {stages.map((stage, index) => (
            <PipelineColumn
              key={stage.key || stage.id || stage.name || index}
              stage={stage}
              stages={stages}
              currency={currency}
              activeLeadId={activeLeadId}
              onMoveLeadToStage={onMoveLeadToStage}
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
  currency = 'INR',
  activeLeadId = null,
  onMoveLeadToStage,
  onCopyLeadId,
  onLeadSelect,
}) {
  const leads = stage.leads || []
  const isActive = leads.some((lead) => (lead.id || lead._id) === activeLeadId)
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: stage.key })
  return (
    <section
      ref={setDroppableRef}
      className={`flex max-h-[calc(100vh-16rem)] flex-none flex-col rounded-[28px] border border-surface-border/80 bg-gradient-to-b from-white to-slate-50/70 shadow-sm dark:border-gray-800 dark:from-gray-900 dark:to-gray-950 ${leadColumnStyle} snap-start ${isOver ? 'ring-2 ring-primary-500/30' : ''}`}
      aria-label={`${stage.name} stage`}
    >
      <header className="sticky top-0 z-20 border-b border-surface-border/80 bg-white/95 px-4 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              {stage.name}
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {leads.length} leads
            </p>
          </div>
          <div className="text-right">
            <Badge label={leads.length} colorKey="draft" />
            <p className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              {formatCurrency(getStageDealValue(leads), currency)}
            </p>
          </div>
        </div>
      </header>
      <div
        className={`flex-1 space-y-3 overflow-y-auto p-4 ${isActive ? 'bg-primary-50/20 dark:bg-primary-950/10' : ''}`}
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

export const PipelineLeadCard = memo(function PipelineLeadCard({
  lead,
  stage,
  stages = [],
  currency = 'INR',
  onMoveLeadToStage,
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
  const stageActions = useMemo(() => {
    const currentStageKey = getStageKey(stage)
    const wantedActions = [
      { label: 'Follow Up Call', stageNames: ['Follow Up Call', 'Contacted'] },
      { label: 'Schedule a Meeting', stageNames: ['Schedule a Meeting', 'Discovery Scheduled'] },
      { label: 'Send Proposal', stageNames: ['Send Proposal', 'Proposal Sent'] },
      { label: 'Negotiation', stageNames: ['Negotiation'] },
    ]
    const stageLookup = new Map()
    ;(stages || []).forEach((candidate) => {
      const key = getStageKey(candidate)
      const canonicalName = String(candidate?.name || candidate?.label || candidate?.title || '').toLowerCase()
      stageLookup.set(canonicalName, { key, label: candidate?.name || candidate?.label || candidate?.title || 'Stage' })
      stageLookup.set(String(key).toLowerCase(), { key, label: candidate?.name || candidate?.label || candidate?.title || 'Stage' })
    })
    return wantedActions
      .map((action) => {
        for (const candidateName of action.stageNames) {
          const found = stageLookup.get(candidateName.toLowerCase())
          if (found && found.key !== currentStageKey) {
            return { key: found.key, label: action.label }
          }
        }
        return null
      })
      .filter(Boolean)
  }, [stage, stages])
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
      className="group rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm transition-all duration-150 hover:shadow-md focus-within:ring-2 focus-within:ring-primary-500/30 dark:border-gray-800 dark:bg-gray-900"
      aria-label={`${lead.company_name || contactLabel} lead card`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-surface-border/80 bg-white text-gray-400 transition-colors hover:border-primary-300 hover:text-primary-600 focus-visible:ring-2 focus-visible:ring-primary-500/30 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-primary-700 dark:hover:text-primary-300"
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
              <h4 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                {lead.company_name || contactLabel}
              </h4>
              <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                {contactLabel}
              </p>
            </div>
            <div className="inline-flex h-6 min-w-14 items-center justify-center rounded-full border border-dashed border-surface-border/80 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:border-gray-800 dark:text-gray-500">
              AI
            </div>
          </div>
        </button>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-gray-500 dark:text-gray-400">
        <LeadMetaRow label="Owner" value={ownerLabel} />
        <LeadMetaRow label="Value" value={formatCurrency(dealValue, currency)} strong />
        <LeadMetaRow label="Priority" value={<Badge label={priority} colorKey={priority} />} />
        <LeadMetaRow label="Days in stage" value={String(Math.max(Number(lead.days_in_stage || 0), 0))} />
        <LeadMetaRow label="Created" value={formatShortDate(lead.created_at || lead.createdAt || lead.created_date)} />
        <LeadMetaRow label="Stage" value={stage.name} />
      </div>

      {tags.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.slice(0, 4).map((tag) => (
            <Badge key={tag} label={tag} colorKey="draft" className="text-[10px]" />
          ))}
          {tags.length > 4 ? (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              +{tags.length - 4}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="relative">
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
            <div className="absolute left-0 z-30 mt-2 w-56 overflow-hidden rounded-2xl border border-surface-border/80 bg-white p-2 shadow-lg dark:border-gray-800 dark:bg-gray-900">
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
                disabled={!stage.previousStageKey}
                onClick={() => {
                  if (!stage.previousStageKey) return
                  onMoveLeadToStage?.(lead, stage.previousStageKey)
                  setMenuOpen(false)
                }}
              />
              <ActionItem
                label="Move to next stage"
                disabled={!stage.nextStageKey}
                onClick={() => {
                  if (!stage.nextStageKey) return
                  onMoveLeadToStage?.(lead, stage.nextStageKey)
                  setMenuOpen(false)
                }}
              />
            </div>
          ) : null}
        </div>
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
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
      <span className={strong ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-200'}>
        {value}
      </span>
    </div>
  )
}

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
      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"
    >
      <span>{label}</span>
    </button>
  )
}
