import { ArrowRight } from 'lucide-react'
import {
  PROJECT_HEALTH_FILTERS,
  PROJECT_LIFECYCLE_TABS,
  PROJECT_STAGE_COLORS,
  healthFilterCount,
  tabCount,
} from '../../pages/projectsLifecycle'

const PROJECT_HEALTH_STYLES = {
  healthy: {
    dotClass: 'bg-emerald-500',
    activeClass: 'border-emerald-600 bg-emerald-600 text-white shadow-sm dark:border-emerald-500 dark:bg-emerald-600',
  },
  needs_attention: {
    dotClass: 'bg-amber-500',
    activeClass: 'border-amber-500 bg-amber-500 text-white shadow-sm dark:border-amber-500 dark:bg-amber-500',
  },
  at_risk: {
    dotClass: 'bg-red-500',
    activeClass: 'border-red-500 bg-red-600 text-white shadow-sm dark:border-red-500 dark:bg-red-600',
  },
  needs_setup: {
    dotClass: 'bg-slate-400',
    activeClass: 'border-slate-500 bg-slate-600 text-white shadow-sm dark:border-slate-500 dark:bg-slate-600',
  },
}

/**
 * Lifecycle stage pipeline + independent health/attention quick filters.
 * Every lifecycle stage is its own isolated transparent node chip with a
 * status-colored dot and arrows between consecutive stages; clicking a stage
 * filters the list via the same URL-driven status param as the tabs did.
 * Health / Needs Setup are a separate chip row and never mix with lifecycle.
 */
export default function ProjectLifecycleTabs({
  current = '',
  activeHealth = '',
  activeAttention = '',
  summary = null,
  onSelectStatus,
  onSelectHealth,
}) {
  const pipelineTabs = PROJECT_LIFECYCLE_TABS.filter((tab) => tab.id)

  const renderStageChip = (tab) => {
    const isActive = current === tab.id
    const count = tabCount(summary, tab.id)
    const stageColor = PROJECT_STAGE_COLORS[tab.id] || '#6366F1'
    return (
      <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={isActive}
        onClick={() => onSelectStatus?.(tab.id)}
        title={`Show ${tab.label} projects`}
        className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all ${
          isActive
            ? 'border-transparent text-white shadow-sm'
            : 'border-gray-200/70 bg-white/70 text-gray-700 backdrop-blur-sm hover:border-gray-300 hover:bg-white hover:shadow-sm dark:border-gray-600/50 dark:bg-gray-900/40 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:bg-gray-800'
        }`}
        style={isActive ? { backgroundColor: stageColor } : undefined}
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.9)' : stageColor }} />
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
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Project lifecycle stages"
        className="flex items-center overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <button
          key="all"
          type="button"
          role="tab"
          aria-selected={current === '' && !activeHealth && !activeAttention}
          onClick={() => onSelectStatus?.('')}
          title="Show all projects"
          className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all ${
            current === '' && !activeHealth && !activeAttention
              ? 'border-gray-700 bg-gray-800 text-white shadow-sm dark:border-gray-500 dark:bg-gray-700'
              : 'border-transparent text-gray-500 hover:bg-white/70 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800/80 dark:hover:text-gray-200'
          }`}
        >
          <span>All Projects</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
              current === '' && !activeHealth && !activeAttention ? 'bg-white/25 text-white' : 'bg-gray-200/90 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
            }`}
          >
            {tabCount(summary, '')}
          </span>
        </button>
        <span className="mx-1.5 w-px shrink-0 self-stretch bg-gray-300/80 dark:bg-gray-600/70" aria-hidden="true" />
        {pipelineTabs.map((tab, index) => (
          <div key={tab.id} className="flex shrink-0 items-center">
            {index > 0 ? (
              <span aria-hidden="true" className="mx-1 text-gray-300 dark:text-gray-600">
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            ) : null}
            {renderStageChip(tab)}
          </div>
        ))}
      </div>

      {/* Health / Needs Setup quick filters - independent from lifecycle.
          Styled as fully-rounded pill tags with a visible border so they read
          as secondary quick filters, distinct from the squarer (rounded-lg)
          lifecycle stage chips with arrows above. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PROJECT_HEALTH_FILTERS.map((filter) => {
          const isActive = filter.kind === 'health'
            ? activeHealth === filter.id
            : activeAttention === filter.id
          const styles = PROJECT_HEALTH_STYLES[filter.id] || PROJECT_HEALTH_STYLES.needs_setup
          const count = healthFilterCount(summary, filter)
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => onSelectHealth?.(filter)}
              title={filter.kind === 'attention' ? 'Projects without an execution plan yet' : `Filter by ${filter.label} health`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                isActive
                  ? styles.activeClass
                  : 'border-gray-200/80 bg-white/40 text-gray-600 hover:border-gray-300 hover:bg-white/70 hover:text-gray-900 dark:border-gray-600/50 dark:bg-gray-900/30 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-800/70 dark:hover:text-gray-100'
              }`}
            >
              <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? 'bg-white/90' : styles.dotClass}`} />
              <span>{filter.label}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                isActive ? 'bg-white/25 text-white' : 'bg-transparent text-gray-400 dark:text-gray-500'
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
