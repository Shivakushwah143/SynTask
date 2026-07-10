export function Table({ columns, data, rowKey = 'id', emptyMessage = 'No records found' }) {
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-3xl border border-surface-border bg-surface/95 dark:border-gray-800 dark:bg-black">
      <div className="viewport-scroll-x">
        <table className="min-w-full divide-y divide-surface-border dark:divide-gray-800">
          <thead className="bg-surface-muted dark:bg-gray-950">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-text-muted dark:text-gray-400">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border bg-surface/95 dark:divide-gray-800 dark:bg-black">
            {data?.length ? (
              data.map((row, index) => (
                <tr key={row[rowKey] || row._id || index} className="hover:bg-surface-muted/80 dark:hover:bg-gray-800/80">
                  {columns.map((column) => (
                    <td key={column.key} className="whitespace-nowrap px-5 py-4 text-sm text-text-primary dark:text-gray-200">
                      {column.render ? column.render(row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-text-muted dark:text-gray-400" colSpan={columns.length}>
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
