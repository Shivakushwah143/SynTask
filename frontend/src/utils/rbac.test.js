// SynTask — RBAC permission domain isolation tests.
//
// Verifies that People/HR and Recruitment permission domains are independent:
//   - People modules (employees, payroll, documents, attendance, leave) use "hr"
//   - Recruitment modules (jobs, candidates, interviews, offers) use "recruitment"
//   - One domain does not grant access to the other
//   - Admin/SubAdmin/SuperAdmin retain full access
//   - Legacy auto-grants still work for backward compatibility

import { describe, expect, it } from 'vitest'
import { hasModuleAccess, hasCapability, hasDepartment } from './rbac'
import { ROLE } from './roles'
import { isLegacyModules } from '../config/modulePermissions'
import { resolveHrSection, getSectionItems } from '../config/navigation'
import { HR_MODULES } from '../config/hrModules'

// ── Test users (explicit module lists, NOT legacy) ─────────────────────────
const recruitmentOnlyUser = {
  role: ROLE.MANAGER,
  modules: ['projects', 'tasks', 'recruitment'],
}

const peopleOnlyUser = {
  role: ROLE.MANAGER,
  modules: ['projects', 'tasks', 'hr'],
}

const bothDomainsUser = {
  role: ROLE.MANAGER,
  modules: ['projects', 'tasks', 'hr', 'recruitment'],
}

const noHrUser = {
  role: ROLE.EMPLOYEE,
  modules: ['projects', 'tasks'],
}

const adminUser = {
  role: ROLE.ADMIN,
  modules: ['projects', 'tasks'],
}

const subAdminUser = {
  role: ROLE.SUB_ADMIN,
  modules: ['projects', 'tasks'],
}

const superAdminUser = {
  role: ROLE.SUPER_ADMIN,
  modules: [],
}

const legacyManagerUser = {
  role: ROLE.MANAGER,
  modules: [],  // empty = legacy config
}

// ── People module checks ──────────────────────────────────────────────────
const PEOPLE_MODULES = ['hr', 'attendance', 'leave_management', 'attendance_reports', 'live_attendance']
const RECRUITMENT_MODULES = ['recruitment']

describe('People/HR permission domain', () => {
  it('People-only user has access to all People modules', () => {
    for (const mod of PEOPLE_MODULES) {
      expect(hasModuleAccess(peopleOnlyUser.role, peopleOnlyUser.modules, mod)).toBe(true)
    }
  })

  it('People-only user does NOT have access to Recruitment', () => {
    expect(hasModuleAccess(peopleOnlyUser.role, peopleOnlyUser.modules, 'recruitment')).toBe(false)
  })

  it('Recruitment-only user does NOT have access to People modules', () => {
    for (const mod of PEOPLE_MODULES) {
      expect(hasModuleAccess(recruitmentOnlyUser.role, recruitmentOnlyUser.modules, mod)).toBe(false)
    }
  })

  it('User with no HR permissions cannot access People modules', () => {
    for (const mod of PEOPLE_MODULES) {
      expect(hasModuleAccess(noHrUser.role, noHrUser.modules, mod)).toBe(false)
    }
  })

  it('"hr" module is recognized and passes through hasModuleAccess', () => {
    expect(hasModuleAccess(peopleOnlyUser.role, peopleOnlyUser.modules, 'hr')).toBe(true)
    expect(hasModuleAccess(recruitmentOnlyUser.role, recruitmentOnlyUser.modules, 'hr')).toBe(false)
  })
})

// ── Recruitment permission domain ─────────────────────────────────────────
describe('Recruitment permission domain', () => {
  it('Recruitment-only user has access to Recruitment', () => {
    expect(hasModuleAccess(recruitmentOnlyUser.role, recruitmentOnlyUser.modules, 'recruitment')).toBe(true)
  })

  it('People-only user does NOT have access to Recruitment', () => {
    expect(hasModuleAccess(peopleOnlyUser.role, peopleOnlyUser.modules, 'recruitment')).toBe(false)
  })

  it('User with no HR permissions cannot access Recruitment', () => {
    expect(hasModuleAccess(noHrUser.role, noHrUser.modules, 'recruitment')).toBe(false)
  })
})

