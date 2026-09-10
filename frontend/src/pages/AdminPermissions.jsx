import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertCircle, CheckCircle2, ShieldCheck, Users, Building2,
  RefreshCw, ChevronDown, X, Lock, Unlock, Save, UserCheck, UserX,
} from 'lucide-react'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import { UserAccessEditor } from '../components/permissions'
import { saveUserAccess } from '../api/permissions'

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS = {
  admin: 'Admin',
  sub_admin: 'Sub-Admin',
  manager: 'Manager',
  lead: 'Team Lead',
  employee: 'Employee',
}

const ROLE_COLORS = {
  admin: 'bg-violet-100 text-violet-700 ring-violet-200',
  sub_admin: 'bg-blue-100 text-blue-700 ring-blue-200',
  manager: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  lead: 'bg-amber-100 text-amber-700 ring-amber-200',
  employee: 'bg-slate-100 text-slate-600 ring-slate-200',
}

// ─── Helper components ─────────────────────────────────────────────────────────

function RoleBadge({ role }) {
  const normalized = (role || '').toLowerCase().replace(/[- ]/g, '_')
  const label = ROLE_LABELS[normalized] || role || '—'
  const colors = ROLE_COLORS[normalized] || 'bg-slate-100 text-slate-600 ring-slate-200'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${colors}`}>
      {label}
    </span>
  )
}

function ModulePill({ label, enabled, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50 ${
        enabled
          ? 'bg-primary-600 text-white shadow-sm hover:bg-primary-700'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {enabled ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
      {label}
    </button>
  )
}

function Toast({ message, type = 'success', onDismiss }) {
  if (!message) return null
  const isError = type === 'error'
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-sm ${
        isError
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
      }`}
    >
      {isError ? <AlertCircle className="h-4 w-4 flex-shrink-0" /> : <CheckCircle2 className="h-4 w-4 flex-shrink-0" />}
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onDismiss} className="rounded p-0.5 hover:bg-black/10 transition">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

