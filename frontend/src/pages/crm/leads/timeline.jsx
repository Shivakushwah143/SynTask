import { memo, useMemo } from 'react'
import {
  ArrowRightLeft,
  BadgeInfo,
  ChevronDown,
  Filter,
  FileText,
  History,
  Mail,
  MessageSquare,
  Search,
  Sparkles,
  Users,
  Video,
} from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import { CRMEmptyState, CRMSection } from '../../../components/crm'
import { Badge, Button, EmptyState } from '../../../components/ui'

const TIMELINE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'system', label: 'System' },
  { key: 'sales', label: 'Sales' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'files', label: 'Files' },
  { key: 'comments', label: 'Comments' },
  { key: 'future_ai', label: 'Future AI' },
]

const TIMELINE_ICON_MAP = {
  lead_created: Users,
  lead_updated: BadgeInfo,
  lead_stage_changed: ArrowRightLeft,
  meeting_scheduled: Video,
  meeting_completed: Video,
  comment_added: MessageSquare,
  file_uploaded: FileText,
  proposal_sent: FileText,
  deal_won: BadgeInfo,
  deal_lost: History,
  future_ai_review: Sparkles,
  future_email_activity: Mail,
}

const TIMELINE_CATEGORY_LABELS = {
  system: 'System',
  sales: 'Sales',
  meetings: 'Meetings',
  files: 'Files',
  comments: 'Comments',
  future_ai: 'Future AI',
}

const formatTimestamp = (value) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return format(date, 'MMM d, yyyy h:mm a')
}

const formatDayLabel = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown day'
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE, MMM d, yyyy')
}

