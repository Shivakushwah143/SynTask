import { CalendarClock } from "lucide-react";

import { fmtDateTime, idOf, toArray } from "../utils/data";

export function RecruitmentTimeline({ events }) {
  const items = toArray(events);
  if (!items.length) return <p className="text-sm text-text-muted">No timeline events yet.</p>;

  return (
    <div className="space-y-3">
      {items.map((event, index) => (
        <div key={idOf(event) || index} className="flex gap-3 rounded-2xl border border-surface-border p-3 dark:border-gray-800">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-950/50 dark:text-primary-200">
            <CalendarClock className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-text-primary">{event.event_type || event.eventType || "Activity"}</p>
            <p className="text-xs text-text-muted">{fmtDateTime(event.created_at || event.createdAt)}</p>
            {event.payload ? <pre className="mt-2 max-h-32 overflow-auto rounded-xl bg-surface-muted p-2 text-xs text-text-muted">{JSON.stringify(event.payload, null, 2)}</pre> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
