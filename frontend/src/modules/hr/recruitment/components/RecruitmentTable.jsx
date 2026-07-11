import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Columns3 } from "lucide-react";

import { Button } from "../../../../components/ui";
import { totalFrom } from "../utils/data";
import { EmptyRecruitmentState, ErrorState, LoadingState } from "./States";

export function RecruitmentTable({ query, columns, data, emptyTitle, emptyDescription, page, pageSize, onPageChange, rowKey = "id" }) {
  const [selected, setSelected] = useState([]);
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const visibleColumns = useMemo(() => columns.filter((column) => !hiddenColumns.includes(column.key)), [columns, hiddenColumns]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;

  const total = totalFrom(query.data);
  const hasNext = query.data?.has_next || page * pageSize < total;
  const rowIds = data.map((row, index) => row[rowKey] || row._id || index);
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.includes(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected((current) => current.filter((id) => !rowIds.includes(id)));
      return;
    }
    setSelected((current) => [...new Set([...current, ...rowIds])]);
  };
  const toggleRow = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleColumn = (key) => setHiddenColumns((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);

  if (!data.length) return <EmptyRecruitmentState title={emptyTitle} description={emptyDescription} />;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl border border-surface-border bg-surface shadow-card dark:border-gray-800 dark:bg-gray-950">
        <div className="flex flex-col gap-3 border-b border-surface-border bg-surface/95 px-4 py-3 backdrop-blur dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-text-primary">
            {selected.length ? `${selected.length} selected` : `${total} records`}
          </p>
          <div className="relative">
            <Button type="button" size="sm" variant="secondary" onClick={() => setColumnMenuOpen((open) => !open)} aria-expanded={columnMenuOpen}>
              <Columns3 className="h-4 w-4" /> Columns
            </Button>
            {columnMenuOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-surface-border bg-surface p-2 shadow-modal dark:border-gray-800 dark:bg-gray-950">
                {columns.filter((column) => column.key !== "actions").map((column) => (
                  <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-text-primary hover:bg-surface-muted">
                    <input type="checkbox" checked={!hiddenColumns.includes(column.key)} onChange={() => toggleColumn(column.key)} />
                    {column.header}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="max-w-full overflow-x-auto">
          <table className="min-w-full divide-y divide-surface-border text-sm dark:divide-gray-800">
            <thead className="sticky top-0 z-10 bg-surface-muted/95 backdrop-blur dark:bg-gray-900/95">
              <tr>
                <th className="w-12 px-4 py-3 text-left">
                  <input aria-label="Select all rows" type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                {visibleColumns.map((column) => (
                  <th
                    key={column.key}
                    className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-text-muted ${column.key === "actions" ? "sticky right-0 z-20 bg-surface-muted/95 dark:bg-gray-900/95" : ""}`}
                    style={{ minWidth: column.minWidth || 140 }}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border dark:divide-gray-800">
              {data.map((row, index) => {
                const id = row[rowKey] || row._id || index;
                return (
                  <tr key={id} tabIndex={0} className="group outline-none transition-colors hover:bg-primary-50/50 focus:bg-primary-50/70 dark:hover:bg-gray-900 dark:focus:bg-gray-900">
                    <td className="px-4 py-3">
                      <input aria-label="Select row" type="checkbox" checked={selected.includes(id)} onChange={() => toggleRow(id)} />
                    </td>
                    {visibleColumns.map((column) => (
                      <td key={column.key} className={`whitespace-nowrap px-4 py-3 text-text-primary ${column.key === "actions" ? "sticky right-0 bg-surface shadow-[-12px_0_20px_rgba(0,0,0,0.04)] dark:bg-gray-950" : ""}`}>
                        {column.render ? column.render(row) : row[column.key]}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface px-4 py-3 text-sm text-text-muted dark:border-gray-800 dark:bg-gray-950 sm:flex-row sm:items-center sm:justify-between">
        <span>Page {page} / {Math.max(1, Math.ceil(total / pageSize))} · {total} total</span>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={!hasNext} onClick={() => onPageChange(page + 1)}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
