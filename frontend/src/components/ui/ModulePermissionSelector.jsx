import { useMemo } from 'react'
import {
  MODULE_CATALOG,
  MODULE_LABELS,
  SIDEBAR_PERMISSION_SECTIONS,
  getOptionState,
  getRoleModuleDefaults,
} from '../../config/modulePermissions'

/**
 * Reusable Permissions selector for member create/edit forms.
 *
 * Renders the canonical sidebar-module catalog as a grouped checkbox grid with
 * Select All / Clear All / Use Role Defaults controls. Every module is freely
 * toggleable; the saved list is authoritative for explicitly-configured
 * members (legacy members keep the backend role auto-grants until an admin
 * saves a new explicit list for them).
 *
 * Props:
 *  - value:   array of module ids currently selected
 *  - onChange: (nextValue: string[]) => void
 *  - role:    role key used to load defaults ('' or undefined = employee)
 *  - compact: optional, renders tighter paddings
 */
export default function ModulePermissionSelector({ value, onChange, role, compact = false }) {
  const selected = useMemo(() => new Set(value || []), [value])

  const selectAll = () => onChange(MODULE_CATALOG.map((m) => m.id))
  const clearAll = () => onChange([])
  const useRoleDefaults = () => onChange(getRoleModuleDefaults(role))

  const normalizeNext = (ids) => [...new Set(ids)].filter((id) => MODULE_LABELS[id])

  const toggleModules = (moduleIds, checked) => {
    if (!moduleIds?.length) return
    const current = new Set(value || [])
    for (const id of moduleIds) {
      if (checked) current.add(id)
      else current.delete(id)
    }
    onChange(normalizeNext([...current]))
  }

  const sectionModuleIds = (section) =>
    [...new Set([...(section.moduleIds || []), ...section.options.flatMap((option) => option.moduleIds || [])])]

  const sectionState = (section) => {
    const ids = sectionModuleIds(section)
    if (!ids.length) return { checked: true, partial: false, disabled: true }
    const checkedCount = ids.filter((id) => selected.has(id)).length
    return {
      checked: checkedCount === ids.length,
      partial: checkedCount > 0 && checkedCount < ids.length,
      disabled: false,
    }
  }

  return (
    <div className={`rounded-xl border border-indigo-200 bg-indigo-50/70 dark:border-indigo-500/25 dark:bg-indigo-500/10 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <label className="block text-sm font-semibold text-gray-800 dark:text-gray-100">
            Permissions
          </label>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
            Choose which sections this member can access. Backend APIs enforce the same access.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={useRoleDefaults}
            className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-gray-800 dark:text-indigo-200 dark:hover:bg-indigo-950/40"
          >
            Use Role Defaults
          </button>
          <button
            type="button"
            onClick={selectAll}
            className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-gray-800 dark:text-indigo-200 dark:hover:bg-indigo-950/40"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {SIDEBAR_PERMISSION_SECTIONS.map((section) => {
          const state = sectionState(section)
          return (
            <div key={section.id} className="rounded-xl border border-gray-200 bg-white/80 p-3 dark:border-gray-700 dark:bg-gray-900/50">
              <label className={`flex items-start gap-3 ${state.disabled ? 'cursor-default' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={state.checked}
                  disabled={state.disabled}
                  ref={(input) => {
                    if (input) input.indeterminate = state.partial
                  }}
                  onChange={(event) => toggleModules(sectionModuleIds(section), event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">{section.label}</span>
                  {section.note ? <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{section.note}</span> : null}
                  {sectionModuleIds(section).length ? (
                    <span className="mt-1 block text-[11px] text-gray-500 dark:text-gray-400">
                      Controls {sectionModuleIds(section).map((id) => MODULE_LABELS[id]).join(', ')}
                    </span>
                  ) : (
                    <span className="mt-1 block text-[11px] text-gray-500 dark:text-gray-400">Always available when the user's role allows it.</span>
                  )}
                </span>
              </label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {section.options.map((option) => {
                  const optionState = getOptionState(selected, option)
                  const checked = optionState === 'checked' || optionState === 'fixed'
                  const disabled = optionState === 'fixed' || !option.moduleIds?.length
                  const title = option.moduleIds?.length
                    ? `Controlled by ${option.moduleIds.map((id) => MODULE_LABELS[id]).join(', ')}`
                    : 'Always available by role or core access'
                return (
                  <label
                    key={option.id}
                    title={title}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 ${
                      checked
                        ? 'border-indigo-400 bg-white text-indigo-800 dark:bg-gray-800 dark:text-indigo-200'
                        : 'border-gray-200 bg-white/70 text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={(event) => toggleModules(option.moduleIds, event.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800"
                    />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {disabled ? <span className="text-[10px] font-medium text-gray-400">Core</span> : null}
                  </label>
                )
              })}
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}
