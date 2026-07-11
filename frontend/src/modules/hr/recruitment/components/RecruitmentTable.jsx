import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Table } from "../../../../components/ui";
import { totalFrom } from "../utils/data";
import { EmptyRecruitmentState, ErrorState, LoadingState } from "./States";

export function RecruitmentTable({ query, columns, data, emptyTitle, emptyDescription, page, pageSize, onPageChange }) {
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;

  const total = totalFrom(query.data);
  const hasNext = query.data?.has_next || page * pageSize < total;

  if (!data.length) {
    return <EmptyRecruitmentState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-4">
      <Table columns={columns} data={data} />
      <div className="flex items-center justify-between rounded-2xl border border-surface-border bg-surface px-4 py-3 text-sm text-text-muted dark:border-gray-800 dark:bg-gray-950">
        <span>Page {page} · {total} total</span>
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