// ── Combined domain access ────────────────────────────────────────────────
describe('Both domains together', () => {
  it('User with both domains can access both People and Recruitment', () => {
    for (const mod of PEOPLE_MODULES) {
      expect(hasModuleAccess(bothDomainsUser.role, bothDomainsUser.modules, mod)).toBe(true)
    }
    expect(hasModuleAccess(bothDomainsUser.role, bothDomainsUser.modules, 'recruitment')).toBe(true)
  })
})

// ── Admin/SubAdmin/SuperAdmin always pass ──────────────────────────────────
describe('Admin roles have full access', () => {
  it('Admin can access all People modules', () => {
    for (const mod of PEOPLE_MODULES) {
      expect(hasModuleAccess(adminUser.role, adminUser.modules, mod)).toBe(true)
    }
  })

  it('Admin can access Recruitment', () => {
    expect(hasModuleAccess(adminUser.role, adminUser.modules, 'recruitment')).toBe(true)
  })

  it('SubAdmin can access all People modules', () => {
    for (const mod of PEOPLE_MODULES) {
      expect(hasModuleAccess(subAdminUser.role, subAdminUser.modules, mod)).toBe(true)
    }
  })

  it('SubAdmin can access Recruitment', () => {
    expect(hasModuleAccess(subAdminUser.role, subAdminUser.modules, 'recruitment')).toBe(true)
  })

  it('SuperAdmin can access all modules', () => {
    for (const mod of [...PEOPLE_MODULES, ...RECRUITMENT_MODULES]) {
      expect(hasModuleAccess(superAdminUser.role, superAdminUser.modules, mod)).toBe(true)
    }
  })
})

// ── Legacy auto-grant ─────────────────────────────────────────────────────
describe('Legacy backward compatibility', () => {
  it('empty module list is detected as legacy', () => {
    expect(isLegacyModules([])).toBe(true)
  })

  it('["task"] is detected as legacy', () => {
    expect(isLegacyModules(['task'])).toBe(true)
  })

  it('["task", "attendance_leaves"] is detected as legacy', () => {
    expect(isLegacyModules(['task', 'attendance_leaves'])).toBe(true)
  })

  it('explicit module list is NOT legacy', () => {
    expect(isLegacyModules(['projects', 'tasks', 'hr'])).toBe(false)
    expect(isLegacyModules(['projects', 'tasks', 'recruitment'])).toBe(false)
  })

  it('legacy Manager auto-gets "hr" access', () => {
    expect(hasModuleAccess(legacyManagerUser.role, legacyManagerUser.modules, 'hr')).toBe(true)
  })

  it('legacy Manager auto-gets "recruitment" access', () => {
    expect(hasModuleAccess(legacyManagerUser.role, legacyManagerUser.modules, 'recruitment')).toBe(true)
  })

  it('legacy Manager auto-gets workforce modules', () => {
    expect(hasModuleAccess(legacyManagerUser.role, legacyManagerUser.modules, 'attendance')).toBe(true)
    expect(hasModuleAccess(legacyManagerUser.role, legacyManagerUser.modules, 'leave_management')).toBe(true)
  })
})

// ── HR module alias resolution ─────────────────────────────────────────────
describe('"hr" module alias resolution', () => {
  it('"hr" is accessible when user has "hr" in modules', () => {
    expect(hasModuleAccess(ROLE.MANAGER, ['hr'], 'hr')).toBe(true)
  })

  it('"hr" is accessible when user has "attendance_leaves"', () => {
    expect(hasModuleAccess(ROLE.MANAGER, ['attendance_leaves'], 'hr')).toBe(true)
  })

  it('"hr" is accessible when user has individual workforce modules', () => {
    expect(hasModuleAccess(ROLE.MANAGER, ['attendance'], 'hr')).toBe(true)
    expect(hasModuleAccess(ROLE.MANAGER, ['leave_management'], 'hr')).toBe(true)
  })

  it('"hr" is NOT accessible when user has only "recruitment"', () => {
    expect(hasModuleAccess(ROLE.MANAGER, ['recruitment'], 'hr')).toBe(false)
  })

  it('"recruitment" is NOT accessible when user has only "hr"', () => {
    expect(hasModuleAccess(ROLE.MANAGER, ['hr'], 'recruitment')).toBe(false)
  })
})

