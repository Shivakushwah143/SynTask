export function Table({ columns, data, rowKey = 'id', emptyMessage = 'No records found' }) {
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-surface-border bg-surface/95 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
      <div className="viewport-scroll-x">
        <table className="min-w-full divide-y divide-surface-border dark:divide-[var(--color-app-border)]">
          <thead className="bg-surface-muted dark:bg-[var(--color-app-surface-muted)]">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-text-muted dark:text-[var(--color-app-text-muted)]">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border bg-surface/95 dark:divide-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
            {data?.length ? (
              data.map((row, index) => (
                <tr key={row[rowKey] || row._id || index} className="transition-colors hover:bg-surface-muted/80 dark:hover:bg-[var(--color-app-surface-muted)]">
                  {columns.map((column) => (
                    <td key={column.key} className="whitespace-nowrap px-5 py-4 text-sm leading-6 text-text-primary dark:text-[var(--color-app-text-secondary)]">
                      {column.render ? column.render(row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-text-muted dark:text-[var(--color-app-text-muted)]" colSpan={columns.length}>
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
