/**
 * usePermissions — single React hook for frontend permission checks.
 *
 * Reads the current user from the auth store and resolves:
 *   can(permissionKey)  → boolean
 *   effective(permissionKey) → { allowed, source, scope } | null
 *   hasModule(moduleId) → boolean
 *
 * Usage:
 *   const { can, effective, hasModule } = usePermissions()
 *   can('projects.create')      // → true / false
 *   can('tasks.delete')         // → true / false
 *   effective('tasks.assign')   // → { allowed: true, source: 'user_override', scope: 'team' }
 *   hasModule('projects')       // → true / false
 */
import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { hasModuleAccess } from '../utils/rbac'

export function usePermissions() {
  const { user } = useAuthStore()

  // Build a lookup from the user's effective_permissions field.
  // This field is populated by the backend's /auth/me or /admin/permissions/overview.
  const effectiveMap = useMemo(() => {
    const map = {}
    const ep = user?.effective_permissions || {}
    for (const [key, value] of Object.entries(ep)) {
      map[key] = value
    }
    return map
  }, [user?.effective_permissions])

  /**
   * Check if the current user has a specific permission.
   * Falls back to role-based bypass for admin/sub_admin/super_admin.
   */
  const can = useMemo(() => {
    return (permissionKey) => {
      if (!permissionKey) return true
      if (!user) return false

      // Protected roles bypass
      const role = (user.role || '').toLowerCase().replace(/[- ]/g, '_')
      if (role === 'super_admin' || role === 'admin' || role === 'sub_admin') return true

      // Check effective_permissions map
      const entry = effectiveMap[permissionKey]
      if (entry) return entry.allowed === true

      // Fallback: check legacy capabilities list
      const caps = new Set(user.capabilities || user.permissions || [])
      if (caps.has(permissionKey)) return true

      // Wildcard check
      if (caps.has('*')) return true

      return false
    }
  }, [user, effectiveMap])

  /**
   * Get the full authorization result for a permission key.
   */
  const effective = useMemo(() => {
    return (permissionKey) => {
      if (!permissionKey || !user) return null
      return effectiveMap[permissionKey] || null
    }
  }, [user, effectiveMap])

  /**
   * Check if the current user has access to a module.
   */
  const hasModule = useMemo(() => {
    return (moduleId) => {
      if (!user) return false
      return hasModuleAccess(user.role, user.modules, moduleId)
    }
  }, [user])

  return { can, effective, hasModule, user }
}

export default usePermissions
