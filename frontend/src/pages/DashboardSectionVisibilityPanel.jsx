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
  const filteredSections = sections.filter((section) => section.name.toLowerCase().includes(search.trim().toLowerCase()))

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
      <aside ref={panelRef} aria-label="Dashboard section visibility controls" className="fixed bottom-4 right-3 z-30 w-12 xl:bottom-auto xl:top-24">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Show dashboard sections"
          aria-expanded="false"
          title="Show dashboard sections"
          className="flex h-12 w-full items-center justify-center rounded-2xl border border-surface-border/80 bg-white/95 text-sm font-semibold text-gray-800 shadow-[0_18px_45px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-[var(--color-app-border)] dark:bg-[rgb(29_24_19_/_0.96)] dark:text-[var(--color-app-text)]"
        >
          ≡
        </button>
      </aside>
    )
  }

  return (
    <aside ref={panelRef} aria-label="Dashboard section visibility controls" className="fixed bottom-4 right-3 z-30 w-[min(calc(100vw-1.5rem),19rem)] xl:top-24 xl:w-72">
      <div className="overflow-hidden rounded-2xl border border-surface-border/80 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-[var(--color-app-border)] dark:bg-[rgb(29_24_19_/_0.96)]">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Hide dashboard sections"
          aria-expanded="true"
          title="Hide dashboard sections"
          className="flex w-full items-center justify-center gap-2 border-b border-surface-border p-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 dark:border-[var(--color-app-border)] dark:text-[var(--color-app-text)] dark:hover:bg-[var(--color-app-surface-muted)]"
        >
          <span aria-hidden="true">≡</span>
          <span className="min-w-0 flex-1 text-left">Dashboard Sections</span>
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-700 dark:bg-primary-950 dark:text-primary-200">
            {visibleCount}/{sections.length}
          </span>
          <span aria-hidden="true">›</span>
        </button>

        <div className="space-y-3 p-3">
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-muted)]">
            <span aria-hidden="true" className="text-gray-400">⌕</span>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Find section"
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
              aria-label="Search dashboard sections"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={onSelectAll} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-50 dark:text-primary-200 dark:hover:bg-primary-950">
              Select All
            </button>
            <button type="button" onClick={onClearAll} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-500 transition hover:bg-gray-100 dark:text-[var(--color-app-text-muted)] dark:hover:bg-[var(--color-app-surface-muted)]">
              Deselect All
            </button>
          </div>

          <div className="max-h-[42vh] space-y-1 overflow-y-auto pr-1 xl:max-h-[62vh]">
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
                  className={`flex items-center gap-2 rounded-xl px-2 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-[var(--color-app-text-secondary)] dark:hover:bg-[var(--color-app-surface-muted)] ${
                    draggingId === section.id ? 'bg-primary-50/80 ring-1 ring-primary-200 dark:bg-primary-950/30 dark:ring-primary-800' : ''
                  }`}
                >
                  <span aria-hidden="true" className="flex-none cursor-grab text-gray-400 active:cursor-grabbing dark:text-[var(--color-app-text-muted)]">
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
                      <span className="absolute inset-0 rounded-full bg-gray-200 transition peer-checked:bg-primary-600 dark:bg-gray-800" />
                      <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{section.name}</span>
                  </label>
                  <div className="flex flex-none items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onNudgeSection?.(section.id, -1)}
                      disabled={index === 0}
                      className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-[var(--color-app-surface-muted)] dark:hover:text-[var(--color-app-text)]"
                      aria-label={`Move ${section.name} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => onNudgeSection?.(section.id, 1)}
                      disabled={index === filteredSections.length - 1}
                      className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-[var(--color-app-surface-muted)] dark:hover:text-[var(--color-app-text)]"
                      aria-label={`Move ${section.name} down`}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              )
            })}
            {!filteredSections.length ? <p className="px-2 py-5 text-center text-sm text-gray-500 dark:text-[var(--color-app-text-muted)]">No sections found.</p> : null}
          </div>
        </div>
      </div>
    </aside>
  )
}
