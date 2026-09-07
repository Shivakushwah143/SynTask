import { ArrowRight } from 'lucide-react'
import { LIFECYCLE_TABS, tabCount } from '../../pages/tasksLifecycle'

// Status accent colors used for the stage dots and the active node fill.
const STAGE_COLORS = {
  todo: '#7C6FE0',
  assigned: '#6366F1',
  in_progress: '#FF8A4C',
  in_review: '#F59E0B',
  revision_required: '#EF4444',
  approved: '#10B981',
  completed: '#2FB47C',
  cancelled: '#9CA3AF',
}

/**
 * Task lifecycle strip rendered as a stage pipeline: every stage is its own
 * isolated (transparent) node chip with a status-colored dot, arrows flow
 * between consecutive stages (To Do → … → Completed), and All Tasks /
 * Cancelled stay as plain quick chips. The active node fills with its stage
 * color. Behavior mirrors the previous tab bar: same counts, URL filtering via
 * onSelect, aria-selected, and tooltips.
 */
export default function TaskLifecyclePipeline({
  current = '',
  attentionActive = false,
  summary = null,
  onSelect,
  tooltipSuffix = '',
}) {
  const leadingTab = LIFECYCLE_TABS.find((tab) => !tab.id) || { id: '', label: 'All Tasks' }
  const cancelledTab = LIFECYCLE_TABS.find((tab) => tab.id === 'cancelled') || null
  const pipelineTabs = LIFECYCLE_TABS.filter((tab) => tab.id && tab.id !== 'cancelled')

  const renderChip = (tab) => {
    const isActive = current === tab.id && !attentionActive
    const count = tabCount(summary, tab.id)
    const stageColor = STAGE_COLORS[tab.id] || '#6366F1'
    const isPlain = !tab.id || tab.id === 'cancelled'
    return (
      <button
        key={tab.id || 'all'}
        type="button"
        role="tab"
        aria-selected={isActive}
        onClick={() => onSelect?.(tab.id)}
        title={`Show ${tab.label}${tooltipSuffix}`}
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
      aria-label="Task lifecycle stages"
      className="flex items-center overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {renderChip(leadingTab)}
      <span className="mx-1.5 w-px shrink-0 self-stretch bg-gray-300/80 dark:bg-gray-600/70" aria-hidden="true" />
      {pipelineTabs.map((tab, index) => (
        <div key={tab.id} className="flex shrink-0 items-center">
          {index > 0 ? (
            <span aria-hidden="true" className="mx-1 text-gray-300 dark:text-gray-600">
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          ) : null}
          {renderChip(tab)}
        </div>
      ))}
      {cancelledTab ? (
        <>
          <span className="mx-1.5 w-px shrink-0 self-stretch bg-gray-300/80 dark:bg-gray-600/70" aria-hidden="true" />
          {renderChip(cancelledTab)}
        </>
      ) : null}
    </div>
  )
}
