export function PageHeader({ title, description, actions }) {
  return (
    <div className=" flex min-w-0 max-w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-bold text-text-primary dark:text-text-primary">{title}</h1>
        {description ? <p className="mt-1 text-sm text-text-muted dark:text-text-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
