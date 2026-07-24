import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, ShieldCheck, Users, Building2 } from 'lucide-react'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'

const AdminPermissions = () => {
  const { user } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const departmentIdFromUrl = searchParams.get('department') || ''
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(departmentIdFromUrl)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const loadOverview = async () => {
    try {
      setLoading(true)
      setError('')
      const { data } = await api.get('/admin/permissions/overview')
      setOverview(data)
      if (data.departments?.length) {
        setSelectedDepartmentId((current) => {
          if (departmentIdFromUrl && data.departments.some((dept) => dept.id === departmentIdFromUrl)) {
            return departmentIdFromUrl
          }
          if (current && data.departments.some((dept) => dept.id === current)) {
            return current
          }
          return data.departments[0].id
        })
      }
      if (data.employees?.length) {
        setSelectedUserId((current) => current || data.employees[0].id)
      }
    } catch (err) {
      setError(err?.response?.data?.detail || 'Unable to load admin permissions.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOverview()
  }, [])

  useEffect(() => {
    if (!overview?.departments?.length) return

    setSelectedDepartmentId((current) => {
      if (departmentIdFromUrl && overview.departments.some((dept) => dept.id === departmentIdFromUrl)) {
        return departmentIdFromUrl
      }
      if (current && overview.departments.some((dept) => dept.id === current)) {
        return current
      }
      return overview.departments[0].id
    })
  }, [departmentIdFromUrl, overview?.departments])

  const selectedDepartment = overview?.departments?.find((dept) => dept.id === selectedDepartmentId) || null
  const selectedUser = overview?.employees?.find((employee) => employee.id === selectedUserId) || null
  const selectedDepartmentMembers = overview?.employees?.filter((employee) => employee.department_id === selectedDepartmentId) || []
  const selectedUserDepartment = overview?.departments?.find((dept) => dept.id === selectedUser?.department_id) || null
  const departmentNameById = overview?.departments?.reduce((map, dept) => ({ ...map, [dept.id]: dept.name }), {}) || {}
  const selectedUserDepartmentName = selectedUser?.department_id ? departmentNameById[selectedUser.department_id] : 'Unassigned'

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600">Loading admin permissions…</div>
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-rose-600" />
            <div>
              <h2 className="text-lg font-semibold text-rose-900">Access Denied</h2>
              <p className="mt-1 text-sm text-rose-700">{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const handleDepartmentModulesSave = async () => {
    if (!selectedDepartment) return
    try {
      setSaving(true)
      const { data } = await api.put(`/admin/permissions/departments/${selectedDepartment.id}/modules`, { modules: selectedDepartment.enabled_modules })
      setMessage(`Department defaults updated with ${data.modules.length} module(s).`)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Unable to update department defaults.')
    } finally {
      setSaving(false)
    }
  }

  const handleApplyDepartmentModules = async () => {
    if (!selectedDepartment) return
    try {
      setSaving(true)
      const { data } = await api.post(`/admin/permissions/departments/${selectedDepartment.id}/apply`)
      setMessage(`Applied ${data.modules.length} module(s) to ${data.updated_count} member(s).`)
      await loadOverview()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Unable to apply department modules.')
    } finally {
      setSaving(false)
    }
  }

  const handleUserModulesSave = async () => {
    if (!selectedUser) return
    try {
      setSaving(true)
      const { data } = await api.put(`/admin/permissions/users/${selectedUser.id}/modules`, { modules: selectedUser.modules })
      setMessage(`User access updated with ${data.modules.length} module(s).`)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Unable to update user modules.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleUserModule = async (userId, moduleId) => {
    const user = overview?.employees?.find((employee) => employee.id === userId)
    if (!user) return
    const nextModules = toggleModule(user.modules || [], moduleId)
    setOverview((current) => ({
      ...current,
      employees: current.employees.map((employee) => employee.id === userId ? { ...employee, modules: nextModules } : employee),
    }))
    await api.put(`/admin/permissions/users/${userId}/modules`, { modules: nextModules })
    setMessage(`Updated access for ${user.full_name}.`)
  }

  const toggleModule = (list, value) => {
    const set = new Set(list || [])
    if (set.has(value)) {
      set.delete(value)
    } else {
      set.add(value)
    }
    return Array.from(set)
  }

  const handlePromotion = async (userId) => {
    try {
      setSaving(true)
      await api.post(`/admin/permissions/users/${userId}/promote`)
      setMessage('User promoted to admin successfully.')
      await loadOverview()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Unable to promote user.')
    } finally {
      setSaving(false)
    }
  }

  const handleDemotion = async (userId) => {
    try {
      setSaving(true)
      await api.post(`/admin/permissions/users/${userId}/demote`)
      setMessage('User demoted successfully.')
      await loadOverview()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Unable to demote user.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary-600">Admin controls</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Permissions management</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">Manage department module defaults, apply them to members, and tailor access for individual employees from one place.</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> Company admin access</div>
            <div className="mt-1 text-xs">Signed in as {user?.first_name || 'Admin'}</div>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</div> : null}
      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{message}</div> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-900"><Building2 className="h-5 w-5 text-primary-600" /> Department defaults</div>
          <div className="mt-4 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Select department
              <select
                className="mt-2 w-full rounded-2xl border border-slate-300 px-3 py-2"
                value={selectedDepartmentId}
                onChange={(event) => {
                  const nextDepartmentId = event.target.value
                  setSelectedDepartmentId(nextDepartmentId)
                  setSearchParams((current) => {
                    const nextParams = new URLSearchParams(current)
                    if (nextDepartmentId) {
                      nextParams.set('department', nextDepartmentId)
                    } else {
                      nextParams.delete('department')
                    }
                    return nextParams
                  })
                }}
              >
                {overview?.departments?.map((dept) => (
                  <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </label>

            {selectedDepartment ? (
              <>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">Enabled modules</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {overview?.module_catalog?.map((module) => {
                      const enabled = (selectedDepartment.enabled_modules || []).includes(module.id)
                      return (
                        <button
                          key={module.id}
                          type="button"
                          onClick={() => {
                            if (!selectedDepartment) return
                            const next = toggleModule(selectedDepartment.enabled_modules || [], module.id)
                            setOverview((current) => ({
                              ...current,
                              departments: current.departments.map((dept) => dept.id === selectedDepartment.id ? { ...dept, enabled_modules: next } : dept),
                            }))
                          }}
                          className={`rounded-full px-3 py-2 text-sm font-medium transition ${enabled ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                        >
                          {module.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Department members</p>
                  <p>{selectedDepartmentMembers.length} member(s) assigned to this department</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={handleDepartmentModulesSave} disabled={saving} className="rounded-2xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save defaults'}</button>
                  <button type="button" onClick={handleApplyDepartmentModules} disabled={saving} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Apply to members</button>
                </div>
              </>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-900"><Users className="h-5 w-5 text-primary-600" /> User access management</div>
          <p className="mt-2 text-sm text-slate-600">Review each user’s department and access, then select a row to manage their permissions.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Access</th>
                  <th className="px-4 py-3">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {overview?.employees?.map((employee) => {
                  const isSelected = employee.id === selectedUserId
                  return (
                    <tr key={employee.id} className={`${isSelected ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{employee.full_name}</div>
                        <div className="text-xs text-slate-500">{employee.role}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{departmentNameById[employee.department_id] || 'Unassigned'}</td>
                      <td className="px-4 py-3">
                        {employee.modules?.length ? (
                          <div className="flex flex-wrap gap-2">
                            {employee.modules.map((moduleId) => {
                              const module = overview.module_catalog?.find((entry) => entry.id === moduleId)
                              return (
                                <span key={`${employee.id}-${moduleId}`} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{module?.label || moduleId}</span>
                              )
                            })}
                          </div>
                        ) : (
                          <span className="text-xs italic text-slate-400">No modules</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedUserId(employee.id)}
                          className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          {isSelected ? 'Selected' : 'Manage'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {selectedUser ? (
            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{selectedUser.full_name}</h2>
                  <p className="text-sm text-slate-600">Department: {selectedUserDepartmentName}</p>
                </div>
                <button type="button" onClick={() => setSelectedUserId('')} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
                  Clear selection
                </button>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {overview?.module_catalog?.map((module) => {
                  const enabled = (selectedUser.modules || []).includes(module.id)
                  return (
                    <button
                      key={module.id}
                      type="button"
                      onClick={() => handleToggleUserModule(selectedUser.id, module.id)}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${enabled ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
                    >
                      <span>{module.label}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] shadow-sm">
                        {enabled ? 'Revoke' : 'Grant'}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={handleUserModulesSave} disabled={saving} className="rounded-2xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" onClick={() => setSelectedUserId('')} className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
              Select a user row to reveal access controls here.
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-900"><ShieldCheck className="h-5 w-5 text-primary-600" /> Promote employees</div>
          <div className="mt-4 space-y-3">
            {overview?.employees?.length ? overview.employees.map((employee) => (
              <div key={employee.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{employee.full_name}</p>
                  <p className="text-xs text-slate-500">{employee.role}</p>
                </div>
                <button type="button" onClick={() => handlePromotion(employee.id)} disabled={saving} className="rounded-2xl border border-primary-200 px-3 py-2 text-sm font-semibold text-primary-700 disabled:opacity-60">Make admin</button>
              </div>
            )) : <p className="text-sm text-slate-500">No eligible employees found.</p>}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-900"><ShieldCheck className="h-5 w-5 text-primary-600" /> Current admins</div>
          <div className="mt-4 space-y-3">
            {overview?.admins?.length ? overview.admins.map((admin) => (
              <div key={admin.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{admin.full_name}</p>
                  <p className="text-xs text-slate-500">{admin.previous_role ? `Previously ${admin.previous_role}` : 'Company admin'}</p>
                </div>
                <button type="button" onClick={() => handleDemotion(admin.id)} disabled={saving} className="rounded-2xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60">Demote</button>
              </div>
            )) : <p className="text-sm text-slate-500">No admins found.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}

export default AdminPermissions
