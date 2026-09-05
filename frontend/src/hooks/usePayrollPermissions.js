import { useQuery } from 'react-query'
import { authAPI } from '../api/auth'
import { hasCompanyAdminAccess } from '../utils/roles'
import { useAuthStore } from '../store/authStore'

/**
 * Phase 7 — resolve the current user's payroll permissions for UI gating.
 *
 * Mirrors the backend rules in app/api/dependencies.py `require_capability`:
 *   company admins (admin/sub_admin/super_admin)            → all payroll caps
 *   HR-department staff with payroll.view / payroll.manage   → their caps
 *   everyone else                                            → none
 *
 * The backend remains authoritative for every operation; this hook only
 * decides which payslip actions the UI offers (Generate/Regenerate need
 * manage; Preview/Download need view).
 */
export function usePayrollPermissions() {
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
    canView: Boolean(isCompanyAdmin || (isHr && caps.has('payroll.view'))),
    canManage: Boolean(isCompanyAdmin || (isHr && caps.has('payroll.manage'))),
    canApprove: Boolean(isCompanyAdmin || (isHr && caps.has('payroll.approve'))),
  }
}

export default usePayrollPermissions