const buildSearchIndex = (item) => {
  const metadataText = item?.metadata ? JSON.stringify(item.metadata) : ''
  return [
    item?.title,
    item?.description,
    item?.actor,
    item?.category,
    item?.type,
    metadataText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

const getTimelineIcon = (type) => TIMELINE_ICON_MAP[type] || History

const getCategoryBadgeTone = (category) => {
  if (category === 'sales') return 'active'
  if (category === 'meetings') return 'scheduled'
  if (category === 'files') return 'draft'
  if (category === 'comments') return 'in_progress'
  if (category === 'future_ai') return 'draft'
  return 'draft'
}

const getIconToneClasses = (category) => {
  if (category === 'sales') return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300'
  if (category === 'meetings') return 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300'
  if (category === 'files') return 'bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
  if (category === 'comments') return 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'
  if (category === 'future_ai') return 'bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300'
  return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
}

const groupItemsByDay = (items) => {
  const groups = []
  const lookup = new Map()

  items.forEach((item) => {
    const timestamp = item?.timestamp ? new Date(item.timestamp) : null
    if (!timestamp || Number.isNaN(timestamp.getTime())) return
    const dayKey = format(timestamp, 'yyyy-MM-dd')
    if (!lookup.has(dayKey)) {
      const group = {
        key: dayKey,
        label: formatDayLabel(timestamp),
        items: [],
      }
      lookup.set(dayKey, group)
      groups.push(group)
    }
    lookup.get(dayKey).items.push(item)
  })

  return groups
}

export const LeadTimelineTab = memo(function LeadTimelineTab({
  items = [],
  summary = {},
  searchValue = '',
  onSearchChange,
  activeFilter = 'all',
  onFilterChange,
  isLoading = false,
  errorMessage = '',
  onRetry,
}) {
  const filteredItems = useMemo(() => {
    const query = String(searchValue || '').trim().toLowerCase()
    return items.filter((item) => {
      if (activeFilter !== 'all' && item?.category !== activeFilter) return false
      if (!query) return true
      return buildSearchIndex(item).includes(query)
    })
  }, [activeFilter, items, searchValue])

  const groupedItems = useMemo(() => groupItemsByDay(filteredItems), [filteredItems])

  const counts = useMemo(
    () => TIMELINE_FILTERS.reduce((acc, filter) => {
      if (filter.key === 'all') {
        acc[filter.key] = items.length
        return acc
      }
      acc[filter.key] = items.filter((item) => item?.category === filter.key).length
      return acc
    }, {}),
    [items]
  )

  if (isLoading) {
    return (
      <CRMSection title="Timeline" description="Loading the lead activity stream.">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="h-11 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
            <div className="flex gap-2">
              <div className="h-11 w-24 animate-pulse rounded-full bg-gray-100 dark:bg-gray-800" />
              <div className="h-11 w-24 animate-pulse rounded-full bg-gray-100 dark:bg-gray-800" />
            </div>
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
        </div>
      </CRMSection>
    )
  }

  if (errorMessage) {
    return (
      <CRMSection title="Timeline" description="Could not load the lead activity stream.">
        <EmptyState
          icon={History}
          title="Timeline unavailable"
          description={errorMessage}
          action={(
            <Button type="button" variant="primary" onClick={onRetry}>
              Retry
            </Button>
          )}
        />
      </CRMSection>
    )
  }

  return (
    <div className="space-y-6">
      <CRMSection title="Timeline" description="A unified activity stream for this lead.">
        <div className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={searchValue}
                onChange={(event) => onSearchChange?.(event.target.value)}
                className="input w-full pl-10"
                aria-label="Search lead timeline"
                placeholder="Search timeline"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              {TIMELINE_FILTERS.map((filter) => {
                const active = activeFilter === filter.key
                const count = counts[filter.key] ?? 0
                return (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => onFilterChange?.(filter.key)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-900/70 dark:bg-primary-950/60 dark:text-primary-200'
                        : 'border-surface-border/80 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                    }`}
                  >
                    <span>{filter.label}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <TimelineSummaryCard label="Total" value={summary.total ?? items.length} tone="slate" />
            <TimelineSummaryCard label="Sales" value={summary.sales ?? 0} tone="emerald" />
            <TimelineSummaryCard label="System" value={summary.system ?? 0} tone="blue" />
            <TimelineSummaryCard label="Last activity" value={formatTimestamp(summary.last_activity_at)} tone="amber" />
          </div>
        </div>
      </CRMSection>

      {filteredItems.length ? (
        <CRMSection title="Activity stream" description="Grouped by day in reverse chronological order.">
          <ol role="list" className="space-y-6">
            {groupedItems.map((group) => (
              <li key={group.key} className="space-y-3">
                <div className="sticky top-4 z-10 inline-flex rounded-full border border-surface-border/80 bg-white/95 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/90 dark:text-gray-400">
                  {group.label}
                </div>

                <ol role="list" className="space-y-3">
                  {group.items.map((item) => {
                    const Icon = getTimelineIcon(item.type)
                    return (
                      <li key={item.id} className="rounded-3xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="flex gap-4">
                          <div className={`mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${getIconToneClasses(item.category)}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.title}</h3>
                                  <Badge label={TIMELINE_CATEGORY_LABELS[item.category] || item.category || 'System'} colorKey={getCategoryBadgeTone(item.category)} />
                                </div>
                                <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{item.description}</p>
                              </div>
                              <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                                <p>{item.actor || 'System'}</p>
                                <p className="mt-1">{formatTimestamp(item.timestamp)}</p>
                              </div>
                            </div>

                            <details className="group mt-4 rounded-2xl border border-dashed border-surface-border/80 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-gray-700 outline-none group-open:mb-3 dark:text-gray-200">
                                <span>Details</span>
                                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                              </summary>
                              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {Object.entries(item.metadata || {}).map(([key, value]) => (
                                  <article key={key} className="rounded-2xl border border-surface-border/70 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">{key.replace(/_/g, ' ')}</p>
                                    <p className="mt-2 break-words text-sm text-gray-900 dark:text-gray-100">
                                      {renderMetadataValue(value)}
                                    </p>
                                  </article>
                                ))}
                              </div>
                            </details>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </li>
            ))}
          </ol>
        </CRMSection>
      ) : (
        <CRMSection title="Timeline" description="No activities match the current search or filter.">
          <CRMEmptyState
            icon={History}
            title="No matching activity"
            description="Clear the search or switch filters to see the full lead history."
            action={(
              <Button type="button" variant="secondary" onClick={() => {
                onSearchChange?.('')
                onFilterChange?.('all')
              }}
              >
                Show all activity
              </Button>
            )}
          />
        </CRMSection>
      )}
    </div>
  )
})

function TimelineSummaryCard({ label, value, tone }) {
  const tones = {
    slate: 'from-slate-50 to-white text-slate-600 ring-slate-100 dark:from-slate-900 dark:to-gray-900 dark:text-slate-300 dark:ring-slate-800',
    blue: 'from-blue-50 to-white text-blue-600 ring-blue-100 dark:from-blue-950/40 dark:to-gray-900 dark:text-blue-300 dark:ring-blue-900/40',
    emerald: 'from-emerald-50 to-white text-emerald-600 ring-emerald-100 dark:from-emerald-950/40 dark:to-gray-900 dark:text-emerald-300 dark:ring-emerald-900/40',
    amber: 'from-amber-50 to-white text-amber-600 ring-amber-100 dark:from-amber-950/40 dark:to-gray-900 dark:text-amber-300 dark:ring-amber-900/40',
    purple: 'from-purple-50 to-white text-purple-600 ring-purple-100 dark:from-purple-950/40 dark:to-gray-900 dark:text-purple-300 dark:ring-purple-900/40',
  }

  return (
    <article className={`rounded-2xl border border-surface-border/80 bg-gradient-to-br p-4 shadow-sm dark:border-gray-800 ${tones[tone] || tones.slate}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{value}</p>
    </article>
  )
}

function renderMetadataValue(value) {
  if (value === null || value === undefined || value === '') return 'N/A'
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'N/A'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}
