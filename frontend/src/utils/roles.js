export const ROLE = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  LEAD: 'lead',
  EMPLOYEE: 'employee',
}

const ROLE_ALIASES = {
  companyadmin: ROLE.ADMIN,
  company_admin: ROLE.ADMIN,
  superadmin: ROLE.SUPER_ADMIN,
  super_admin: ROLE.SUPER_ADMIN,
}

export const normalizeRole = (role) => {
  if (!role) return null

  const normalized = String(role).trim().toLowerCase().replace(/[\s-]+/g, '_')
  const compact = normalized.replace(/_/g, '')

  return ROLE_ALIASES[normalized] || ROLE_ALIASES[compact] || normalized
}

export const isSuperAdminRole = (role) => normalizeRole(role) === ROLE.SUPER_ADMIN

export const isAdminRole = (role) => normalizeRole(role) === ROLE.ADMIN

export const isManagerRole = (role) => normalizeRole(role) === ROLE.MANAGER

export const isLeadRole = (role) => normalizeRole(role) === ROLE.LEAD

export const isEmployeeRole = (role) => normalizeRole(role) === ROLE.EMPLOYEE

export const hasCompanyAdminAccess = (role) => {
  const normalized = normalizeRole(role)
  return normalized === ROLE.ADMIN || normalized === ROLE.SUPER_ADMIN
}

export const getRoleLabel = (role) => {
  const normalized = normalizeRole(role)

  switch (normalized) {
    case ROLE.SUPER_ADMIN:
      return 'Super Admin'
    case ROLE.ADMIN:
      return 'Company Admin'
    case ROLE.MANAGER:
      return 'Manager'
    case ROLE.LEAD:
      return 'Lead'
    case ROLE.EMPLOYEE:
      return 'Employee'
    default:
      return normalized ? normalized.replace(/_/g, ' ') : ''
  }
}
