import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { BUSINESS_WORKFLOW_STEPS } from '../../config/businessWorkflow'
import { useAuthStore } from '../../store/authStore'
import { isSuperAdminRole, normalizeRole } from '../../utils/roles'
import { canAccessOwner } from '../../config/domainOwnership'

export default function WorkflowStepNavigation() {
  const location = useLocation()
  const workflowPathname = location.pathname === '/leads' ? '/crm/leads' : location.pathname
  const { user } = useAuthStore()
  const role = normalizeRole(user?.role)
  const steps = BUSINESS_WORKFLOW_STEPS.filter((step) => (
    (!step.roles || step.roles.includes(role) || isSuperAdminRole(role))
    && canAccessOwner(step, user, isSuperAdminRole(role))
  ))
  const currentIndex = steps.findIndex((step) => {
    const [path, search = ''] = step.href.split('?')
    if (workflowPathname !== path && !workflowPathname.startsWith(`${path}/`)) return false
    if (!search) return !new URLSearchParams(location.search).has('stage')
    const expected = new URLSearchParams(search)
    const actual = new URLSearchParams(location.search)
    return [...expected].every(([key, value]) => actual.get(key) === value)
  })

  if (currentIndex < 0) return null
  const current = steps[currentIndex]
  const previous = currentIndex > 0 ? steps[currentIndex - 1] : null
  const next = currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null

  return (
    <nav aria-label="Business workflow" className="flex items-center justify-between gap-3 border-b border-surface-border bg-surface px-4 py-2 text-sm dark:border-border dark:bg-black sm:px-6">
      {previous ? (
        <Link to={previous.href} className="inline-flex items-center gap-2 font-medium text-text-secondary hover:text-primary-600">
          <ArrowLeft className="h-4 w-4" />
          <span>{previous.label}</span>
        </Link>
      ) : <span />}
      <span className="font-semibold text-text-primary">{current.label}</span>
      {next ? (
        <Link to={next.href} className="inline-flex items-center gap-2 font-medium text-text-secondary hover:text-primary-600">
          <span>{next.label}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : <span />}
    </nav>
  )
}