// ── Navigation route ownership ─────────────────────────────────────────────
describe('HR route section ownership (resolveHrSection)', () => {
  it('People routes resolve to "people" section', () => {
    expect(resolveHrSection('/hr/dashboard').sectionKey).toBe('people')
    expect(resolveHrSection('/hr/employees').sectionKey).toBe('people')
    expect(resolveHrSection('/hr/documents').sectionKey).toBe('people')
    expect(resolveHrSection('/hr/payroll').sectionKey).toBe('people')
  })

  it('Recruitment routes resolve to "recruitment" section', () => {
    expect(resolveHrSection('/hr/recruitment').sectionKey).toBe('recruitment')
    expect(resolveHrSection('/hr/recruitment/jobs').sectionKey).toBe('recruitment')
    expect(resolveHrSection('/hr/recruitment/candidates').sectionKey).toBe('recruitment')
    expect(resolveHrSection('/hr/recruitment/inbox').sectionKey).toBe('recruitment')
  })

  it('/hr root resolves to null (no section)', () => {
    expect(resolveHrSection('/hr')).toBeNull()
  })

  it('non-HR paths resolve to null', () => {
    expect(resolveHrSection('/crm/leads')).toBeNull()
    expect(resolveHrSection('/dashboard')).toBeNull()
  })
})

// ── Department and capability gates ────────────────────────────────────────
describe('Department and capability isolation', () => {
  it('hasCapability returns true when capability is present', () => {
    const user = { role: ROLE.MANAGER, capabilities: ['employee_management.view'] }
    expect(hasCapability(user, 'employee_management.view')).toBe(true)
  })

  it('hasCapability returns false when capability is absent', () => {
    const user = { role: ROLE.MANAGER, capabilities: ['recruitment.view'] }
    expect(hasCapability(user, 'employee_management.view')).toBe(false)
  })

  it('hasCapability returns true for SuperAdmin regardless of capabilities', () => {
    const user = { role: ROLE.SUPER_ADMIN, capabilities: [] }
    expect(hasCapability(user, 'employee_management.view')).toBe(true)
  })

  it('hasDepartment returns true when department matches', () => {
    const user = { role: ROLE.MANAGER, department: 'hr' }
    expect(hasDepartment(user, 'hr')).toBe(true)
  })

  it('hasDepartment returns false when department does not match', () => {
    const user = { role: ROLE.MANAGER, department: 'sales' }
    expect(hasDepartment(user, 'hr')).toBe(false)
  })

  it('hasDepartment returns true for SuperAdmin regardless', () => {
    const user = { role: ROLE.SUPER_ADMIN, department: 'sales' }
    expect(hasDepartment(user, 'hr')).toBe(true)
  })
})

// ── Sensitive nested action protection ─────────────────────────────────────
describe('Sensitive nested actions are independently protected', () => {
  it('"hr" module does NOT automatically grant salary_management capabilities', () => {
    // Having the "hr" module in modules[] grants navigation visibility,
    // but salary/payroll operations require specific capabilities.
    const user = { role: ROLE.MANAGER, capabilities: ['employee_management.view'] }
    expect(hasCapability(user, 'salary_management.view')).toBe(false)
    expect(hasCapability(user, 'payroll.approve')).toBe(false)
  })

  it('"recruitment" module does NOT grant employee_management capabilities', () => {
    const user = { role: ROLE.MANAGER, capabilities: ['recruitment.view'] }
    expect(hasCapability(user, 'employee_management.view')).toBe(false)
    expect(hasCapability(user, 'leave_management.approve')).toBe(false)
  })
})

// ── Permission domain isolation (no cross-contamination) ──────────────────
describe('Permission domain isolation — no cross-contamination', () => {
  const permissionPairs = [
    ['hr', 'recruitment'],
    ['attendance', 'recruitment'],
    ['leave_management', 'recruitment'],
  ]

  for (const [modA, modB] of permissionPairs) {
    it(`having "${modA}" does NOT grant "${modB}"`, () => {
      expect(hasModuleAccess(ROLE.MANAGER, [modA], modB)).toBe(false)
    })

    it(`having "${modB}" does NOT grant "${modA}"`, () => {
      expect(hasModuleAccess(ROLE.MANAGER, [modB], modA)).toBe(false)
    })
  }
})

