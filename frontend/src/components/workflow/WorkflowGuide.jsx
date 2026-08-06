import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export function WorkflowGuide({ className = '', title, description, primaryAction, secondaryAction }) {
  return (
    <section className={`rounded-2xl border border-surface-border bg-gradient-to-br from-surface to-surface-muted p-4 shadow-sm dark:border-border dark:from-black dark:via-black/95 dark:to-black/90 ${className}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary-600 dark:text-primary-300">
            Next action
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-text-primary dark:text-text-primary">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-5 text-text-secondary dark:text-text-secondary">
              {description}
            </p>
          ) : null}
          {/* {nextStep ? (
            <p className="mt-4 inline-flex rounded-full bg-surface px-3 py-1 text-sm font-medium text-primary-700 ring-1 ring-primary-200 dark:bg-black/70 dark:text-primary-300 dark:ring-primary-900/50">
              {nextStep}
            </p>
          ) : null} */}
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
      {/* {bullets.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {bullets.map((bullet) => (
            <div key={bullet.label} className="rounded-2xl border border-surface-border bg-surface/95 p-4 dark:border-border dark:bg-black/70">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted dark:text-text-secondary">{bullet.label}</p>
              <p className="mt-2 text-sm leading-6 text-text-secondary dark:text-text-secondary">{bullet.value}</p>
            </div>
          ))}
        </div>
      ) : null} */}
    </section>
  )
}

function ActionButton({ action, variant }) {
  const base = 'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors'
  const styles = variant === 'primary'
    ? 'bg-primary-600 text-white hover:bg-primary-700'
    : 'bg-surface text-text-secondary ring-1 ring-surface-border hover:bg-surface-muted dark:bg-black/70 dark:text-text-secondary dark:ring-border dark:hover:bg-white/5'

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
