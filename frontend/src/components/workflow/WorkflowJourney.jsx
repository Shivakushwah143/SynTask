import { ArrowDown, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

const defaultSteps = [
  { label: 'Login', href: '/login', tone: 'bg-slate-900 text-white' },
  { label: 'Lead Import', href: '/crm/leads', tone: 'bg-sky-600 text-white' },
  { label: 'Lead Assignment', href: '/crm/pipeline', tone: 'bg-cyan-600 text-white' },
  { label: 'Sales Pipeline', href: '/sales/pipeline', tone: 'bg-emerald-600 text-white' },
  { label: 'Won / Lost', href: '/sales/prospects', tone: 'bg-amber-600 text-white' },
  { label: 'Client', href: '/clients', tone: 'bg-violet-600 text-white' },
  { label: 'Project', href: '/projects', tone: 'bg-indigo-600 text-white' },
  { label: 'Tasks', href: '/tasks', tone: 'bg-teal-600 text-white' },
  { label: 'Delivery', href: '/projects', tone: 'bg-fuchsia-600 text-white' },
  { label: 'Reporting', href: '/reports', tone: 'bg-slate-700 text-white' },
  { label: 'Renewal', href: '/crm/reports', tone: 'bg-rose-600 text-white' },
]

export default function WorkflowJourney({ title = 'End-to-end workflow', description, steps = defaultSteps, className = '' }) {
  return (
    <section className={`rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 ${className}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-600">Workflow</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">{title}</h2>
          {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">{description}</p> : null}
        </div>
        <div className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
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
              <div className="hidden items-center justify-center text-slate-300 sm:flex">
                <ArrowRight className="h-4 w-4 rotate-90" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}
