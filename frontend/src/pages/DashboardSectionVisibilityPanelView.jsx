import { useEffect, useMemo, useRef } from 'react'
import { 
  ChevronUp, 
  ChevronDown, 
  Eye, 
  EyeOff, 
  Search, 
  Layout, 
  Check, 
  X,
  GripVertical,
  Layers,
  Settings2,
  PanelRight,
  PanelRightClose,
  PanelRightOpen
} from 'lucide-react'

export function DashboardSectionVisibilityPanel({
  sections = [],
  visibility = {},
  visibleCount = 0,
  collapsed = true,
  search = '',
  onSearchChange,
  onToggleCollapsed,
  onCollapse,
  onToggleSection,
  onNudgeSection,
  onSelectAll,
  onClearAll,
}) {
  const panelRef = useRef(null)
  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sections
    return sections.filter((section) => {
      const text = [section.name, section.id, section.description, section.tags?.join(' ')]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return text.includes(q)
    })
  }, [search, sections])

  useEffect(() => {
    if (collapsed) return undefined
    const handlePointerDown = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        onCollapse?.()
      }
    }
    const handleScroll = (event) => {
      const target = event.target
      if (target instanceof Node && panelRef.current?.contains(target)) return
      onCollapse?.()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true })
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('scroll', handleScroll, { capture: true })
    }
  }, [collapsed, onCollapse])

  // Get color for section based on index
  const getSectionColor = (index) => {
    const colors = [
      'from-indigo-500 to-purple-500',
      'from-blue-500 to-cyan-500',
      'from-emerald-500 to-teal-500',
      'from-amber-500 to-orange-500',
      'from-rose-500 to-pink-500',
      'from-violet-500 to-purple-500',
      'from-fuchsia-500 to-pink-500',
      'from-cyan-500 to-blue-500',
    ]
    return colors[index % colors.length]
  }

  if (!sections.length) return null

  if (collapsed) {
    return (
      <aside
        ref={panelRef}
        role="region"
        className="fixed bottom-6 right-6 z-40 xl:bottom-auto xl:top-24"
        aria-label="Dashboard sections"
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded="false"
          aria-label="Open dashboard sections"
          className="group inline-flex min-h-12 items-center gap-2.5 rounded-2xl border border-indigo-200/70 bg-white/95 px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-lg shadow-indigo-500/10 backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-indigo-800/50 dark:bg-gray-900/95 dark:text-gray-200 dark:shadow-indigo-500/5 dark:hover:border-indigo-700 dark:hover:shadow-indigo-500/10"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/30">
            <Layers className="h-3.5 w-3.5" />
          </span>
          <span>Sections</span>
          <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
            {visibleCount}/{sections.length}
          </span>
          <PanelRightOpen className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-0.5 dark:text-gray-500" />
        </button>
      </aside>
    )
  }

  return (
    <aside
      ref={panelRef}
      role="region"
      onWheelCapture={(event) => event.stopPropagation()}
      onTouchMoveCapture={(event) => event.stopPropagation()}
      className="fixed bottom-6 right-6 z-40 w-[min(calc(100vw-2rem),28rem)] overflow-hidden rounded-2xl border border-indigo-200/70 bg-white/98 shadow-2xl shadow-indigo-500/15 backdrop-blur-xl transition-all duration-300 dark:border-indigo-800/50 dark:bg-gray-900/98 dark:shadow-indigo-500/5 xl:bottom-auto xl:top-24"
      aria-label="Dashboard sections"
    >
      {/* Header */}
      <div className="border-b border-indigo-100/60 bg-gradient-to-r from-indigo-50/80 to-white px-5 py-4 dark:border-indigo-800/30 dark:from-indigo-950/30 dark:to-gray-900">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/30">
                <Settings2 className="h-4 w-4" />
              </div>
              <h2 className="truncate text-sm font-bold text-gray-900 dark:text-white">
                Dashboard Sections
              </h2>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                {visibleCount}/{sections.length}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Show, hide, reorder, or jump to a section
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200/60 bg-white text-gray-500 transition-all hover:bg-indigo-50 hover:text-indigo-600 dark:border-indigo-800/30 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400"
            aria-label="Close panel"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-3 px-5 py-4 max-h-[60vh] overflow-y-auto">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder="Find section..."
            aria-label="Search dashboard sections"
            className="w-full rounded-xl border border-indigo-200/60 bg-indigo-50/50 pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-indigo-800/30 dark:bg-indigo-950/20 dark:text-white dark:placeholder:text-gray-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange?.('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200/60 bg-white px-3 py-1.5 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 dark:border-indigo-800/30 dark:bg-gray-800 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
          >
            <Check className="h-3.5 w-3.5" />
            Select All
          </button>
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200/60 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700/30 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700/50"
          >
            <X className="h-3.5 w-3.5" />
            Deselect All
          </button>
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
            {filteredSections.length} section{filteredSections.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Sections List */}
        <div className="space-y-2">
          {filteredSections.length ? (
            filteredSections.map((section, index) => {
              const isVisible = visibility[section.id] !== false
              const color = getSectionColor(index)
              
              return (
                <div
                  key={section.id}
                  className={`group relative overflow-hidden rounded-xl border transition-all duration-200 ${
                    isVisible
                      ? 'border-indigo-200/70 bg-white/90 shadow-sm hover:border-indigo-300 hover:shadow-md dark:border-indigo-800/40 dark:bg-gray-800/90 dark:hover:border-indigo-700'
                      : 'border-dashed border-gray-200/60 bg-gray-50/50 opacity-75 hover:opacity-90 dark:border-gray-700/40 dark:bg-gray-900/50'
                  }`}
                >
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    {/* Drag Handle */}
                    <div className="flex-none cursor-grab text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400">
                      <GripVertical className="h-4 w-4" />
                    </div>

                    {/* Section Number */}
                    <div className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-gradient-to-br ${color} text-white text-xs font-bold shadow-lg shadow-indigo-500/20`}>
                      {index + 1}
                    </div>

                    {/* Section Info */}
                    <button
                      type="button"
                      onClick={() => onToggleSection?.(section.id)}
                      className="min-w-0 flex-1 text-left"
                      aria-pressed={isVisible}
                    >
                      <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {section.name}
                      </span>
                      <span className={`mt-0.5 block text-[11px] font-medium ${
                        isVisible 
                          ? 'text-indigo-600 dark:text-indigo-400' 
                          : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        {isVisible ? (
                          <span className="inline-flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            Shown on dashboard
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <EyeOff className="h-3 w-3" />
                            Hidden from dashboard
                          </span>
                        )}
                      </span>
                    </button>

                    {/* Reorder Buttons */}
                    <div className="flex flex-none items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => onNudgeSection?.(section.id, -1)}
                        disabled={index === 0}
                        className="rounded p-1.5 text-gray-400 transition-colors hover:bg-indigo-100 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-500 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400"
                        aria-label={`Move ${section.name} up`}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onNudgeSection?.(section.id, 1)}
                        disabled={index === filteredSections.length - 1}
                        className="rounded p-1.5 text-gray-400 transition-colors hover:bg-indigo-100 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-500 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400"
                        aria-label={`Move ${section.name} down`}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Toggle Switch */}
                    <label className="relative inline-flex h-6 w-11 flex-none cursor-pointer items-center rounded-full transition-colors">
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={() => onToggleSection?.(section.id)}
                        className="peer sr-only"
                        aria-label={`${isVisible ? 'Hide' : 'Show'} ${section.name}`}
                      />
                      <span className={`absolute inset-0 rounded-full transition-colors ${
                        isVisible 
                          ? 'bg-indigo-600 shadow-lg shadow-indigo-500/30 dark:bg-indigo-500' 
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`} />
                      <span className={`absolute left-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-gray-400 shadow-sm transition-transform ${
                        isVisible ? 'translate-x-5' : 'translate-x-0'
                      }`}>
                        {isVisible ? (
                          <Check className="h-3 w-3 text-indigo-600" />
                        ) : (
                          <X className="h-3 w-3 text-gray-400" />
                        )}
                      </span>
                    </label>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="rounded-xl border-2 border-dashed border-gray-200 px-4 py-10 text-center dark:border-gray-700">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                <Search className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No sections match your search</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Try adjusting your search terms</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-indigo-100/60 bg-indigo-50/30 px-5 py-3 dark:border-indigo-800/30 dark:bg-indigo-950/10">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            <Layout className="h-3.5 w-3.5" />
            {visibleCount} visible of {sections.length} sections
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
            Active
          </span>
        </div>
      </div>
    </aside>
  )
}