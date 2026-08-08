import { useMemo } from 'react'
import {
  MODULE_CATALOG,
  MODULE_GROUPS,
  ROLE_IMPLIED_MODULES,
  getRoleModuleDefaults,
} from '../../config/modulePermissions'

const isEmployeeLevel = (role) => ['manager', 'lead', 'employee'].includes(String(role || '').toLowerCase())

/**
 * Reusable Permissions selector for member create/edit forms.
 *
 * Renders the canonical sidebar-module catalog as a grouped checkbox grid with
 * Select All / Clear All / Use Role Defaults controls. Modules that the backend
 * auto-grants for employee-level roles are shown as always-on (locked).
 *
 * Props:
 *  - value:   array of module ids currently selected
 *  - onChange: (nextValue: string[]) => void
 *  - role:    role key used to load defaults ('' or undefined = employee)
 *  - compact: optional, renders tighter paddings
 */
export default function ModulePermissionSelector({ value, onChange, role, compact = false }) {
  const employeeLevel = isEmployeeLevel(role)

  // For employee-level roles the backend auto-grants the implied modules no
  // matter what is stored (require_module), so the effective selection always
  // includes them - the UI shows exactly what the member will actually access.
  const effectiveValue = useMemo(() => {
    if (!employeeLevel) return value || []
    return [...new Set([...(value || []), ...ROLE_IMPLIED_MODULES])]
  }, [value, employeeLevel])

  const selected = useMemo(() => new Set(effectiveValue), [effectiveValue])

  const toggle = (id) => {
    if (ROLE_IMPLIED_MODULES.has(id) && employeeLevel) return
    const next = selected.has(id)
      ? effectiveValue.filter((item) => item !== id)
      : [...effectiveValue, id]
    onChange(next)
  }

  const selectAll = () => onChange(MODULE_CATALOG.map((m) => m.id))

  const clearAll = () => {
    // Employee-level roles keep the role-implied modules enforced by the backend.
    onChange(employeeLevel ? [...ROLE_IMPLIED_MODULES] : [])
  }

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
                const locked = employeeLevel && ROLE_IMPLIED_MODULES.has(module.id)
                return (
                  <label
                    key={module.id}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                      checked
                        ? 'border-indigo-400 bg-white text-indigo-800 dark:bg-gray-800 dark:text-indigo-200'
                        : 'border-gray-200 bg-white/70 text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300'
                    } ${locked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked}
                      onChange={() => toggle(module.id)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800"
                    />
                    <span className="min-w-0 flex-1 truncate">{module.label}</span>
                    {locked && (
                      <span
                        title="Always available for this role (enforced by the backend)"
                        className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300"
                      >
                        always
                      </span>
                    )}
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
