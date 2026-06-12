export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white py-14 text-center">
      {Icon ? (
        <div className="mb-4 rounded-full bg-gray-100 p-4">
          <Icon className="h-8 w-8 text-gray-400" />
        </div>
      ) : null}
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      {description ? <p className="mt-2 max-w-sm text-sm text-gray-500">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}
