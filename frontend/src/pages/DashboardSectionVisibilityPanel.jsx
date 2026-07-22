import { useEffect, useRef, useState } from 'react'

export function DashboardSectionVisibilityPanel({
  sections,
  visibility,
  visibleCount,
  collapsed,
  search,
  onSearchChange,
  onToggleCollapsed,
  onCollapse,
  onToggleSection,
  onMoveSection,
  onNudgeSection,
  onSelectAll,
  onClearAll,
}) {
  const panelRef = useRef(null)
  const [draggingId, setDraggingId] = useState(null)
  const filteredSections = sections.filter((section) =>
    section.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  useEffect(() => {
    if (collapsed) return undefined

    const handlePointerDown = (event) => {
      if (panelRef.current?.contains(event.target)) return
      onCollapse?.()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [collapsed, onCollapse])

  useEffect(() => {
    if (collapsed) return undefined

    const handleScroll = (event) => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || event.target?.scrollY || 0
      if (scrollY > 24) onCollapse?.()
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [collapsed, onCollapse])

  if (collapsed) {
    return (
      <aside
        ref={panelRef}
        aria-label="Dashboard section visibility controls"
        className="fixed bottom-8 right-8 z-[9999] xl:bottom-auto xl:top-28"
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Show dashboard sections"
          aria-expanded="false"
          title="Show dashboard sections"
          className="group relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-white via-gray-50 to-gray-100/90 text-3xl font-light text-gray-700 shadow-2xl shadow-gray-300/40 backdrop-blur-xl transition-all duration-300 hover:scale-110 hover:shadow-2xl hover:shadow-blue-500/20 dark:from-[rgb(29_24_19_/_0.98)] dark:via-[rgb(29_24_19_/_0.95)] dark:to-[rgb(29_24_19_/_0.9)] dark:text-gray-200 dark:shadow-black/50 dark:hover:shadow-blue-500/20"
        >
          <span className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 text-xs font-bold text-white shadow-lg shadow-blue-500/40 ring-2 ring-white dark:ring-gray-800">
            {visibleCount}
          </span>
          <span className="transition-transform duration-300 group-hover:rotate-90 group-hover:scale-110">☰</span>
          <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/0 to-indigo-500/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </button>
      </aside>
    )
  }

  return (
    <aside
      ref={panelRef}
      aria-label="Dashboard section visibility controls"
      className="fixed bottom-8 right-8 z-[9999] w-[min(calc(100vw-2.5rem),24rem)] xl:top-28 xl:w-[28rem]"
    >
      <div className="overflow-hidden rounded-3xl border border-gray-200/50 bg-white/95 shadow-2xl shadow-gray-300/30 backdrop-blur-2xl transition-all duration-300 dark:border-[var(--color-app-border)] dark:bg-[rgb(29_24_19_/_0.98)] dark:shadow-black/60">
        {/* Header */}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Hide dashboard sections"
          aria-expanded="true"
          title="Hide dashboard sections"
          className="group flex w-full items-center justify-between gap-3 border-b border-gray-200/50 bg-gradient-to-r from-gray-50/50 to-transparent p-5 text-sm font-semibold text-gray-800 transition-all hover:bg-gray-50/80 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-muted)] dark:text-[var(--color-app-text)] dark:hover:bg-[var(--color-app-surface-muted)]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/30">
              <span className="text-lg">☰</span>
            </div>
            <span className="text-base font-bold">Sections</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-blue-500/30">
              {visibleCount}/{sections.length}
            </span>
            <span className="text-2xl text-gray-300 transition-transform duration-300 group-hover:translate-x-1 dark:text-[var(--color-app-text-muted)]">›</span>
          </div>
        </button>

        {/* Content */}
        <div className="space-y-4 p-5">
          {/* Search */}
          <div className="relative flex items-center gap-3 rounded-2xl border border-gray-200/50 bg-gray-50/80 px-4 py-3 transition-all focus-within:border-blue-400 focus-within:bg-white focus-within:shadow-lg focus-within:shadow-blue-500/10 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-muted)] dark:focus-within:bg-[rgb(29_24_19)]">
            <span className="text-gray-400 dark:text-[var(--color-app-text-muted)]">🔍</span>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search sections..."
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
              aria-label="Search dashboard sections"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-[var(--color-app-surface-muted)]"
              >
                ✕
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onSelectAll}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 text-xs font-semibold text-blue-600 transition-all hover:from-blue-100 hover:to-indigo-100 dark:bg-blue-950/30 dark:text-blue-400 dark:hover:bg-blue-950/50"
            >
              <span>✓</span> Select All
            </button>
            <button
              type="button"
              onClick={onClearAll}
              className="flex items-center gap-1.5 rounded-xl bg-gray-100/50 px-4 py-2 text-xs font-semibold text-gray-500 transition-all hover:bg-gray-200/80 hover:text-gray-700 dark:bg-[var(--color-app-surface-muted)] dark:text-[var(--color-app-text-muted)] dark:hover:bg-[var(--color-app-surface-muted)]"
            >
              <span>✕</span> Clear All
            </button>
          </div>

          {/* Section List */}
          <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1.5 xl:max-h-[58vh] scrollbar-thin scrollbar-track-gray-100 scrollbar-thumb-gray-300 dark:scrollbar-track-gray-800 dark:scrollbar-thumb-gray-600">
            {filteredSections.map((section, index) => {
              const checked = visibility[section.id] !== false
              return (
                <div
                  key={section.id}
                  draggable
                  onDragStart={(event) => {
                    setDraggingId(section.id)
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', section.id)
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const sourceId = event.dataTransfer.getData('text/plain') || draggingId
                    onMoveSection?.(sourceId, section.id)
                    setDraggingId(null)
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  className={`group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm text-gray-700 transition-all hover:bg-gradient-to-r hover:from-gray-50 hover:to-transparent dark:text-[var(--color-app-text-secondary)] dark:hover:bg-[var(--color-app-surface-muted)] ${
                    draggingId === section.id
                      ? 'bg-gradient-to-r from-blue-50/80 to-indigo-50/80 ring-1 ring-blue-200 shadow-md shadow-blue-500/20 dark:from-blue-950/30 dark:to-indigo-950/30 dark:ring-blue-800'
                      : ''
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="flex-none cursor-grab text-gray-300 transition-opacity group-hover:text-gray-500 active:cursor-grabbing dark:text-[var(--color-app-text-muted)]"
                  >
                    ⋮⋮
                  </span>
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <span className="relative inline-flex h-5 w-9 flex-none items-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleSection(section.id)}
                        className="peer sr-only"
                      />
                      <span className="absolute inset-0 rounded-full bg-gray-300 transition-all duration-200 peer-checked:bg-gradient-to-r peer-checked:from-blue-500 peer-checked:to-indigo-600 dark:bg-gray-700" />
                      <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-md transition-all duration-200 peer-checked:translate-x-4 peer-checked:shadow-blue-500/30" />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{section.name}</span>
                  </label>
                  <div className="flex flex-none items-center gap-0.5 rounded-lg bg-gray-50/50 p-0.5 opacity-0 transition-all group-hover:opacity-100 dark:bg-[var(--color-app-surface-muted)]">
                    <button
                      type="button"
                      onClick={() => onNudgeSection?.(section.id, -1)}
                      disabled={index === 0}
                      className="rounded-md p-1.5 text-gray-400 transition-all hover:bg-white hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-25 dark:hover:bg-[var(--color-app-surface-muted)] dark:hover:text-[var(--color-app-text)]"
                      aria-label={`Move ${section.name} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => onNudgeSection?.(section.id, 1)}
                      disabled={index === filteredSections.length - 1}
                      className="rounded-md p-1.5 text-gray-400 transition-all hover:bg-white hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-25 dark:hover:bg-[var(--color-app-surface-muted)] dark:hover:text-[var(--color-app-text)]"
                      aria-label={`Move ${section.name} down`}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              )
            })}
            {!filteredSections.length ? (
              <div className="flex flex-col items-center justify-center px-2 py-12 text-center">
                <span className="mb-3 text-4xl">🔍</span>
                <p className="text-sm font-medium text-gray-400 dark:text-[var(--color-app-text-muted)]">
                  No sections found
                </p>
                <p className="mt-1 text-xs text-gray-300 dark:text-[var(--color-app-text-muted)]">
                  Try adjusting your search
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  )
}