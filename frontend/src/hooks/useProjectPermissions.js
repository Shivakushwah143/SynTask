import { useMemo } from 'react'
import { ROLE, hasCompanyAdminAccess, normalizeRole } from '../utils/roles'

const PROJECT_LEAD_PERMISSIONS = {
  view_project: true,
  create_task: true,
  manage_task: true,
  assign_task: true,
  manage_board: true,
  manage_sprint: true,
  manage_epic: true,
  manage_page: true,
}

const PROJECT_MEMBER_PERMISSIONS = {
  view_project: true,
}

const idMatches = (left, right) => left && right && String(left) === String(right)
const includesId = (items, userId) => Array.isArray(items) && items.some((item) => idMatches(item, userId))

export function getEffectiveProjectRole(user, project = {}) {
  const role = normalizeRole(user?.role)
  const userId = user?.id || user?._id
  if (!userId && !hasCompanyAdminAccess(role)) return 'none'
  if ([ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.MANAGER].includes(role)) return 'org_manager'
  if (idMatches(project.lead_id, userId)) return 'project_lead'
  if (role === ROLE.LEAD && (
    idMatches(project.assigned_to, userId)
    || idMatches(project.created_by, userId)
    || includesId(project.assigned_user_ids, userId)
    || includesId(project.team_member_ids, userId)
  )) return 'project_lead'
  if (
    idMatches(project.assigned_to, userId)
    || idMatches(project.created_by, userId)
    || includesId(project.assigned_user_ids, userId)
    || includesId(project.team_member_ids, userId)
  ) return 'project_member'
  return 'none'
}

export function buildProjectPermissions(user, project = {}) {
  if (project.permissions && project.effective_project_role) {
    return {
      effectiveProjectRole: project.effective_project_role,
      permissions: project.permissions,
      hasProjectPermission: (permission) => Boolean(project.permissions?.[permission]),
    }
  }

  const effectiveProjectRole = getEffectiveProjectRole(user, project)
  const permissions = {}
  if (effectiveProjectRole === 'org_manager') {
    ;[
      'view_project',
      'manage_project',
      'create_task',
      'manage_task',
      'assign_task',
      'manage_board',
      'manage_sprint',
      'manage_epic',
      'manage_page',
    ].forEach((permission) => { permissions[permission] = true })
  } else if (effectiveProjectRole === 'project_lead') {
    Object.assign(permissions, PROJECT_LEAD_PERMISSIONS)
  } else if (effectiveProjectRole === 'project_member') {
    Object.assign(permissions, PROJECT_MEMBER_PERMISSIONS)
  }

  return {
    effectiveProjectRole,
    permissions,
    hasProjectPermission: (permission) => Boolean(permissions[permission]),
  }
}

export function useProjectPermissions(user, project) {
  return useMemo(() => buildProjectPermissions(user, project), [user, project])
}
