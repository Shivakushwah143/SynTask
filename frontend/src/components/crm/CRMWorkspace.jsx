import { ChevronRight, Search, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../ui'
import { WorkflowGuide } from '../workflow/WorkflowGuide'

export function CRMPage({ className = '', children }) {
  return <div className={`space-y-6 ${className} bg-transparent`}>{children}</div>
}

export function CRMPageTitle({ eyebrow = 'CRM', title, description, actions }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-600 dark:text-primary-300">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 sm:text-[2rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function CRMHeader({ breadcrumbs = [], title, description, actions }) {
  return (
    <div className="rounded-2xl border border-surface-border/80 bg-white/85 p-5 shadow-sm 
    
    
    
    backdrop-blur dark:border-[var(--color-app-border)] dark:bg-[rgb(29_24_19_/_0.88)]">
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-[var(--color-app-text-muted)]">
          {breadcrumbs.map((crumb, index) => {
            const Icon = crumb.icon
            const isLast = index === breadcrumbs.length - 1
            return (
              <li key={`${crumb.label}-${crumb.href || index}`} className="flex items-center gap-2">
                {index > 0 ? <ChevronRight className="h-4 w-4 text-gray-300 dark:text-[var(--color-app-text-muted)]" /> : null}
                {crumb.href && !isLast ? (
                  <Link
                    to={crumb.href}
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 focus-visible:bg-gray-50 dark:text-[var(--color-app-text-muted)] dark:hover:bg-[var(--color-app-surface-muted)] dark:hover:text-[var(--color-app-text)]"
                  >
                    {Icon ? <Icon className="h-4 w-4" /> : null}
                    <span>{crumb.label}</span>
                  </Link>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-medium ${
                      isLast
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-200'
                        : 'text-gray-500 dark:text-[var(--color-app-text-muted)]'
                    }`}
                    aria-current={isLast ? 'page' : undefined}
                  >
                    {Icon ? <Icon className="h-4 w-4" /> : null}
                    <span>{crumb.label}</span>
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      <CRMPageTitle title={title} description={description} actions={actions} />
    </div>
  )
}

export function CRMToolbar({
  searchValue = '',
  onSearchChange,
  onSearchSubmit,
  searchPlaceholder = 'Search CRM',
  filters,
  actions,
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-surface-border/80 bg-white/85 p-4 shadow-sm backdrop-blur dark:border-[var(--color-app-border)] dark:bg-[rgb(29_24_19_/_0.88)] lg:flex-row lg:items-center lg:justify-between">
      <form
        className="flex min-w-0 flex-1 items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          onSearchSubmit?.(searchValue)
        }}
      >
        <label className="sr-only" htmlFor="crm-search">
          CRM search
        </label>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            id="crm-search"
            value={searchValue}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label="CRM search"
            className="input min-w-0 pl-10"
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" className="shrink-0">
          <Sparkles className="h-4 w-4" />
          Search
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        {filters}
        {actions}
      </div>
    </div>
  )
}

export function CRMSearch({ value, onChange, onSubmit, placeholder = 'Search workspace' }) {
  return (
    <form
      className="relative w-full sm:w-auto"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit?.(value)
      }}
    >
      <label className="sr-only" htmlFor="crm-search-inline">
        CRM search
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        id="crm-search-inline"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        className="input min-w-0 pl-10 sm:min-w-[16rem]"
        aria-label="CRM search"
      />
    </form>
  )
}

export function CRMContent({ className = '', children, aside }) {
  const hasAside = Boolean(aside)
  return (
    <div className={`grid gap-6 ${hasAside ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : ''} ${className}`}>
      <div className="min-w-0 space-y-6">{children}</div>
      {aside ? <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">{aside}</aside> : null}
    </div>
  )
}

export function CRMSection({ title, description, actions, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-primary-200/60 bg-[linear-gradient(135deg,rgba(255,250,244,0.96),rgba(248,242,232,0.9))] p-5 shadow-[0_14px_36px_rgba(63,49,37,0.07)] dark:border-[#5a4635] dark:bg-[linear-gradient(135deg,rgba(36,28,20,0.96),rgba(20,16,12,0.94))] dark:shadow-[0_18px_42px_rgba(0,0,0,0.24)] ${className}`}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}

export function CRMStatCard({ icon: Icon, label, value, helper, tone = 'blue' }) {
  const tones = {
    blue: 'from-blue-50 to-white text-blue-600 ring-blue-100 dark:from-blue-950/40 dark:to-gray-900 dark:text-blue-300 dark:ring-blue-900/40',
    emerald: 'from-emerald-50 to-white text-emerald-600 ring-emerald-100 dark:from-emerald-950/40 dark:to-gray-900 dark:text-emerald-300 dark:ring-emerald-900/40',
    amber: 'from-amber-50 to-white text-amber-600 ring-amber-100 dark:from-amber-950/40 dark:to-gray-900 dark:text-amber-300 dark:ring-amber-900/40',
    slate: 'from-slate-50 to-white text-slate-600 ring-slate-100 dark:from-slate-900 dark:to-gray-900 dark:text-slate-300 dark:ring-slate-800',
  }

  return (
    <article className="crm-icon-surface rounded-2xl border border-surface-border/80 bg-gradient-to-br from-white via-primary-50/40 to-white p-4 shadow-sm dark:border-[var(--color-app-border)] dark:from-[var(--color-app-surface)] dark:via-[var(--color-app-surface-muted)] dark:to-[var(--color-app-surface)]">
      <div className={`inline-flex rounded-2xl border p-3 ${tones[tone] || tones.blue}`}>
        {Icon ? <Icon className="h-5 w-5" /> : null}
      </div>
      <p className="mt-4 text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
        {value}
      </p>
      {helper ? <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{helper}</p> : null}
    </article>
  )
}

export function CRMEmptyState({ title, description, action, icon: Icon }) {
  return (
    <div className="empty-state rounded-2xl border border-dashed border-surface-border bg-primary-50/30 p-8 text-center dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-muted)]">
      {Icon ? (
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300">
          <Icon className="h-7 w-7" />
        </div>
      ) : null}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      {description ? (
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  )
}

export function CRMWorkspace({
  breadcrumbs = [],
  title,
  description,
  actions,
  toolbar,
  filters,
  navigation,
  activePath,
  children,
}) {
  return (
    <div className="space-y-6">
      <CRMHeader breadcrumbs={breadcrumbs} title={title} description={description} actions={actions} />
      {(toolbar || filters || navigation?.length) ? (
        <section className="space-y-4 rounded-2xl border border-surface-border/80 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-[var(--color-app-border)] dark:bg-[rgb(29_24_19_/_0.88)]">
          {navigation?.length ? (
            <nav aria-label="CRM sections" className="overflow-x-auto">
              <div className="flex min-w-max items-center gap-1 rounded-full bg-gray-50 p-1 dark:bg-[var(--color-app-surface-muted)]">
                {navigation.map((item) => {
                  const isActive = activePath === item.path || activePath?.startsWith(`${item.path}/`)
                  return (
                    <Link
                      key={item.key}
                      to={item.path}
                      aria-current={isActive ? 'page' : undefined}
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-white text-primary-700 shadow-sm dark:bg-[var(--color-app-surface-subtle)] dark:text-primary-200'
                          : 'text-gray-600 hover:text-gray-900 dark:text-[var(--color-app-text-secondary)] dark:hover:text-[var(--color-app-text)]'
                      }`}
                    >
                      <span>{item.label}</span>
                      
                    </Link>
                  )
                })}
              </div>
            </nav>
          ) : null}
          {toolbar ? <CRMToolbar {...toolbar} filters={filters} /> : null}
          {!toolbar && filters ? <div>{filters}</div> : null}
        </section>
      ) : null}
      <CRMContent>{children}</CRMContent>
    </div>
  )
}

export function CRMRoutePlaceholder({
  title,
  description,
  routeLabel,
  icon: Icon = Sparkles,
}) {
  return (
    <CRMSection title={title} description={description}>
      <WorkflowGuide
        className="mb-5"
        title={`Open the next ${routeLabel.toLowerCase()} action`}
        description="This placeholder exists to preserve the workspace contract while guiding users to the active CRM surface."
        nextStep="Use the pipeline to continue the workflow."
        primaryAction={{ label: 'Go to CRM Pipeline', href: '/crm/pipeline' }}
        secondaryAction={{ label: 'Open Dashboard', href: '/crm/dashboard' }}
        bullets={[
          { label: 'Where am I?', value: routeLabel },
          { label: 'What next?', value: 'Use the live CRM route that already has business data.' },
          { label: 'After this?', value: 'Return here when the route is implemented.' },
        ]}
      />
      <CRMEmptyState
        icon={Icon}
        title={`${routeLabel} is coming next`}
        description="This route is in place so future CRM work can land without changing the workspace contract. The pipeline remains the primary functional CRM surface."
        action={
          <Link to="/crm/pipeline" className="btn btn-secondary">
            Go to CRM Pipeline
          </Link>
        }
      />
    </CRMSection>
  )
}
