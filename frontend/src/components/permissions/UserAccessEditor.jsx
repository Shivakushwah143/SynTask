/**
 * UserAccessEditor — ONE shared, reusable permission editor for SynTask.
 *
 * Used by BOTH:
 *   /users → Edit User modal
 *   /admin-permissions → User Access panel
 *
 * Both entry points read/write the SAME underlying data:
 *   - modules (page visibility)
 *   - permission_overrides (tri-state per-action)
 *
 * Props:
 *   user              – The user object being edited (must have .id, .role, .modules, .permission_overrides, .effective_permissions)
 *   permissionCatalog  – Array of { key, label, module_id, module_label, configurable, supported_scopes }
 *   moduleCatalog      – Array of { id, label, group, core }
 *   disabled           – Disable all controls
 *   onDirtyChange      – (isDirty: boolean) => void — notifies parent of unsaved state
 *   onSave             – async ({ modules, overrides }) => void — called when user clicks Save
 *   onCancel           – () => void
 *   showProfileFields  – If true, renders profile fields (for /users integration). Default false.
 *   saving             – External saving state (from parent)
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ChevronDown, ChevronRight, Lock, Unlock, Shield, ShieldCheck,
  Save, X, RotateCcw, Loader2,
} from 'lucide-react'
import { getPermissionCatalog } from '../../api/permissions'

// ── Helpers ──────────────────────────────────────────────────────────────────

const PRESETS = [
  { id: 'default', label: 'Default', description: 'Inherit role/department defaults' },
  { id: 'readonly', label: 'Read Only', description: 'Allow view, deny modifications' },
  { id: 'full', label: 'Full Access', description: 'Allow all actions in this module' },
  { id: 'none', label: 'No Access', description: 'Deny all actions in this module' },
  { id: 'custom', label: 'Custom', description: 'Configure each action individually' },
]

const SCOPE_LABELS = {
  self: 'Self only',
  created: 'Created by user',
  assigned: 'Assigned to user',
  project: 'Project scope',
  team: 'Team scope',
  department: 'Department scope',
  company: 'Company-wide',
}

const MODULE_GROUP_ORDER = ['Work', 'CRM', 'Workforce', 'Finance', 'Administration']

// Group catalog entries by module_id, preserving module_label
function groupByModule(catalog) {
  const groups = {}
  for (const entry of catalog) {
    if (!entry.configurable) continue
    const key = entry.module_id
    if (!groups[key]) {
      groups[key] = { moduleId: key, moduleLabel: entry.module_label, items: [] }
    }
    groups[key].items.push(entry)
  }
  return groups
}

// Compute the "preset" for a module based on its overrides
function detectPreset(overrides, moduleItems) {
  const active = overrides.filter(o => o.effect !== 'inherit')
  if (active.length === 0) return 'default'
  const allAllow = moduleItems.every(item => {
    const ov = overrides.find(o => o.permission === item.key)
    return !ov || ov.effect === 'inherit' || ov.effect === 'allow'
  })
  const allDeny = moduleItems.every(item => {
    const ov = overrides.find(o => o.permission === item.key)
    return ov && ov.effect === 'deny'
  })
  const viewOnly = moduleItems.every(item => {
    const ov = overrides.find(o => o.permission === item.key)
    if (item.action_id === 'view') return !ov || ov.effect === 'inherit' || ov.effect === 'allow'
    return ov && ov.effect === 'deny'
  })
  if (viewOnly) return 'readonly'
  if (allAllow) return 'full'
  if (allDeny) return 'none'
  return 'custom'
}

// Apply a preset to generate overrides for a module's items
function applyPreset(preset, moduleItems, existingOverrides) {
  const kept = existingOverrides.filter(o =>
    !moduleItems.some(item => item.key === o.permission)
  )
  if (preset === 'default') return kept
  const newOverrides = moduleItems.map(item => {
    if (preset === 'full') return { permission: item.key, effect: 'allow', scope: null }
    if (preset === 'none') return { permission: item.key, effect: 'deny', scope: null }
    if (preset === 'readonly') {
      return { permission: item.key, effect: item.action_id === 'view' ? 'allow' : 'deny', scope: null }
    }
    // custom — keep existing or default to inherit
    const existing = existingOverrides.find(o => o.permission === item.key)
    return existing || { permission: item.key, effect: 'inherit', scope: null }
  })
  return [...kept, ...newOverrides]
}

// ── Sub-components ───────────────────────────────────────────────────────────

function EffectBadge({ effect, source }) {
  if (effect === 'allow') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        <ShieldCheck className="h-2.5 w-2.5" /> Allow
      </span>
    )
  }
  if (effect === 'deny') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
        <Lock className="h-2.5 w-2.5" /> Deny
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
      <RotateCcw className="h-2.5 w-2.5" /> Inherit
    </span>
  )
}

function ModuleToggle({ label, enabled, onToggle, disabled }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition disabled:opacity-50 ${
        enabled
          ? 'border-primary-200 bg-primary-50 text-primary-800 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
      }`}
    >
      <span className="flex items-center gap-2">
        {enabled ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        {label}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
          enabled
            ? 'bg-primary-200 text-primary-800 dark:bg-primary-800 dark:text-primary-200'
            : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
        }`}
      >
        {enabled ? 'On' : 'Off'}
      </span>
    </button>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function UserAccessEditor({
  user,
  disabled = false,
  onDirtyChange,
  onSave,
  onCancel,
  saving = false,
  // Pre-loaded catalog data (from /admin/permissions/overview or fetched)
  initialCatalog,
  initialModuleCatalog,
}) {
  const [catalog, setCatalog] = useState(initialCatalog || [])
  const [moduleCatalog, setModuleCatalog] = useState(initialModuleCatalog || [])
  const [catalogLoading, setCatalogLoading] = useState(!initialCatalog)
  const [catalogError, setCatalogError] = useState('')

  // Module visibility
  const [modules, setModules] = useState(() => user?.modules || [])
  // Permission overrides
  const [overrides, setOverrides] = useState(() => user?.permission_overrides || [])
  // Expanded modules in the action section
  const [expandedModules, setExpandedModules] = useState({})
  // Local save error
  const [saveError, setSaveError] = useState('')

  const originalModulesRef = useRef(user?.modules || [])
  const originalOverridesRef = useRef(user?.permission_overrides || [])

  // Fetch catalog if not provided
  useEffect(() => {
    if (initialCatalog?.length) {
      setCatalog(initialCatalog)
      setCatalogLoading(false)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        setCatalogLoading(true)
        setCatalogError('')
        const data = await getPermissionCatalog()
        if (cancelled) return
        setCatalog(data.permissions || [])
        if (!initialModuleCatalog) {
          // Derive module catalog from permission catalog
          const seen = new Map()
          for (const entry of data.permissions || []) {
            if (!seen.has(entry.module_id)) {
              seen.set(entry.module_id, { id: entry.module_id, label: entry.module_label })
            }
          }
          setModuleCatalog(Array.from(seen.values()))
        }
      } catch (err) {
        if (!cancelled) setCatalogError(err?.response?.data?.detail || 'Unable to load permission configuration.')
      } finally {
        if (!cancelled) setCatalogLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [initialCatalog, initialModuleCatalog])

  // Sync state when user prop changes
  useEffect(() => {
    if (user) {
      setModules(user.modules || [])
      setOverrides(user.permission_overrides || [])
      originalModulesRef.current = user.modules || []
      originalOverridesRef.current = user.permission_overrides || []
      setSaveError('')
    }
  }, [user?.id])

  // Dirty tracking
  const isDirty = useMemo(() => {
    const modChanged = JSON.stringify(modules) !== JSON.stringify(originalModulesRef.current)
    const ovChanged = JSON.stringify(overrides) !== JSON.stringify(originalOverridesRef.current)
    return modChanged || ovChanged
  }, [modules, overrides])

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  // Grouped catalog by module
  const groupedCatalog = useMemo(() => groupByModule(catalog), [catalog])

  // Determine which modules have configurable permissions
  const modulesWithActions = useMemo(() => {
    return Object.keys(groupedCatalog)
  }, [groupedCatalog])

  // Module toggle
  const toggleModule = useCallback((moduleId) => {
    setModules(prev => {
      const set = new Set(prev)
      if (set.has(moduleId)) set.delete(moduleId)
      else set.add(moduleId)
      return Array.from(set)
    })
  }, [])

  // Toggle all modules on/off
  const toggleAllModules = useCallback((on) => {
    if (on) {
      setModules(moduleCatalog.map(m => m.id))
    } else {
      setModules([])
    }
  }, [moduleCatalog])

  // Preset change for a module
  const handlePresetChange = useCallback((moduleId, presetId) => {
    const moduleItems = groupedCatalog[moduleId]?.items || []
    setOverrides(prev => applyPreset(presetId, moduleItems, prev))
  }, [groupedCatalog])

  // Individual override change
  const handleOverrideChange = useCallback((permissionKey, patch) => {
    setOverrides(prev => {
      const existing = prev.find(o => o.permission === permissionKey)
      if (existing) {
        return prev.map(o => o.permission === permissionKey ? { ...o, ...patch } : o)
      }
      return [...prev, { permission: permissionKey, effect: 'inherit', scope: null, ...patch }]
    })
  }, [])

  // Reset to original
  const handleReset = useCallback(() => {
    setModules(originalModulesRef.current)
    setOverrides(originalOverridesRef.current)
    setSaveError('')
  }, [])

  // Save
  const handleSave = useCallback(async () => {
    if (!onSave) return
    setSaveError('')
    try {
      await onSave({ modules, overrides })
      originalModulesRef.current = modules
      originalOverridesRef.current = overrides
    } catch (err) {
      setSaveError(err?.response?.data?.detail || err?.message || 'Failed to save permissions')
    }
  }, [modules, overrides, onSave])

  // Toggle module expansion
  const toggleExpand = useCallback((moduleId) => {
    setExpandedModules(prev => ({ ...prev, [moduleId]: !prev[moduleId] }))
  }, [])

  // ── Loading state ────────────────────────────────────────────────────────

  if (catalogLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading permission configuration…
      </div>
    )
  }

  if (catalogError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-slate-500">
        <p>{catalogError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
        >
          Retry
        </button>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ── Section 1: Page Access ───────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Page Access</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Choose which sections this user can see and open.
            </p>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => toggleAllModules(true)}
              disabled={disabled}
              className="rounded-lg border border-primary-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-primary-700 transition hover:bg-primary-50 disabled:opacity-50 dark:border-primary-600 dark:bg-slate-800 dark:text-primary-300"
            >
              All On
            </button>
            <button
              type="button"
              onClick={() => toggleAllModules(false)}
              disabled={disabled}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
            >
              All Off
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {moduleCatalog
            .filter(m => !m.core)
            .map(m => (
              <ModuleToggle
                key={m.id}
                label={m.label}
                enabled={modules.includes(m.id)}
                onToggle={() => toggleModule(m.id)}
                disabled={disabled}
              />
            ))}
        </div>
      </div>

      {/* ── Section 2: What can this user do? ────────────────────────────── */}
      {modulesWithActions.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">What can this user do?</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Granular permissions for enabled modules. Only modules the user has access to are shown.
          </p>

          <div className="mt-3 space-y-2">
            {modulesWithActions
              .filter(moduleId => modules.includes(moduleId))
              .sort((a, b) => {
                const aLabel = groupedCatalog[a]?.moduleLabel || a
                const bLabel = groupedCatalog[b]?.moduleLabel || b
                return aLabel.localeCompare(bLabel)
              })
              .map(moduleId => {
                const group = groupedCatalog[moduleId]
                const isExpanded = expandedModules[moduleId] !== false // default expanded
                const currentPreset = detectPreset(overrides, group.items)
                const enabledCount = group.items.filter(item => {
                  const ov = overrides.find(o => o.permission === item.key)
                  return ov && ov.effect !== 'inherit'
                }).length

                return (
                  <div
                    key={moduleId}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                  >
                    {/* Module header */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(moduleId)}
                      className="flex min-h-12 w-full items-center justify-between px-4 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 dark:hover:bg-slate-700"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-slate-400" />
                          : <ChevronRight className="h-4 w-4 text-slate-400" />}
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                          {group.moduleLabel}
                        </span>
                        {enabledCount > 0 && (
                          <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                            {enabledCount} custom
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          {PRESETS.find(p => p.id === currentPreset)?.label || 'Custom'}
                        </span>
                      </div>
                    </button>

                    {/* Module body */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-700">
                        {/* Preset row */}
                        <div className="flex flex-wrap gap-1.5">
                          {PRESETS.map(preset => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => handlePresetChange(moduleId, preset.id)}
                              disabled={disabled}
                              title={preset.description}
                              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${
                                currentPreset === preset.id
                                  ? 'bg-primary-600 text-white shadow-sm'
                                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>

                        {/* Action rows */}
                        <div className="mt-3 space-y-1.5">
                          {group.items.map(item => {
                            const ov = overrides.find(o => o.permission === item.key)
                            const effect = ov?.effect || 'inherit'
                            const scope = ov?.scope || null
                            const inherited = user?.effective_permissions?.[item.key]

                            return (
                              <div
                                key={item.key}
                                className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-800/50"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                                    {item.label}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                    {effect === 'inherit' && inherited
                                      ? `Inherited: ${inherited.source}`
                                      : effect === 'deny'
                                        ? 'Explicitly denied'
                                        : effect === 'allow'
                                          ? 'Explicitly allowed'
                                          : 'No access inherited'}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  {/* Effect dropdown */}
                                  <select
                                    value={effect}
                                    disabled={disabled}
                                    onChange={(e) => {
                                      const val = e.target.value
                                      handleOverrideChange(item.key, {
                                        effect: val,
                                        scope: val === 'inherit' ? null : scope,
                                      })
                                    }}
                                    className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                  >
                                    <option value="inherit">Default</option>
                                    <option value="allow">Allow</option>
                                    <option value="deny">Deny</option>
                                  </select>

                                  {/* Scope dropdown — only for allow + supported scopes */}
                                  {effect === 'allow' && item.supported_scopes?.length > 0 && (
                                    <select
                                      value={scope || ''}
                                      disabled={disabled}
                                      onChange={(e) => handleOverrideChange(item.key, { scope: e.target.value || null })}
                                      className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                    >
                                      <option value="">Default scope</option>
                                      {item.supported_scopes.map(scope => (
                                        <option key={scope} value={scope}>
                                          {SCOPE_LABELS[scope] || scope}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* ── Modules without configurable actions ──────────────────────────── */}
      {modules.filter(m => !modulesWithActions.includes(m)).length > 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-400">
          Modules without configurable actions are shown as page-access only.{' '}
          {modules.filter(m => !modulesWithActions.includes(m)).length} module(s) have no action-level permissions.
        </div>
      )}

      {/* ── Save bar ──────────────────────────────────────────────────────── */}
      {(onSave || onCancel) && (
        <div className="flex items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
          {saveError && (
            <p className="flex-1 text-xs font-medium text-rose-600 dark:text-rose-400">{saveError}</p>
          )}
          {isDirty && !saveError && (
            <span className="flex-1 text-xs font-medium text-amber-600 dark:text-amber-400">● Unsaved changes</span>
          )}
          {!isDirty && !saveError && <span className="flex-1" />}
          <button
            type="button"
            onClick={handleReset}
            disabled={disabled || !isDirty}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
          >
            Reset
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={disabled || saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              Cancel
            </button>
          )}
          {onSave && (
            <button
              type="button"
              onClick={handleSave}
              disabled={disabled || saving || !isDirty}
              className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
