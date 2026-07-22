import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "../../../../components/ui";
import { totalFrom } from "../utils/data";
import { EmptyRecruitmentState, ErrorState, LoadingState } from "./States";

export function RecruitmentTable({ query, columns, data, emptyTitle, emptyDescription, page, pageSize, onPageChange, rowKey = "id" }) {
  const [selected, setSelected] = useState([]);

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
  if (!data.length) return <EmptyRecruitmentState title={emptyTitle} description={emptyDescription} />;

  return (
    <div className="space-y-4">
      <div className="overflow-visible rounded-3xl border border-surface-border bg-surface shadow-card dark:border-gray-800 dark:bg-gray-950">
        <div className="flex flex-col gap-3 border-b border-surface-border bg-surface/95 px-4 py-3 backdrop-blur dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-text-primary">
            {selected.length ? `${selected.length} selected` : `${total} records`}
          </p>
          <div />
        </div>

        <div className="max-w-full overflow-x-auto">
          <table className="min-w-full divide-y divide-surface-border text-sm dark:divide-gray-800">
            <thead className="sticky top-0 z-10 bg-surface-muted/95 backdrop-blur dark:bg-gray-900/95">
              <tr>
                <th className="w-12 px-4 py-3 text-left">
                  <input aria-label="Select all rows" type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                {columns.map((column) => (
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
                    {columns.map((column) => (
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
