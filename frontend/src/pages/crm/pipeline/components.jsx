import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertCircle, CalendarClock, ChevronDown, Filter, Loader2, MoreHorizontal, MoveRight, Phone, RefreshCw, Sparkles, Trash2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { CRMEmptyState, CRMSection } from '../../../components/crm'
import { Badge, Button, Skeleton } from '../../../components/ui'
import { formatCurrency, formatShortDate, getLeadContactLabel, getLeadDealValue, getLeadOwnerLabel, getLeadPriority, getLeadRawContactName, getLeadStageStatus, getLeadTags, getStageDealValue, getStageKey, getStageStatusOptions } from './utils'

const leadColumnStyle = 'w-[300px] flex-none snap-start'
export const pipelineLeadCardClassNames = {
  column: leadColumnStyle,
  actions: 'mt-4 flex flex-col gap-2 border-t border-surface-border/70 pt-3 dark:border-gray-800',
  actionButton: 'min-h-10 w-full justify-between rounded-lg border border-surface-border/80 bg-surface px-3 text-xs font-semibold text-text-primary hover:bg-surface-muted dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800',
  nextButton: 'min-h-10 w-full justify-center rounded-lg px-3 text-xs font-semibold shadow-sm',
  stagePill: 'inline-flex min-h-8 w-full items-center justify-center rounded-lg bg-surface-muted px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary dark:bg-gray-800 dark:text-gray-300',
}
const stageAccents = ['#ea580c', '#d97706', '#b45309', '#f59e0b', '#ca8a04', '#f97316', '#a16207']
const iconTileStyles = [
  'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
]

const getUserDisplayName = (user) => {
  if (!user) return ''
  const name = user.full_name || user.fullName || user.name || [user.first_name || user.firstName, user.last_name || user.lastName].filter(Boolean).join(' ')
  return String(name || user.email || '').trim()
}

// Stage-scoped inner-status selector. Only the current stage's statuses are
// offered (repeated labels like Draft / Accepted / Sent are never mixed across
// stages). Fully controlled: the parent persists via the status API and refetches,
// so a failed save leaves the lead's displayed status untouched.
export const StageStatusSelect = memo(function StageStatusSelect({
  stageKey,
  lead,
  disabled = false,
  onStatusChange,
  className = '',
  compact = false,
}) {
  const options = getStageStatusOptions(stageKey)
  const currentStatus = getLeadStageStatus(lead)

  if (!options.length) {
    return <span className="text-xs italic text-text-muted dark:text-gray-500">Not set</span>
  }

  return (
    <select
      value={currentStatus}
      onChange={(event) => onStatusChange?.(event.target.value)}
      disabled={disabled}
      aria-label="Update inner status"
      className={`cursor-pointer rounded-lg border border-surface-border/80 bg-surface px-2 font-semibold text-text-primary transition hover:border-primary-300 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 ${compact ? 'py-1 text-[11px]' : 'py-1.5 text-xs'} ${className}`}
    >
      {!currentStatus ? (
        <option value="" disabled className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white">Not set</option>
      ) : null}
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white">
          {option.label}
        </option>
      ))}
    </select>
  )
})

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

