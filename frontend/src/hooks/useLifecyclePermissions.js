import { useQuery } from 'react-query'
import { authAPI } from '../api/auth'
import { hasCompanyAdminAccess } from '../utils/roles'
import { useAuthStore } from '../store/authStore'

/**
 * Phase 9 — resolve the current user's employee-lifecycle permissions for UI
 * gating. Mirrors the backend capability rules in app/api/dependencies.py:
 *
 *   company admins (admin/sub_admin/super_admin)  → all lifecycle caps
 *   HR-department staff with the specific cap      → their caps
 *   everyone else                                  → none
 *
 * Termination / resignation acceptance / exit additionally require
 * `employee_lifecycle.separation` — managers never gain separation rights
 * from the reporting hierarchy. The backend stays authoritative.
 */
export function useLifecyclePermissions() {
  const { user } = useAuthStore()

  const { data: me } = useQuery(['auth', 'me', 'capabilities'], () => authAPI.getMe(), {
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const role = user?.role
  const capabilities = Array.isArray(me?.capabilities) ? me.capabilities : user?.capabilities
  const departmentKey = me?.department_key || user?.department_key

  const isCompanyAdmin = hasCompanyAdminAccess(role)
  const isHr = departmentKey === 'hr'
  const caps = new Set(capabilities || [])

  return {
    canView: Boolean(isCompanyAdmin || (isHr && caps.has('employee_lifecycle.view'))),
    canManage: Boolean(isCompanyAdmin || (isHr && caps.has('employee_lifecycle.manage'))),
    canSeparate: Boolean(isCompanyAdmin || (isHr && caps.has('employee_lifecycle.separation'))),
  }
}

export default useLifecyclePermissions
