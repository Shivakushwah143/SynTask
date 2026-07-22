import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button, EmptyState, SkeletonTable } from "../../../../components/ui";

export function LoadingState({ type = "table" }) {
  if (type === "cards") {
    return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-32 animate-pulse" />)}</div>;
  }
  return <SkeletonTable rows={6} cols={5} />;
}

export function ErrorState({ title = "Unable to load data", onRetry }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title={title}
      description="The request failed. Check backend availability or permissions, then retry."
      action={onRetry ? <Button type="button" onClick={onRetry}>Retry</Button> : null}
    />
  );
}

export function EmptyRecruitmentState({ title, description, action }) {
  return <EmptyState icon={RefreshCw} title={title} description={description} action={action} />;
}