// Compact single-row filter strip. All controls are equal-height small inputs
// (`.input-sm`) so the whole bar fits in one dense band; labels are sr-only and
// the reset action is a small inline button in the same row.
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
  const handleReset = () => {
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
  }

  const optionClass = 'bg-white text-gray-900 dark:bg-gray-700 dark:text-white'

  return (
    <div className="rounded-xl border border-surface-border/80 bg-surface/95 p-2.5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-[minmax(200px,1.6fr)_repeat(4,minmax(0,1fr))_minmax(220px,1.5fr)]">
        <label className="relative col-span-2 block min-w-0 sm:col-span-3 lg:col-span-1">
          <span className="sr-only">Search</span>
          <Sparkles className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            value={searchValue}
            onChange={(event) => onSearchChange?.(event.target.value)}
            className="input input-sm pl-8"
            placeholder="Search pipeline..."
            aria-label="Search pipeline"
          />
        </label>
        <label className="block min-w-0">
          <span className="sr-only">Owner</span>
          <select
            className="input input-sm"
            value={filters.owner}
            onChange={(event) => onChange({ owner: event.target.value })}
            aria-label="Filter by owner"
          >
            <option className={optionClass} value="">Owner: All</option>
            {ownerOptions.map((option) => (
              <option className={optionClass} key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="sr-only">Priority</span>
          <select
            className="input input-sm"
            value={filters.priority}
            onChange={(event) => onChange({ priority: event.target.value })}
            aria-label="Filter by priority"
          >
            <option className={optionClass} value="">Priority: All</option>
            <option className={optionClass} value="critical">Critical</option>
            <option className={optionClass} value="high">High</option>
            <option className={optionClass} value="medium">Medium</option>
            <option className={optionClass} value="low">Low</option>
          </select>
        </label>
        <label className="block min-w-0">
          <span className="sr-only">Current Stage</span>
          <select
            className="input input-sm"
            value={filters.stage}
            onChange={(event) => onChange({ stage: event.target.value })}
            aria-label="Filter by stage"
          >
            <option className={optionClass} value="">Stage: All</option>
            {stageOptions.map((stage) => (
              <option key={stage.value} value={stage.value}>
                {stage.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="sr-only">Tags</span>
          <input
            className="input input-sm"
            value={filters.tags}
            onChange={(event) => onChange({ tags: event.target.value })}
            placeholder="Tags"
            aria-label="Filter by tags"
          />
        </label>
        <label className="block min-w-0">
          <span className="sr-only">Min deal value</span>
          <input
            className="input input-sm"
            type="number"
            inputMode="numeric"
            min="0"
            value={filters.minValue}
            onChange={(event) => onChange({ minValue: event.target.value })}
            placeholder={currency === 'INR' ? 'Min ₹' : 'Min value'}
            aria-label="Minimum deal value"
          />
        </label>
        <label className="block min-w-0">
          <span className="sr-only">Max deal value</span>
          <input
            className="input input-sm"
            type="number"
            inputMode="numeric"
            min="0"
            value={filters.maxValue}
            onChange={(event) => onChange({ maxValue: event.target.value })}
            placeholder="Max value"
            aria-label="Maximum deal value"
          />
        </label>
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <label className="block min-w-0">
            <span className="sr-only">Created from</span>
            <input
              className="input input-sm"
              type="date"
              value={filters.createdFrom}
              onChange={(event) => onChange({ createdFrom: event.target.value })}
              aria-label="Filter by created from date"
            />
          </label>
          <label className="block min-w-0">
            <span className="sr-only">Created to</span>
            <input
              className="input input-sm"
              type="date"
              value={filters.createdTo}
              onChange={(event) => onChange({ createdTo: event.target.value })}
              aria-label="Filter by created to date"
            />
          </label>
        </div>
      </div>
      <div className="mt-2 flex justify-end border-t border-surface-border/60 pt-1.5 dark:border-gray-800">
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[11px] font-semibold text-text-secondary transition hover:bg-surface-muted dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <Filter className="h-3.5 w-3.5" />
          Reset filters
        </button>
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
  movingLeadId = null,
  statusUpdatingId = null,
  users = [],
  onMoveLeadToStage,
  onUpdateStageStatus,
  onRecordContact,
  onScheduleFollowUp,
  onDeleteLead,
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

  if (totalLeads === 0 && stages.length > 1) {
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
              movingLeadId={movingLeadId}
              statusUpdatingId={statusUpdatingId}
              users={users}
              onMoveLeadToStage={onMoveLeadToStage}
              onUpdateStageStatus={onUpdateStageStatus}
              onRecordContact={onRecordContact}
              onScheduleFollowUp={onScheduleFollowUp}
              onDeleteLead={onDeleteLead}
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

export const PipelineStageListView = memo(function PipelineStageListView({
  stage,
  leads = [],
  stages = [],
  currency = 'INR',
  movingLeadId = null,
  statusUpdatingId = null,
  users = [],
  onMoveLeadToStage,
  onUpdateStageStatus,
  onRecordContact,
  onScheduleFollowUp,
  onDeleteLead,
  onLeadSelect,
  onResetFilters,
  onBulkAssign,
  bulkAssigning = false,
  onBulkDelete,
  bulkDeleting = false,
  hasActiveFilters = false,
}) {
  // ── Hooks first: they must run unconditionally, before the early returns ───
  // Same owner resolution as the board cards: the assigned user id is looked up
  // in the live users list first, so a stale serialized owner_name (or a raw id)
  // can never surface as wrong Owner detail in the table.
  const ownerLookup = useMemo(() => {
    const values = new Map()
    ;(users || []).forEach((user) => {
      const id = String(user?.id || user?._id || user?.user_id || '').trim()
      const label = getUserDisplayName(user)
      if (id && label) values.set(id, label)
    })
    return values
  }, [users])

  // ── Sync a scrollbar on top of the table with the table's own scroll ───────
  // The table can overflow horizontally (Company/Mobile/Email/... columns), but
  // its native scrollbar sits at the bottom, out of sight. A thin bar mirrored
  // at the top lets the user scroll the columns without reaching down. The top
  // bar's inner spacer is sized imperatively (ref, not state) so no React state
  // updates happen during layout — keeping tests warning-free and cheap.
  const tableScrollRef = useRef(null)
  const topScrollRef = useRef(null)

  useLayoutEffect(() => {
    const node = tableScrollRef.current
    const bar = topScrollRef.current
    if (!node || !bar || !bar.firstElementChild) return
    const update = () => {
      if (bar.firstElementChild) bar.firstElementChild.style.width = `${node.scrollWidth}px`
    }
    update()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (observer) observer.observe(node)
    return () => observer?.disconnect()
  }, [leads.length])

  const syncTopFromTable = () => {
    if (topScrollRef.current && tableScrollRef.current) {
      topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft
    }
  }
  const syncTableFromTop = () => {
    if (tableScrollRef.current && topScrollRef.current) {
      tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft
    }
  }

  // ── Bulk multi-select (e.g. assign many Acquire leads at once) ─────────────
  const leadIdOf = (lead) => lead.id || lead._id || ''
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [assignTarget, setAssignTarget] = useState('')
  const visibleIds = leads.map((lead) => leadIdOf(lead)).filter(Boolean)

  // Drop selections that no longer exist in this view (lead moved / filter changed).
  useEffect(() => {
    if (selectedIds.size === 0) return
    const valid = new Set(visibleIds)
    const stale = [...selectedIds].filter((id) => !valid.has(id))
    if (stale.length) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        stale.forEach((id) => next.delete(id))
        return next
      })
    }
  }, [visibleIds.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!stage) {
    return <PipelineEmptyBoardState onResetFilters={onResetFilters} />
  }

  if (hasActiveFilters && leads.length === 0) {
    return <PipelineSearchEmptyState onResetFilters={onResetFilters} />
  }

  if (leads.length === 0) {
    return <PipelineStageEmptyState label={stage.name} />
  }

  const nextStage = stages.find((candidate) => candidate.key === stage.nextStageKey)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  const toggleLead = (leadId, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(leadId)
      else next.delete(leadId)
      return next
    })
  }

  const toggleAll = (checked) => {
    setSelectedIds(checked ? new Set(visibleIds) : new Set())
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setAssignTarget('')
  }

  const handleBulkAssign = async () => {
    if (!assignTarget || bulkAssigning) return
    const ids = Array.from(selectedIds)
    try {
      await onBulkAssign?.(ids, assignTarget)
      clearSelection()
    } catch {
      // Keep the selection so the user can retry.
    }
  }

  const handleBulkDelete = () => {
    if (bulkDeleting || selectedIds.size === 0) return
    onBulkDelete?.(Array.from(selectedIds))
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-surface-border/80 bg-surface/95 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-primary-200/70 bg-primary-50/60 px-3 py-2.5 dark:border-primary-900/50 dark:bg-primary-950/20">
          <span className="text-xs font-bold text-text-primary dark:text-gray-100">
            {selectedIds.size} selected
          </span>
          <label className="flex min-w-0 items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted dark:text-gray-400">Assign to</span>
            <select
              className="input input-sm"
              value={assignTarget}
              onChange={(event) => setAssignTarget(event.target.value)}
              aria-label="Assign selected leads to"
            >
              <option value="" className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white">Select user</option>
              {users.map((user) => {
                const id = String(user?.id || user?._id || user?.user_id || '')
                return (
                  <option key={id || `${user?.first_name || ''}${user?.last_name || ''}`} value={id} className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white">
                    {getUserDisplayName(user) || id || 'Unnamed user'}
                  </option>
                )
              })}
            </select>
          </label>
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={bulkAssigning}
            loadingText="Assigning"
            disabled={!assignTarget || bulkAssigning}
            onClick={handleBulkAssign}
          >
            Assign
          </Button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={bulkAssigning || bulkDeleting}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-text-secondary transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
          <span className="ml-auto" />
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
          >
            {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {bulkDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      ) : null}
      <div
        ref={topScrollRef}
        onScroll={syncTableFromTop}
        className="overflow-x-auto overscroll-x-contain border-b border-surface-border/60 bg-surface-muted/40"
      >
        <div className="h-2" aria-hidden="true" />
      </div>
      <div ref={tableScrollRef} onScroll={syncTopFromTable} className="overflow-x-auto">
        <table className="min-w-full divide-y divide-surface-border/80 text-sm">
          <thead className="bg-surface-muted/80 text-text-secondary dark:bg-gray-950/50 dark:text-gray-300">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all leads"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleAll(event.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-surface-border/80 accent-primary-600 dark:border-gray-600"
                />
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Lead</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Company</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Mobile</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Email</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Assigned To</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Priority</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Status</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Value</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Created</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Follow-up</th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border/80 dark:divide-gray-800">
            {leads.map((lead, index) => {
              const leadId = lead.id || lead._id || `${stage.key}-${index}`
              // Lead column shows the person (if any), otherwise the company.
              const contactName = getLeadRawContactName(lead)
              const leadTitle = String(contactName || '').trim() || lead.company_name || getLeadContactLabel(lead) || 'Lead'
              const companyLabel = lead.company_name || lead.crm_company_name || ''
              const phoneLabel = [lead.country_code, lead.phone].filter(Boolean).join(' ') || ''
              const emailLabel = lead.email || ''
              const ownerLabel = ownerLookup.get(String(lead.assigned_to || lead.owner_id || lead.ownerId || '').trim()) || getLeadOwnerLabel(lead)
              const priority = getLeadPriority(lead)
              const tags = getLeadTags(lead)
              const stageStatus = getLeadStageStatus(lead)
              const isMovePending = Boolean(movingLeadId && leadId === movingLeadId)
              const isStatusUpdating = Boolean(statusUpdatingId && leadId === statusUpdatingId)

              const isSelected = Boolean(leadId && selectedIds.has(leadId))

              return (
                <tr key={leadId} className={`group hover:bg-surface-muted/60 dark:hover:bg-gray-800/50 ${isSelected ? 'bg-primary-50/50 dark:bg-primary-950/15' : ''}`}>
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${leadTitle}`}
                      checked={isSelected}
                      onChange={(event) => toggleLead(leadId, event.target.checked)}
                      className="h-4 w-4 cursor-pointer rounded border-surface-border/80 accent-primary-600 dark:border-gray-600"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => onLeadSelect?.(lead)}
                      className="block max-w-[240px] text-left focus-visible:outline-none"
                      aria-label={`Open ${leadTitle}`}
                    >
                      <div className="truncate text-sm font-semibold text-text-primary transition-colors group-hover:text-primary-700 dark:text-gray-100 dark:group-hover:text-primary-300">
                        {leadTitle}
                      </div>
                    </button>
                    {tags.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} label={tag} colorKey="draft" className="text-[10px]" />
                        ))}
                        {tags.length > 2 ? (
                          <span className="inline-flex items-center rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-text-muted dark:bg-gray-800 dark:text-gray-400">
                            +{tags.length - 2}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block max-w-[180px] truncate text-xs text-text-secondary dark:text-gray-400">
                      {companyLabel || '—'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-text-secondary dark:text-gray-300">
                    {phoneLabel || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block max-w-[220px] truncate text-xs text-text-secondary dark:text-gray-300">
                      {emailLabel || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block max-w-[140px] truncate text-xs font-medium text-text-primary dark:text-gray-100">
                      {ownerLabel || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge label={priority} colorKey={priority} className="text-[10px] uppercase tracking-[0.12em]" />
                  </td>
                  <td className="px-3 py-2.5">
                    {isStatusUpdating ? (
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 dark:text-primary-300">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Saving
                      </div>
                    ) : (
                      <StageStatusSelect
                        stageKey={stage.key}
                        lead={lead}
                        disabled={isMovePending}
                        onStatusChange={(nextStatus) => nextStatus !== stageStatus && onUpdateStageStatus?.(lead, nextStatus)}
                        className="min-w-24"
                      />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-text-primary dark:text-gray-100">
                    {formatCurrency(getLeadDealValue(lead), currency)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-text-secondary dark:text-gray-300">
                    {formatShortDate(lead.created_at || lead.createdAt || lead.created_date)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                    {lead.next_follow_up_at ? (
                      <span className={new Date(lead.next_follow_up_at) < new Date() ? 'font-semibold text-rose-500' : 'text-text-secondary dark:text-gray-300'}>
                        {formatShortDate(lead.next_follow_up_at)}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      {/* {onDeleteLead ? (
                        <button
                          type="button"
                          onClick={() => onDeleteLead(lead)}
                          title="Delete lead permanently"
                          aria-label={`Delete ${leadTitle}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null} */}
                      {getStageKey(stage) === 'acquire' && !lead.phone && !lead.first_contact_at && !lead.last_contacted_at ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onRecordContact?.(lead)}
                        >
                          <Phone className="h-3.5 w-3.5" />
                          Record contact
                        </Button>
                      ) : null}
                      {!lead.transferred_at ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onScheduleFollowUp?.(lead)}
                          title="Schedule Follow-up"
                        >
                          <CalendarClock className="h-3.5 w-3.5" />
                          Follow up
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        loading={isMovePending}
                        loadingText="Updating stage"
                        onClick={() => nextStage && onMoveLeadToStage?.(lead, stage.nextStageKey)}
                        disabled={!nextStage}
                      >
                        <MoveRight className="h-3.5 w-3.5" />
                        {nextStage ? `Move to ${nextStage.name}` : 'Final stage'}
                      </Button>
                       {onDeleteLead ? (
                        <button
                          type="button"
                          onClick={() => onDeleteLead(lead)}
                          title="Delete lead permanently"
                          aria-label={`Delete ${leadTitle}`}
                          className="inline-flex h-7 w-7  items-center justify-center rounded-lg text-red-800 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
  movingLeadId = null,
  statusUpdatingId = null,
  users = [],
  onRecordContact,
  onScheduleFollowUp,
  onMoveLeadToStage,
  onUpdateStageStatus,
  onDeleteLead,
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
      className={`flex max-h-[calc(100vh-15rem)] flex-none flex-col overflow-hidden rounded-xl border border-surface-border/80 bg-surface/95 shadow-sm transition-shadow dark:border-gray-800 dark:bg-gray-900 ${pipelineLeadCardClassNames.column} snap-start ${isOver ? 'ring-2 ring-primary-500/30 shadow-lg' : ''}`}
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
                movingLeadId={movingLeadId}
                statusUpdatingId={statusUpdatingId}
                users={users}
                onMoveLeadToStage={onMoveLeadToStage}
                onUpdateStageStatus={onUpdateStageStatus}
                onRecordContact={onRecordContact}
                onScheduleFollowUp={onScheduleFollowUp}
                onDeleteLead={onDeleteLead}
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
  movingLeadId = null,
  statusUpdatingId = null,
  users = [],
  onMoveLeadToStage,
  onUpdateStageStatus,
  onRecordContact,
  onScheduleFollowUp,
  onDeleteLead,
  allowedStageKeys = new Set(),
  onCopyLeadId,
  onLeadSelect,
}) {
  const tags = getLeadTags(lead)
  const priority = getLeadPriority(lead)
  const ownerLookup = useMemo(() => {
    const values = new Map()
    ;(users || []).forEach((user) => {
      const id = String(user?.id || user?._id || user?.user_id || '').trim()
      const label = getUserDisplayName(user)
      if (id && label) values.set(id, label)
    })
    return values
  }, [users])
  const ownerLabel = ownerLookup.get(String(lead.assigned_to || lead.owner_id || lead.ownerId || '').trim()) || getLeadOwnerLabel(lead)
  const contactLabel = getLeadContactLabel(lead)
  const phoneLabel = [lead.country_code, lead.phone].filter(Boolean).join(' ') || 'No phone'
  const stageStatus = getLeadStageStatus(lead)
  const leadTitle = lead.prospect_name || contactLabel || lead.company_name || 'Lead'
  const leadSubtitle = lead.company_name && lead.company_name !== leadTitle ? lead.company_name : (lead.email || phoneLabel)
  const sortableId = lead.id || lead._id
  const isMovePending = Boolean(movingLeadId && sortableId === movingLeadId)
  const isStatusUpdating = Boolean(statusUpdatingId && sortableId === statusUpdatingId)
  const [menuOpen, setMenuOpen] = useState(false)
  const actionButtonRef = useRef(null)
  const menuRef = useRef(null)
  const [menuPosition, setMenuPosition] = useState(null)
  const stageActions = useMemo(() => {
    const wantedActions = [
      { label: 'Contacted', stageNames: ['Contacted', 'Follow Up Call', 'Follow-Up Call'] },
      { label: 'Qualified', stageNames: ['Qualified', 'Qualification'] },
      { label: 'Discovery', stageNames: ['Discovery', 'Schedule a Meeting', 'Discovery Scheduled'] },
      { label: 'Schedule a Meeting', stageNames: ['Discovery', 'Schedule a Meeting', 'Discovery Scheduled'] },
      { label: 'Proposal', stageNames: ['Proposal', 'Send Proposal', 'Proposal Sent'] },
      { label: 'Send Proposal', stageNames: ['Proposal', 'Send Proposal', 'Proposal Sent'] },
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
  const nextStageLabel = nextStage?.name || nextStage?.label || nextStage?.title || 'next stage'

  useEffect(() => {
    if (!menuOpen) return undefined
    const updatePosition = () => {
      const rect = actionButtonRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = 224
      const margin = 12
      const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin)
      const spaceBelow = window.innerHeight - rect.bottom - margin
      const spaceAbove = rect.top - margin
      const renderAbove = spaceBelow < 180 && spaceAbove > spaceBelow
      const maxHeight = Math.max(180, Math.min(320, (renderAbove ? spaceAbove : spaceBelow) - 8))
      setMenuPosition(
        renderAbove
          ? { bottom: window.innerHeight - rect.top + 8, left, width, maxHeight }
          : { top: rect.bottom + 8, left, width, maxHeight }
      )
    }
    updatePosition()
    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target) && actionButtonRef.current && !actionButtonRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
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
  const menuNode = menuOpen && typeof document !== 'undefined' ? createPortal((
    <div
      ref={menuRef}
      className="fixed z-[9999] overflow-y-auto rounded-2xl border border-surface-border/80 bg-surface/95 p-2 shadow-2xl backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/98"
      style={menuPosition || { width: 224, top: 'auto', left: 'auto', maxHeight: 280 }}
    >
      <ActionItem
        label="Copy lead ID"
        onClick={() => {
          onCopyLeadId?.(lead)
          setMenuOpen(false)
        }}
      />
      {getStageKey(stage) === 'acquire' && !lead.phone && !lead.first_contact_at && !lead.last_contacted_at ? (
        <ActionItem
          label="Record contact attempt"
          onClick={() => {
            onRecordContact?.(lead)
            setMenuOpen(false)
          }}
        />
      ) : null}
      {!lead.transferred_at ? (
        <ActionItem
          label="Schedule Follow-up"
          onClick={() => {
            onScheduleFollowUp?.(lead)
            setMenuOpen(false)
          }}
        />
      ) : null}
      {onDeleteLead ? (
        <ActionItem
          label="Delete lead permanently"
          destructive
          onClick={() => {
            onDeleteLead(lead)
            setMenuOpen(false)
          }}
        />
      ) : null}
      {stageActions.map((action) => (
        <ActionItem
          key={`${action.key}-${action.label}`}
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
  ), document.body) : null

  return (
    <article
      ref={setNodeRef}
      style={leadStyle}
      className="group rounded-xl border border-surface-border bg-surface p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md focus-within:ring-2 focus-within:ring-primary-500/30 dark:border-gray-800 dark:bg-gray-900"
      aria-label={`${leadTitle} lead card`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className={`mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg ${iconTileStyles[Math.abs(String(sortableId || '').length) % iconTileStyles.length]} transition-colors focus-visible:ring-2 focus-visible:ring-primary-500/30`}
          aria-label={`Drag ${leadTitle}`}
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
                {leadTitle}
              </h4>
              <p className="mt-1 truncate text-xs text-text-secondary dark:text-gray-400">
                {leadSubtitle}
              </p>
            </div>
            <div className="inline-flex h-6 min-w-14 items-center justify-center rounded-full border border-dashed border-surface-border/80 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted dark:border-gray-800 dark:text-gray-500">
              AI
            </div>
          </div>
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <LeadMetaRow label="Owner" value={ownerLabel} />
        <LeadMetaRow label="Phone" value={phoneLabel} strong />
        <LeadMetaRow label="Email" value={lead.email || 'No email'} />
        <LeadMetaRow label="Interest" value={<Badge label={priority} colorKey={priority} className="text-[10px]" />} />
        <LeadMetaRow
          label="Status"
          value={isStatusUpdating ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-primary-700 dark:text-primary-300">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Saving
            </span>
          ) : (
            <StageStatusSelect
              stageKey={getStageKey(stage)}
              lead={lead}
              compact
              disabled={isMovePending}
              onStatusChange={(nextStatus) => nextStatus !== stageStatus && onUpdateStageStatus?.(lead, nextStatus)}
              className="w-full"
            />
          )}
        />
        <LeadMetaRow label="Created" value={formatShortDate(lead.created_at || lead.createdAt || lead.created_date)} />
        {lead.next_follow_up_at ? (
          <LeadMetaRow
            label="Follow-up"
            value={formatShortDate(lead.next_follow_up_at)}
            className={new Date(lead.next_follow_up_at) < new Date() ? 'text-rose-500 font-semibold' : ''}
          />
        ) : null}
        <LeadMetaRow label="Stage" value={stage.name} />
      </div>
      <StageProgress stage={stage} stages={stages} />
      {isMovePending ? (
        <div className="mt-3 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700 dark:border-primary-900/60 dark:bg-primary-950/30 dark:text-primary-200">
          Updating stage...
        </div>
      ) : null}

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

      <div className={pipelineLeadCardClassNames.actions}>
        {getStageKey(stage) === 'acquire' && !lead.phone && !lead.first_contact_at && !lead.last_contacted_at ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={pipelineLeadCardClassNames.nextButton}
            onClick={() => onRecordContact?.(lead)}
          >
            <Phone className="h-4 w-4" />
            Record contact
          </Button>
        ) : null}
        {!lead.transferred_at ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={pipelineLeadCardClassNames.actionButton}
            onClick={() => onScheduleFollowUp?.(lead)}
            title="Schedule Follow-up"
          >
            <CalendarClock className="h-4 w-4" />
            Follow up
          </Button>
        ) : null}
        {canMoveNext ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            className={pipelineLeadCardClassNames.nextButton}
            aria-label={`Move ${lead.company_name || contactLabel} to ${nextStageLabel}`}
            loading={isMovePending}
            loadingText="Updating stage"
            onClick={() => onMoveLeadToStage?.(lead, stage.nextStageKey)}
          >
            Move to {nextStageLabel}
          </Button>
        ) : null}
        <div className="relative" ref={actionButtonRef}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={pipelineLeadCardClassNames.actionButton}
            aria-label={`Open actions for ${lead.company_name || contactLabel}`}
            disabled={isMovePending}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal className="h-4 w-4" />
            More actions
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          {menuNode}
        </div>
        <span className={pipelineLeadCardClassNames.stagePill}>
          {stage.name}
        </span>
      </div>
    </article>
  )
})

function LeadMetaRow({ label, value, strong = false, className = '' }) {
  return (
    <div className={`min-w-0 rounded-lg border border-surface-border/70 bg-surface-muted/70 px-2.5 py-2 dark:border-gray-800 dark:bg-gray-950/40 ${className}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted dark:text-gray-500">{label}</span>
      <span className={strong ? 'mt-1 block truncate font-semibold text-text-primary dark:text-gray-100' : 'mt-1 block truncate text-text-secondary dark:text-gray-200'}>
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

function ActionItem({ label, onClick, disabled = false, destructive = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick?.()
      }}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        destructive
          ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40'
          : 'text-text-secondary hover:bg-surface-muted dark:text-gray-200 dark:hover:bg-gray-800'
      }`}
    >
      <span className="min-w-0 truncate">{label}</span>
    </button>
  )
}
