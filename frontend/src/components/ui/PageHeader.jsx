export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex min-w-0 max-w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
        {description ? <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