const AdminPermissions = () => {
  const { user } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const departmentIdFromUrl = searchParams.get('department') || ''

  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [saving, setSaving] = useState(false)

  const [selectedDepartmentId, setSelectedDepartmentId] = useState(departmentIdFromUrl)
  const [selectedUserId, setSelectedUserId] = useState('')

  // Local edits before saving — keyed by userId / departmentId
  const [pendingUserModules, setPendingUserModules] = useState({})
  const [pendingUserOverrides, setPendingUserOverrides] = useState({})
  const [pendingDeptModules, setPendingDeptModules] = useState({})

  const toastTimerRef = useRef(null)

  const showSuccess = useCallback((msg) => {
    setErrorMsg('')
    setSuccessMsg(msg)
    clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setSuccessMsg(''), 4000)
  }, [])

  const showError = useCallback((msg) => {
    setSuccessMsg('')
    setErrorMsg(msg)
  }, [])

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadOverview = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      else setRefreshing(true)
      setErrorMsg('')
      const res = await api.get('/admin/permissions/overview')
      const data = res.data ?? res
      setOverview(data)

      // Initialise selections
      if (data.departments?.length) {
        setSelectedDepartmentId((current) => {
          if (departmentIdFromUrl && data.departments.some((d) => d.id === departmentIdFromUrl)) return departmentIdFromUrl
          if (current && data.departments.some((d) => d.id === current)) return current
          return data.departments[0].id
        })
      }
      if (data.employees?.length) {
        setSelectedUserId((current) => current || '')
      }

      // Reset pending edits on full reload
      setPendingUserModules({})
      setPendingUserOverrides({})
      setPendingDeptModules({})
    } catch (err) {
      showError(err?.response?.data?.detail || 'Unable to load permissions overview.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [departmentIdFromUrl, showError])

  useEffect(() => { loadOverview() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Derived state ─────────────────────────────────────────────────────────

  const departmentNameById = (overview?.departments || []).reduce(
    (map, dept) => ({ ...map, [dept.id]: dept.name }),
    {}
  )

  const selectedDepartment = (overview?.departments || []).find((d) => d.id === selectedDepartmentId) || null
  const selectedDeptModules = pendingDeptModules[selectedDepartmentId]
    ?? selectedDepartment?.enabled_modules
    ?? []

  const selectedUser = (overview?.employees || []).find((e) => e.id === selectedUserId) || null
  const selectedUserModules = pendingUserModules[selectedUserId]
    ?? selectedUser?.modules
    ?? []
  const selectedUserOverrides = pendingUserOverrides[selectedUserId]
    ?? selectedUser?.permission_overrides
    ?? []

  const selectedDeptMembers = (overview?.employees || []).filter(
    (e) => e.department_id === selectedDepartmentId
  )

  const hasPendingDeptChanges = Boolean(pendingDeptModules[selectedDepartmentId])
  const hasPendingUserChanges = Boolean(pendingUserModules[selectedUserId] || pendingUserOverrides[selectedUserId])

  // ─── Toggle helpers ────────────────────────────────────────────────────────

  const toggleSet = (list, value) => {
    const s = new Set(list || [])
    s.has(value) ? s.delete(value) : s.add(value)
    return Array.from(s)
  }

  const handleToggleDeptModule = (moduleId) => {
    const next = toggleSet(selectedDeptModules, moduleId)
    setPendingDeptModules((prev) => ({ ...prev, [selectedDepartmentId]: next }))
  }

  const handleToggleUserModule = (moduleId) => {
    const next = toggleSet(selectedUserModules, moduleId)
    setPendingUserModules((prev) => ({ ...prev, [selectedUserId]: next }))
  }
  const handleUserOverrideChange = (overrides) => setPendingUserOverrides((prev) => ({ ...prev, [selectedUserId]: overrides }))

  // ─── Save handlers ─────────────────────────────────────────────────────────

  const handleDepartmentModulesSave = async () => {
    if (!selectedDepartment) return
    try {
      setSaving(true)
      const res = await api.put(
        `/admin/permissions/departments/${selectedDepartment.id}/modules`,
        { modules: selectedDeptModules }
      )
      const data = res.data ?? res
      showSuccess(`Department "${selectedDepartment.name}" defaults saved with ${data.modules?.length ?? 0} module(s).`)
      await loadOverview(true)
    } catch (err) {
      showError(err?.response?.data?.detail || 'Unable to save department modules.')
    } finally {
      setSaving(false)
    }
  }

  const handleApplyDepartmentModules = async () => {
    if (!selectedDepartment) return
    try {
      setSaving(true)
      // First save, then apply
      await api.put(
        `/admin/permissions/departments/${selectedDepartment.id}/modules`,
        { modules: selectedDeptModules }
      )
      const res = await api.post(`/admin/permissions/departments/${selectedDepartment.id}/apply`)
      const data = res.data ?? res
      showSuccess(
        `Applied ${data.modules?.length ?? 0} module(s) to ${data.updated_count ?? 0} member(s) in "${selectedDepartment.name}".`
      )
      await loadOverview(true)
    } catch (err) {
      showError(err?.response?.data?.detail || 'Unable to apply department modules to members.')
    } finally {
      setSaving(false)
    }
  }

  const handleUserModulesSave = async ({ modules, overrides }) => {
    if (!selectedUser) return
    try {
      setSaving(true)
      await saveUserAccess(selectedUser.id, { modules, overrides })
      showSuccess(
        `Access for ${selectedUser.full_name} updated — ${modules?.length ?? 0} module(s) active.`
      )
      // Update local state so list reflects new module count
      setSelectedUserModules(modules)
      setSelectedUserOverrides(overrides)
      setPendingUserModules((prev) => {
        const next = { ...prev }
        delete next[selectedUser.id]
        return next
      })
      setPendingUserOverrides((prev) => {
        const next = { ...prev }
        delete next[selectedUser.id]
        return next
      })
      await loadOverview(true)
    } catch (err) {
      showError(err?.response?.data?.detail || 'Unable to update user modules.')
    } finally {
      setSaving(false)
    }
  }

  const handlePromotion = async (targetUserId, targetName) => {
    try {
      setSaving(true)
      await api.post(`/admin/permissions/users/${targetUserId}/promote`)
      showSuccess(`${targetName} has been promoted to Sub-Admin.`)
      await loadOverview(true)
    } catch (err) {
      showError(err?.response?.data?.detail || 'Unable to promote user.')
    } finally {
      setSaving(false)
    }
  }

  const handleDemotion = async (targetUserId, targetName) => {
    try {
      setSaving(true)
      await api.post(`/admin/permissions/users/${targetUserId}/demote`)
      showSuccess(`${targetName} has been demoted to their previous role.`)
      await loadOverview(true)
    } catch (err) {
      showError(err?.response?.data?.detail || 'Unable to demote user.')
    } finally {
      setSaving(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <RefreshCw className="h-6 w-6 animate-spin text-primary-500" />
          <p className="text-sm font-medium">Loading permissions…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-600 dark:text-primary-400">
              Admin controls
            </p>
            <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">
              Permissions Management
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Set module defaults per department, apply them to all members, and customise
              access for individual users — all from one place.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="h-4 w-4" />
                Company Admin
              </div>
              <div className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                {user?.first_name} {user?.last_name}
              </div>
            </div>
            <button
              type="button"
              onClick={() => loadOverview(true)}
              disabled={refreshing}
              title="Refresh data"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Toasts ── */}
      {errorMsg && <Toast message={errorMsg} type="error" onDismiss={() => setErrorMsg('')} />}
      {successMsg && <Toast message={successMsg} type="success" onDismiss={() => setSuccessMsg('')} />}

      {/* ── Two-column: Department defaults + User access ── */}
      <div className="grid gap-4 xl:grid-cols-2">

        {/* Department Defaults */}
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2.5 text-base font-bold text-slate-900 dark:text-slate-100">
            <Building2 className="h-5 w-5 text-primary-600" />
            Department Defaults
          </div>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Set which modules are enabled by default for a department. Use &quot;Apply to members&quot; to push defaults to all current members.
          </p>

          <div className="mt-3 space-y-4">
            {/* Department selector */}
            {overview?.departments?.length ? (
              <div className="relative">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  Select Department
                </label>
                <select
                  className="w-full appearance-none rounded-xl border border-slate-300 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-slate-900 transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  value={selectedDepartmentId}
                  onChange={(e) => {
                    const next = e.target.value
                    setSelectedDepartmentId(next)
                    setSearchParams((prev) => {
                      const p = new URLSearchParams(prev)
                      next ? p.set('department', next) : p.delete('department')
                      return p
                    })
                  }}
                >
                  {overview.departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-[calc(50%+8px)] -translate-y-1/2 h-4 w-4 text-slate-400" />
              </div>
            ) : (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                No departments found. Create departments first from the Departments page.
              </p>
            )}

            {selectedDepartment && (
              <>
                {/* Module toggles */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Module Access</p>
                    {hasPendingDeptChanges && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                        Unsaved
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {overview?.module_catalog?.map((module) => {
                      const enabled = selectedDeptModules.includes(module.id)
                      return (
                        <ModulePill
                          key={module.id}
                          label={module.label}
                          enabled={enabled}
                          disabled={saving}
                          onClick={() => handleToggleDeptModule(module.id)}
                        />
                      )
                    })}
                  </div>
                </div>

                {/* Members info */}
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800/40">
                  <Users className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedDeptMembers.length}</span>
                    {' '}member{selectedDeptMembers.length !== 1 ? 's' : ''} in {selectedDepartment.name}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDepartmentModulesSave}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving…' : 'Save defaults'}
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyDepartmentModules}
                    disabled={saving || !selectedDeptMembers.length}
                    title={!selectedDeptMembers.length ? 'No members to apply to' : ''}
                    className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <Users className="h-4 w-4" />
                    Apply to all members
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* User Access Management */}
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2.5 text-base font-bold text-slate-900 dark:text-slate-100">
            <Users className="h-5 w-5 text-primary-600" />
            User Access
          </div>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Pick a user to customise their module access individually.
          </p>

          {/* User table */}
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Modules</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
                {overview?.employees?.length ? overview.employees.map((employee) => {
                  const isSelected = employee.id === selectedUserId
                  const currentMods = pendingUserModules[employee.id] ?? employee.modules ?? []
                  return (
                    <tr
                      key={employee.id}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-primary-50 dark:bg-primary-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{employee.full_name}</div>
                        <div className="text-xs text-slate-400">{employee.email || ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={employee.role} />
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {departmentNameById[employee.department_id] || <span className="italic text-slate-400">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {currentMods.length}
                          <span className="font-normal text-slate-400"> / {overview?.module_catalog?.length ?? 0}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedUserId(isSelected ? '' : employee.id)}
                          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                            isSelected
                              ? 'bg-primary-600 text-white hover:bg-primary-700'
                              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {isSelected ? 'Editing' : 'Edit'}
                        </button>
                      </td>
                    </tr>
                  )
                }) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Selected user panel */}
          {selectedUser ? (
            <div className="mt-3 rounded-2xl border border-primary-200 bg-primary-50/50 p-4 dark:border-primary-800 dark:bg-primary-950/20">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-slate-100">{selectedUser.full_name}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <RoleBadge role={selectedUser.role} />
                    <span className="text-xs text-slate-500">
                      {departmentNameById[selectedUser.department_id] || 'No department'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedUserId('')}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition dark:hover:bg-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4">
                <UserAccessEditor
                  user={{
                    ...selectedUser,
                    modules: selectedUserModules,
                    permission_overrides: selectedUserOverrides,
                    effective_permissions: selectedUser.effective_permissions || {},
                  }}
                  initialCatalog={overview?.permission_catalog}
                  initialModuleCatalog={overview?.module_catalog?.map(m => ({ id: m.id, label: m.label }))}
                  disabled={saving}
                  saving={saving}
                  onSave={handleUserModulesSave}
                />
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800/40">
              Click <strong>Edit</strong> on any user row above to manage their module access here.
            </div>
          )}
        </section>
      </div>

      {/* ── Bottom row: Promote / Current Admins ── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Promote employees */}
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2.5 text-base font-bold text-slate-900 dark:text-slate-100">
            <UserCheck className="h-5 w-5 text-emerald-600" />
            Promote to Sub-Admin
          </div>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Grant elevated admin access to an employee, manager, or team lead.
          </p>
          <div className="mt-3 space-y-2">
            {overview?.employees?.length ? overview.employees.map((employee) => (
              <div
                key={employee.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{employee.full_name}</p>
                  <RoleBadge role={employee.role} />
                </div>
                <button
                  type="button"
                  onClick={() => handlePromotion(employee.id, employee.full_name)}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  Promote
                </button>
              </div>
            )) : (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40">
                No eligible employees found.
              </p>
            )}
          </div>
        </section>

        {/* Current admins */}
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2.5 text-base font-bold text-slate-900 dark:text-slate-100">
            <UserX className="h-5 w-5 text-rose-600" />
            Current Admins
          </div>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Demote an admin back to their previous role. The last company admin cannot be demoted.
          </p>
          <div className="mt-3 space-y-2">
            {overview?.admins?.length ? overview.admins.map((admin) => (
              <div
                key={admin.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{admin.full_name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {admin.previous_role
                      ? `Previously: ${ROLE_LABELS[admin.previous_role] || admin.previous_role}`
                      : 'Company admin'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDemotion(admin.id, admin.full_name)}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-400"
                >
                  <UserX className="h-3.5 w-3.5" />
                  Demote
                </button>
              </div>
            )) : (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40">
                No admins found.
              </p>
            )}
          </div>
        </section>

      </div>
    </div>
  )
}

export default AdminPermissions