// ── Section ownership regression tests ─────────────────────────────────────
// These verify that People and Recruitment sections contain only their own
// items after the domain separation. They protect against items creeping into
// the wrong section in future changes.
describe('Section ownership regression', () => {
  // Import the HR module definitions to verify ownership assignments.
  // This is a structural test — if someone moves a module to the wrong owner,
  // these tests will fail.
  it('People section items all have owner "people" and module "hr"', () => {
    const peopleModules = HR_MODULES.filter(m => m.owner === 'people')
    expect(peopleModules.length).toBeGreaterThan(0)

    for (const mod of peopleModules) {
      expect(mod.module).toBe('hr')
      expect(mod.owner).toBe('people')
    }
  })

  it('Recruitment section items all have owner "recruitment"', () => {
    const recruitmentModules = HR_MODULES.filter(m => m.owner === 'recruitment')
    expect(recruitmentModules.length).toBeGreaterThan(0)

    for (const mod of recruitmentModules) {
      // Note: the recruitment module still gates via module:"hr" in the
      // permission system. The owner field is what determines section placement.
      expect(mod.owner).toBe('recruitment')
    }
  })

  it('no HR module has both owners assigned simultaneously', () => {
    for (const mod of HR_MODULES) {
      expect(['people', 'recruitment']).toContain(mod.owner)
      // Ensure owner is exactly one of the two
      expect(typeof mod.owner).toBe('string')
    }
  })

  it('Employees module is owned by People, not Recruitment', () => {
    const employees = HR_MODULES.find(m => m.key === 'employees' || m.basePath === '/hr/employees')
    expect(employees).toBeDefined()
    expect(employees.owner).toBe('people')
    expect(employees.module).toBe('hr')
  })

  it('Recruitment Inbox navigation is owned by Recruitment section', () => {
    // The Inbox nav item lives inside the "recruitment" module block
    const recruitment = HR_MODULES.find(m => m.key === 'recruitment')
    expect(recruitment).toBeDefined()
    expect(recruitment.owner).toBe('recruitment')
    // The Inbox item is one of its navigation items
    const inboxItem = recruitment.navigation.find(n => n.name === 'Inbox')
    expect(inboxItem).toBeDefined()
    expect(inboxItem.href).toBe('/hr/recruitment/inbox')
  })

  it('getSectionItems with "people" excludes recruitment modules', () => {
    // Build a mock user with both hr and recruitment access
    const user = { role: ROLE.ADMIN, modules: ['hr', 'recruitment'] }
    const peopleItems = getSectionItems('people', user)
    const recruitmentItems = getSectionItems('recruitment', user)

    // People items should not contain any recruitment-owned modules
    for (const item of peopleItems) {
      expect(item.moduleKey).not.toBe('recruitment')
    }
    // Recruitment items should all have moduleKey === 'recruitment'
    for (const item of recruitmentItems) {
      expect(item.moduleKey).toBe('recruitment')
    }
  })
})

// ── One-route-one-owner tests ──────────────────────────────────────────────
describe('One-route-one-owner', () => {
  it('every HR route resolves to exactly one section (people or recruitment)', () => {
    for (const mod of HR_MODULES) {
      if (!mod.href) continue
      const result = resolveHrSection(mod.href)
      expect(result).not.toBeNull()
      expect(['people', 'recruitment']).toContain(result.sectionKey)
      // The resolved section must match the module's declared owner
      expect(result.sectionKey).toBe(mod.owner)
    }
  })

  it('no route resolves to both people and recruitment', () => {
    const seenHrefs = new Map()
    for (const mod of HR_MODULES) {
      if (!mod.href) continue
      const prev = seenHrefs.get(mod.href)
      if (prev) {
        // Same href registered under different owners — that's a conflict
        fail(`Route ${mod.href} is registered under both "${prev}" and "${mod.owner}"`)
      }
      seenHrefs.set(mod.href, mod.owner)
    }
  })

  it('employee detail routes resolve to "people"', () => {
    expect(resolveHrSection('/hr/employees/emp-123').sectionKey).toBe('people')
  })

  it('recruitment job detail routes resolve to "recruitment"', () => {
    expect(resolveHrSection('/hr/recruitment/jobs/job-456').sectionKey).toBe('recruitment')
  })

  it('recruitment candidate detail routes resolve to "recruitment"', () => {
    expect(resolveHrSection('/hr/recruitment/candidates/c-789').sectionKey).toBe('recruitment')
  })
})
