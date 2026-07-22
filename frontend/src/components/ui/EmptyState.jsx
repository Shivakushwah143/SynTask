export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="empty-state flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-14 text-center dark:border-gray-700 dark:bg-gray-900">
      {Icon ? (
        <div className="mb-4 rounded-full bg-gray-100 p-4 dark:bg-gray-800">
          <Icon className="h-8 w-8 text-gray-400 dark:text-gray-500" />
        </div>
      ) : null}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      {description ? <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}
