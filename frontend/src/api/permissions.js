/**
 * Permission API client — thin wrappers around the admin-permissions backend.
 *
 * These endpoints are the SINGLE authoritative path for reading and writing:
 *   - module visibility
 *   - permission overrides
 *   - effective permissions
 *
 * Both /users and /admin-permissions MUST use these functions.
 */
import api from './axios'

// ── Catalog ──────────────────────────────────────────────────────────────────

/** Fetch the canonical permission catalog + scopes. */
export const getPermissionCatalog = async () => {
  const res = await api.get('/admin/permissions/catalog')
  return res.data ?? res
}

/** Fetch the full admin overview (catalog + departments + employees + admins). */
export const getPermissionsOverview = async () => {
  const res = await api.get('/admin/permissions/overview')
  return res.data ?? res
}

// ── Single-user read ─────────────────────────────────────────────────────────

/** Fetch a single user's modules, overrides, and effective permissions. */
export const getUserPermissions = async (userId) => {
  const res = await api.get(`/admin/permissions/users/${userId}`)
  return res.data ?? res
}

// ── Single-user writes ───────────────────────────────────────────────────────

/** Update a user's module visibility list. */
export const updateUserModules = async (userId, modules) => {
  const res = await api.put(`/admin/permissions/users/${userId}/modules`, { modules })
  return res.data ?? res
}

/** Update a user's granular permission overrides. */
export const updateUserOverrides = async (userId, overrides) => {
  const res = await api.put(`/admin/permissions/users/${userId}`, { overrides })
  return res.data ?? res
}

/** Save both modules + overrides atomically (sequential, not transactional). */
export const saveUserAccess = async (userId, { modules, overrides }) => {
  const [modRes, overRes] = await Promise.all([
    updateUserModules(userId, modules),
    updateUserOverrides(userId, overrides),
  ])
  return { modules: modRes.modules, overrides: overRes.overrides }
}

// ── Department ───────────────────────────────────────────────────────────────

export const updateDepartmentModules = async (departmentId, modules) => {
  const res = await api.put(`/admin/permissions/departments/${departmentId}/modules`, { modules })
  return res.data ?? res
}

export const applyDepartmentModules = async (departmentId) => {
  const res = await api.post(`/admin/permissions/departments/${departmentId}/apply`)
  return res.data ?? res
}

// ── Promote / Demote ─────────────────────────────────────────────────────────

export const promoteUser = async (userId) => {
  const res = await api.post(`/admin/permissions/users/${userId}/promote`)
  return res.data ?? res
}

export const demoteUser = async (userId) => {
  const res = await api.post(`/admin/permissions/users/${userId}/demote`)
  return res.data ?? res
}
