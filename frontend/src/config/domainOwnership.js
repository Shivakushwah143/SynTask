export const DOMAIN_OWNERS = Object.freeze({
  lead: 'crm',
  client: 'crm',
  project: 'projects',
  task: 'tasks',
  campaign: 'marketing',
  content: 'marketing',
  publication: 'marketing',
  invoice: 'finance',
  agreement: 'finance',
  attendance: 'attendance',
  ai: 'ai_platform',
  notification: 'notification_center',
  timeline: 'timeline',
  reports: 'reporting',
})

// Compatibility adapter: current accounts only carry task/sales entitlements.
// Remove fallbacks after owner-specific entitlements are deployed and migrated.
export const LEGACY_OWNER_ENTITLEMENTS = Object.freeze({
  crm: null,
  projects: 'task',
  tasks: 'task',
  marketing: 'task',
  finance: 'task',
  attendance: null,
  ai_platform: 'task',
  notification_center: null,
  timeline: null,
  reporting: 'task',
})

export const canAccessOwner = ({ owner, legacyModule }, user, isSuperAdmin = false) => {
  if (isSuperAdmin) return true
  const entitlement = legacyModule === undefined ? LEGACY_OWNER_ENTITLEMENTS[owner] : legacyModule
  return !entitlement || user?.modules?.includes(entitlement)
}
