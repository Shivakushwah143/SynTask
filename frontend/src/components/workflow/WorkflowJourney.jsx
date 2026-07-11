import { ArrowDown, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

const defaultSteps = [
  { label: 'Login', href: '/login', tone: 'bg-black text-white dark:bg-black' },
  { label: 'Lead Import', href: '/crm/leads', tone: 'bg-primary-600 text-white' },
  { label: 'Lead Assignment', href: '/crm/pipeline', tone: 'bg-primary-700 text-white' },
  { label: 'Sales Pipeline', href: '/sales/pipeline', tone: 'bg-emerald-600 text-white' },
  { label: 'Won / Lost', href: '/sales/prospects', tone: 'bg-amber-600 text-white' },
  { label: 'Client', href: '/clients', tone: 'bg-orange-600 text-white' },
  { label: 'Project', href: '/projects', tone: 'bg-sky-700 text-white' },
  { label: 'Tasks', href: '/tasks', tone: 'bg-teal-600 text-white' },
  { label: 'Delivery', href: '/projects', tone: 'bg-rose-600 text-white' },
  { label: 'Reporting', href: '/reports', tone: 'bg-stone-700 text-white' },
  { label: 'Renewal', href: '/crm/reports', tone: 'bg-amber-700 text-white' },
]

export default function WorkflowJourney({ title = 'End-to-end workflow', description, steps = defaultSteps, className = '' }) {
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
        {steps.map((step, index) => (
          <div key={step.label} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to={step.href}
              className={`inline-flex min-w-0 flex-1 items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5 hover:shadow-md ${step.tone}`}
            >
              <span className="truncate">{step.label}</span>
              <ArrowRight className="h-4 w-4 flex-shrink-0" />
            </Link>
            {index < steps.length - 1 ? (
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
