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
    const handleScroll = () => {
      onCollapse?.()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [collapsed, onCollapse])

  if (!sections.length) return null

  return (
    <section
      ref={panelRef}
      className={`self-end overflow-hidden rounded-2xl border border-primary-200/70 bg-[rgba(255,248,238,0.98)] shadow-[0_16px_42px_rgba(63,49,37,0.18)] transition-all duration-300 dark:border-[#5a4635] dark:bg-[rgba(26,20,15,0.98)] dark:shadow-[0_18px_42px_rgba(0,0,0,0.42)] ${
        collapsed ? 'w-auto max-w-full' : 'w-full max-w-[26rem]'
      }`}
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

      {!collapsed ? (
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

          <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {filteredSections.length ? filteredSections.map((section, index) => {
              const isVisible = visibility[section.id] !== false
              return (
                <div
                  key={section.id}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
                    isVisible
                      ? 'border-primary-200/80 bg-white/80 dark:border-[#5a4635] dark:bg-[#221912]'
                      : 'border-dashed border-gray-200 bg-white/50 opacity-70 dark:border-gray-700 dark:bg-black/20'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onToggleSection?.(section.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span aria-hidden="true" className="text-gray-400">⋮⋮</span>
                    <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{section.name}</span>
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
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() => onToggleSection?.(section.id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900"
                    />
                    {isVisible ? 'Visible' : 'Hidden'}
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
      ) : (
        <div className="px-4 py-3">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="inline-flex items-center gap-2 rounded-xl border border-primary-200/70 bg-white/80 px-3 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-white dark:border-[#5a4635] dark:bg-[#221912] dark:text-gray-100 dark:hover:bg-[#2a1f17]"
          >
            Open dashboard sections
          </button>
        </div>
      )}
    </section>
  )
}
