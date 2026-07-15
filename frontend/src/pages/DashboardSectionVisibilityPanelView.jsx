import { useEffect, useMemo, useRef } from 'react'

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

  if (!sections.length) return null

  if (collapsed) {
    return (
      <aside
        ref={panelRef}
        className="fixed bottom-4 right-4 z-40 xl:bottom-auto xl:top-24"
        aria-label="Dashboard sections"
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded="false"
          aria-label={`Open dashboard sections, ${visibleCount} of ${sections.length} visible`}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary-200/70 bg-[rgba(255,248,238,0.76)] px-3 py-2 text-sm font-semibold text-gray-800 opacity-75 shadow-[0_16px_42px_rgba(63,49,37,0.14)] backdrop-blur-xl transition-all duration-200 hover:bg-[rgba(255,248,238,0.98)] hover:opacity-100 hover:shadow-[0_16px_42px_rgba(63,49,37,0.2)] focus-visible:bg-[rgba(255,248,238,0.98)] focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:border-[#5a4635] dark:bg-[rgba(26,20,15,0.76)] dark:text-gray-100 dark:hover:bg-[rgba(26,20,15,0.98)] dark:focus-visible:bg-[rgba(26,20,15,0.98)]"
        >
          <span aria-hidden="true" className="text-base leading-none">☰</span>
          <span>Sections</span>
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-700 dark:bg-primary-950 dark:text-primary-200">
            {visibleCount}/{sections.length}
          </span>
        </button>
      </aside>
    )
  }

  return (
    <aside
      ref={panelRef}
      onWheelCapture={(event) => event.stopPropagation()}
      onTouchMoveCapture={(event) => event.stopPropagation()}
      className="fixed bottom-4 right-4 z-40 w-[min(calc(100vw-2rem),26rem)] overflow-hidden rounded-2xl border border-primary-200/70 bg-[rgba(255,248,238,0.98)] shadow-[0_16px_42px_rgba(63,49,37,0.18)] backdrop-blur-xl transition-all duration-300 dark:border-[#5a4635] dark:bg-[rgba(26,20,15,0.98)] dark:shadow-[0_18px_42px_rgba(0,0,0,0.42)] xl:bottom-auto xl:top-24"
      aria-label="Dashboard sections"
    >
      <div className="flex items-center justify-between gap-3 border-b border-primary-200/60 px-4 py-3 dark:border-[#5a4635]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">Dashboard Sections {visibleCount}/{sections.length}</h2>
          </div>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Show, hide, reorder, or jump to a section</p>
        </div>
        <button type="button" onClick={onToggleCollapsed} aria-expanded={!collapsed} className="rounded border px-3 py-1 text-sm">
          {collapsed ? 'Open' : 'Close'}
        </button>
      </div>

      <div className="space-y-3 px-4 py-4">
          <div className="relative">
            <input
              value={search}
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder="Find section"
              aria-label="Search dashboard sections"
              className="input w-full"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onSelectAll} className="rounded border px-3 py-1.5 text-sm">Select All</button>
            <button type="button" onClick={onClearAll} className="rounded border px-3 py-1.5 text-sm">Deselect All</button>
          </div>

          <div className="max-h-[28rem] space-y-2 overflow-y-auto overscroll-contain pr-1">
            {filteredSections.length ? filteredSections.map((section, index) => {
              const isVisible = visibility[section.id] !== false
              return (
                <div
                  key={section.id}
                  className={`group flex items-center gap-2 rounded-xl border px-3 py-2.5 shadow-sm transition-all duration-200 ${
                    isVisible
                      ? 'border-primary-200/80 bg-white/90 shadow-primary-100/40 hover:border-primary-300 hover:bg-primary-50/60 dark:border-[#6f553f] dark:bg-[#251b13] dark:hover:border-primary-700 dark:hover:bg-primary-950/20'
                      : 'border-dashed border-gray-200 bg-white/55 opacity-75 hover:opacity-95 dark:border-gray-700 dark:bg-black/20'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onToggleSection?.(section.id)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    aria-pressed={isVisible}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                        isVisible
                          ? 'bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-200'
                          : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{section.name}</span>
                      <span className={`mt-0.5 block text-[11px] font-medium ${isVisible ? 'text-primary-700 dark:text-primary-200' : 'text-gray-400 dark:text-gray-500'}`}>
                        {isVisible ? 'Shown on dashboard' : 'Hidden from dashboard'}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNudgeSection?.(section.id, -1)}
                    disabled={index === 0}
                    className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
                    aria-label={`Move ${section.name} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => onNudgeSection?.(section.id, 1)}
                    disabled={index === filteredSections.length - 1}
                    className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
                    aria-label={`Move ${section.name} down`}
                  >
                    ↓
                  </button>
                  <label className="relative inline-flex h-7 w-12 flex-none cursor-pointer items-center rounded-full">
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() => onToggleSection?.(section.id)}
                      className="peer sr-only"
                      aria-label={`${isVisible ? 'Hide' : 'Show'} ${section.name}`}
                    />
                    <span className="absolute inset-0 rounded-full bg-gray-200 shadow-inner transition-colors peer-checked:bg-primary-600 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-500 dark:bg-gray-800 dark:peer-checked:bg-primary-500" />
                    <span className="absolute left-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-gray-400 shadow transition-transform peer-checked:translate-x-5 peer-checked:text-primary-600">
                      {isVisible ? '✓' : ''}
                    </span>
                  </label>
                </div>
              )
            }) : (
              <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No sections match your search.
              </div>
            )}
          </div>
      </div>
    </aside>
  )
}
