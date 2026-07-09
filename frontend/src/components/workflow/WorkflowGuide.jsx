import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export function WorkflowGuide({ className = '', title, description, nextStep, primaryAction, secondaryAction, bullets = [] }) {
  return (
    <section className={`rounded-3xl border border-emerald-100/80 bg-gradient-to-br from-emerald-50 via-white to-white p-5 shadow-sm dark:border-gray-800 dark:from-emerald-950/20 dark:via-gray-900 dark:to-gray-900 ${className}`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">
            Next action
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            {title}
          </h2>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">
              {description}
            </p>
          ) : null}
          {nextStep ? (
            <p className="mt-4 inline-flex rounded-full bg-white/80 px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-gray-900/80 dark:text-emerald-300 dark:ring-emerald-900/50">
              {nextStep}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {secondaryAction ? (
            <ActionButton action={secondaryAction} variant="secondary" />
          ) : null}
          {primaryAction ? (
            <ActionButton action={primaryAction} variant="primary" />
          ) : null}
        </div>
      </div>
      {bullets.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {bullets.map((bullet) => (
            <div key={bullet.label} className="rounded-2xl border border-emerald-100 bg-white/80 p-4 dark:border-gray-800 dark:bg-gray-950/70">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">{bullet.label}</p>
              <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">{bullet.value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function ActionButton({ action, variant }) {
  const base = 'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors'
  const styles = variant === 'primary'
    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
    : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-800'

  if (!action) return null
  if (action.href) {
    return (
      <Link to={action.href} className={`${base} ${styles}`}>
        <span>{action.label}</span>
        <ArrowRight className="h-4 w-4" />
      </Link>
    )
  }

  return (
    <button type="button" onClick={action.onClick} className={`${base} ${styles}`}>
      <span>{action.label}</span>
      <ArrowRight className="h-4 w-4" />
    </button>
  )
}
