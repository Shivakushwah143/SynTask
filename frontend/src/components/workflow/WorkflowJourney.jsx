import { ArrowDown, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BUSINESS_WORKFLOW_STEPS } from '../../config/businessWorkflow'
import { useAuthStore } from '../../store/authStore'
import { isSuperAdminRole, normalizeRole } from '../../utils/roles'
import { canAccessOwner } from '../../config/domainOwnership'

const tones = ['bg-primary-600', 'bg-primary-700', 'bg-emerald-600', 'bg-sky-700', 'bg-amber-600', 'bg-orange-600', 'bg-rose-600', 'bg-teal-600', 'bg-stone-700']
const defaultSteps = BUSINESS_WORKFLOW_STEPS.map((step, index) => ({
  ...step,
  tone: `${tones[index % tones.length]} text-white`,
}))

export default function WorkflowJourney({ title = 'End-to-end workflow', description, steps = defaultSteps, className = '' }) {
  const { user } = useAuthStore()
  const role = normalizeRole(user?.role)
  const visibleSteps = steps.filter((step) => (
    (!step.roles || step.roles.includes(role) || isSuperAdminRole(role))
    && canAccessOwner(step, user, isSuperAdminRole(role))
  ))
  return (
    <section className={`rounded-3xl border border-surface-border bg-surface/95 p-6 shadow-sm dark:border-border dark:bg-black ${className}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-600">Workflow</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-text-primary dark:text-text-primary">{title}</h2>
          {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary dark:text-text-secondary">{description}</p> : null}
        </div>
        <div className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary dark:text-text-secondary">
          Scroll the lifecycle
          <ArrowDown className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        {visibleSteps.map((step, index) => (
          <div key={step.label} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to={step.href}
              className={`inline-flex min-w-0 flex-1 items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5 hover:shadow-md ${step.tone}`}
            >
              <span className="truncate">{step.label}</span>
              <ArrowRight className="h-4 w-4 flex-shrink-0" />
            </Link>
            {index < visibleSteps.length - 1 ? (
              <div className="hidden items-center justify-center text-text-muted sm:flex">
                <ArrowRight className="h-4 w-4 rotate-90" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}
