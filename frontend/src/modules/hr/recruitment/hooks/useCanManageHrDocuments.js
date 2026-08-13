import { useQuery } from 'react-query'
import { authAPI } from '../../../../api/auth'
import { hasCompanyAdminAccess } from '../../../../utils/roles'
import { useAuthStore } from '../../../../store/authStore'

/**
 * Phase 2 HRMS — resolve whether the current user can MANAGE HR documents
 * (upload / replace / edit / archive / configure types).
 *
 * Mirrors the backend rule in hr_document_service.has_hr_manage():
 *   company admins (admin/sub_admin/super_admin)  → yes
 *   HR-department staff with employee_management.manage capability → yes
 *   everyone else → no
 *
 * The backend remains authoritative for every per-document action; this hook
 * only decides whether the UI offers the manage actions.
 */
export function useCanManageHrDocuments() {
  const { user } = useAuthStore()

  const { data: me } = useQuery(['auth', 'me', 'capabilities'], () => authAPI.getMe(), {
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const role = user?.role
  const capabilities = Array.isArray(me?.capabilities) ? me.capabilities : user?.capabilities
  const departmentKey = me?.department_key || user?.department_key

  const isCompanyAdmin = hasCompanyAdminAccess(role)
  const isHrWithManage = departmentKey === 'hr' && Array.isArray(capabilities) && capabilities.includes('employee_management.manage')

  return Boolean(isCompanyAdmin || isHrWithManage)
}
