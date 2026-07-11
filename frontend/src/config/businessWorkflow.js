// Single source of truth for business workflow navigation.
// Existing page URLs remain canonical; query parameters select workflow context.
export const BUSINESS_WORKFLOW_STEPS = [
  { key: 'lead', label: 'Lead', href: '/crm/leads', owner: 'crm' },
  { key: 'qualification', label: 'Qualification', href: '/crm/pipeline', owner: 'crm' },
  { key: 'follow-up', label: 'Follow-up', href: '/crm/activities', owner: 'crm' },
  { key: 'meeting', label: 'Meeting', href: '/meetings', owner: 'crm' },
  { key: 'proposal', label: 'Proposal', href: '/crm/pipeline?stage=proposal', owner: 'crm' },
  { key: 'negotiation', label: 'Negotiation', href: '/crm/pipeline?stage=negotiation', owner: 'crm' },
  { key: 'won', label: 'Won', href: '/crm/pipeline?stage=won', owner: 'crm' },
  { key: 'client', label: 'Client', href: '/clients', roles: ['admin'], owner: 'crm', legacyModule: 'task' },
  { key: 'project', label: 'Project', href: '/projects', owner: 'projects' },
  { key: 'tasks', label: 'Tasks', href: '/tasks', owner: 'tasks' },
  { key: 'execution', label: 'Execution', href: '/time-tracking', owner: 'tasks' },
  { key: 'invoice', label: 'Invoice', href: '/invoices', roles: ['admin'], owner: 'finance' },
  { key: 'payment', label: 'Payment', href: '/ledger', roles: ['admin'], owner: 'finance' },
  { key: 'reports', label: 'Reports', href: '/reports', owner: 'reporting' },
]

export const getWorkflowStep = (key) => BUSINESS_WORKFLOW_STEPS.find((step) => step.key === key)

export const getAdjacentWorkflowSteps = (key) => {
  const index = BUSINESS_WORKFLOW_STEPS.findIndex((step) => step.key === key)
  return {
    previous: index > 0 ? BUSINESS_WORKFLOW_STEPS[index - 1] : null,
    next: index >= 0 && index < BUSINESS_WORKFLOW_STEPS.length - 1 ? BUSINESS_WORKFLOW_STEPS[index + 1] : null,
  }
}
