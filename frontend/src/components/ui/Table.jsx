export function Table({ columns, data, rowKey = 'id', emptyMessage = 'No records found' }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-app-border)] bg-[var(--color-app-surface)] shadow-[var(--color-app-shadow-soft)]">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--color-app-border)]">
          <thead className="bg-[var(--color-app-surface-muted)]">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-app-text-muted)]">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-app-border)] bg-[var(--color-app-surface)]">
            {data?.length ? (
              data.map((row, index) => (
                <tr key={row[rowKey] || row._id || index} className="transition-colors hover:bg-[var(--color-app-accent-soft)]">
                  {columns.map((column) => (
                    <td key={column.key} className="whitespace-nowrap px-4 py-3 text-sm text-[var(--color-app-text-secondary)]">
                      {column.render ? column.render(row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-[var(--color-app-text-muted)]" colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

