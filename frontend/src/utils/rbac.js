// SynTask — Single shared RBAC utility (frontend).
//
// This is the ONE place that decides feature visibility. It mirrors the backend
// permission system exactly:
//   - `require_module` + `_module_access_allowed` in backend/app/api/dependencies.py
//   - role guards (get_current_company_admin, get_current_lead, ...)
//   - department capability gates (get_capabilities_for_role)
//
// Every consumer (sidebar, route guards, dashboard, quick actions, buttons) must
// use these helpers so the UI can never drift from what the backend allows.

import {
  ROLE,
  normalizeRole,
  isSuperAdminRole,
} from "./roles";
import { isLegacyModules } from "../config/modulePermissions";

const STANDARD_ROLE_VALUES = [
  ROLE.SUPER_ADMIN,
  ROLE.ADMIN,
  ROLE.SUB_ADMIN,
  ROLE.MANAGER,
  ROLE.LEAD,
  ROLE.EMPLOYEE,
];

/**
 * Backend-equivalent of `_normalize_role` (app/api/dependencies.py): unknown or
 * legacy roles (hr_manager, recruiter, interviewer, ...) fall back to EMPLOYEE,
 * so the UI never grants them anything the API wouldn't.
 */
export const effectiveRole = (role) => {
  const normalized = normalizeRole(role);
  if (!normalized) return null;
  return STANDARD_ROLE_VALUES.includes(normalized) ? normalized : ROLE.EMPLOYEE;
};

/**
 * Backend-equivalent of `require_module(module_name)` + `_module_access_allowed`.
 *
 * - Super Admin, Admin and Sub Admin have full access to every module.
 * - Manager / Lead / Employee with a LEGACY module list (pre-permission-system
 *   defaults) are auto-granted `sales`, `sales_crm`, `tickets` and
 *   `recruitment` (matches backend `require_module`). Members with an explicit
 *   module list are governed strictly by that list.
 * - Everyone else must have the module in `user.modules`; legacy aliases
 *   (task <-> tasks_projects, sales <-> sales_crm, chat via task) are honoured.
 */
export const hasModuleAccess = (role, modules, moduleName) => {
  if (!moduleName) return true;

  const normalized = effectiveRole(role);
  const userModules = new Set(modules || []);

  // Super Admin, Admin, and Sub Admin have full access to all modules.
  if (
    normalized === ROLE.SUPER_ADMIN ||
    normalized === ROLE.ADMIN ||
    normalized === ROLE.SUB_ADMIN
  ) {
    return true;
  }

  // Backend role auto-grant applies ONLY to legacy (pre-permission-system)
  // module lists. Explicit lists are authoritative. The set mirrors the
  // backend require_module auto-grant exactly (incl. task/tasks_projects).
  const legacyConfig = isLegacyModules(modules);
  if (
    legacyConfig &&
    ["task", "tasks_projects", "sales", "sales_crm", "tickets", "recruitment"].includes(moduleName) &&
    [ROLE.MANAGER, ROLE.LEAD, ROLE.EMPLOYEE].includes(normalized)
  ) {
    return true;
  }

  // Alias mapping mirroring backend `_module_access_allowed`.
  if (moduleName === "task" || moduleName === "tasks_projects") {
    return userModules.has("task") || userModules.has("tasks_projects");
  }
  if (moduleName === "chat") {
    return (
      userModules.has("chat") ||
      userModules.has("task") ||
      userModules.has("tasks_projects")
    );
  }
  if (moduleName === "sales_crm") {
    return userModules.has("sales_crm") || userModules.has("sales");
  }
  if (moduleName === "sales") {
    return userModules.has("sales") || userModules.has("sales_crm");
  }
  return userModules.has(moduleName);
};

/**
 * Department-capability gate (mirrors backend `require_capability`).
 * No capability requested => always allowed. Super Admin bypasses.
 */
export const hasCapability = (user, capability) => {
  if (!capability) return true;
  const caps = new Set(user?.capabilities || user?.permissions || []);
  return caps.has(capability) || isSuperAdminRole(user?.role);
};

/**
 * Department gate: `item.department` ("hr", "sales", ...) must match the user's
 * department key. No department on the user or the item => allowed.
 */
export const hasDepartment = (user, department) => {
  if (!department) return true;
  const userDepartment = String(
    user?.department || user?.department_key || ""
  ).toLowerCase();
  if (!userDepartment) return true;
  return (
    String(department).toLowerCase() === userDepartment ||
    isSuperAdminRole(user?.role)
  );
};

/**
 * Decide whether `user` may see/enter a navigation item.
 *
 * Item contract (mirrors the old `gateItem` but uses the real module system):
 *   { name, href, icon, roles?: [...], module?: string, capability?: string, department?: string }
 *
 * - Super Admin implicitly passes the role whitelist (they can access every
 *   feature), but the module/capability/department gates still apply (which for
 *   Super Admin always pass).
 * - `roles` is a strict whitelist; SUB_ADMIN mirrors ADMIN (backend convention).
 * - `module` is resolved through `hasModuleAccess` (backend `require_module`).
 */
export const canAccessNavItem = (user, item) => {
  if (!user) return false;
  const role = effectiveRole(user.role);
  if (!role) return false;

  if (item.roles) {
    const roleAllowed =
      item.roles.includes(role) ||
      (role === ROLE.SUB_ADMIN && item.roles.includes(ROLE.ADMIN)) ||
      isSuperAdminRole(role);
    if (!roleAllowed) return false;
  }

  if (!hasModuleAccess(role, user.modules, item.module)) return false;
  if (!hasCapability(user, item.capability)) return false;
  return hasDepartment(user, item.department);
};

/** Filter a list of nav items through `canAccessNavItem`. */
export const filterNavItems = (items, user) =>
  (items || []).filter((item) => canAccessNavItem(user, item));

/**
 * True when the user may use a module at all (route guards, dashboard widgets).
 * Equivalent to backend `require_module`.
 */
export const canAccessModule = (user, moduleName) =>
  hasModuleAccess(user?.role, user?.modules, moduleName);

/**
 * Role membership helper (uses the effective role). Use for action-level checks.
 */
export const hasAnyRole = (user, allowedRoles) => {
  const role = effectiveRole(user?.role);
  if (!role) return false;
  if (isSuperAdminRole(role)) return true;
  return (allowedRoles || []).includes(role);
};

export default {
  hasModuleAccess,
  hasCapability,
  hasDepartment,
  canAccessNavItem,
  filterNavItems,
  canAccessModule,
  hasAnyRole,
  effectiveRole,
};
