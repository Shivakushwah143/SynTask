import { useQuery } from 'react-query'
import { authAPI } from '../../../../api/auth'
import { hasCompanyAdminAccess } from '../../../../utils/roles'
import { useAuthStore } from '../../../../store/authStore'

/**
 * Resolve whether the current user may manage salary (create revisions).
 * Mirrors the backend `salary_management.manage` capability — company admins
 * pass through; HR-department staff need the explicit capability.
 *
 * Used to gate the "Create a Salary Revision" option inside the Lifecycle
 * promotion modal: a user with lifecycle permission but no salary permission
 * never sees salary amounts or revision controls.
 */
export function useCanManageSalary() {
  const { user } = useAuthStore()
  const { data: me } = useQuery(['auth', 'me', 'capabilities'], () => authAPI.getMe(), {
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
  const role = user?.role
  const capabilities = Array.isArray(me?.capabilities) ? me.capabilities : user?.capabilities
  const departmentKey = me?.department_key || user?.department_key
  const isCompanyAdmin = hasCompanyAdminAccess(role)
  const caps = new Set(capabilities || [])
  return {
    canManage: Boolean(isCompanyAdmin || (departmentKey === 'hr' && caps.has('salary_management.manage'))),
  }
}

export default useCanManageSalary
