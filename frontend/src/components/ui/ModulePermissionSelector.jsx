import { useMemo } from 'react'
import {
  MODULE_CATALOG,
  MODULE_GROUPS,
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

  const toggle = (id) => {
    const next = selected.has(id)
      ? (value || []).filter((item) => item !== id)
      : [...(value || []), id]
    onChange(next)
  }

  const selectAll = () => onChange(MODULE_CATALOG.map((m) => m.id))
  const clearAll = () => onChange([])
  const useRoleDefaults = () => onChange(getRoleModuleDefaults(role))

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
        {MODULE_GROUPS.filter((group) => MODULE_CATALOG.some((m) => m.group === group)).map((group) => (
          <div key={group}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {group}
            </p>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {MODULE_CATALOG.filter((m) => m.group === group).map((module) => {
                const checked = selected.has(module.id)
                return (
                  <label
                    key={module.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 ${
                      checked
                        ? 'border-indigo-400 bg-white text-indigo-800 dark:bg-gray-800 dark:text-indigo-200'
                        : 'border-gray-200 bg-white/70 text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(module.id)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800"
                    />
                    <span className="min-w-0 flex-1 truncate">{module.label}</span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
