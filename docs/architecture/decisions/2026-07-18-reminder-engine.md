# ADR: Centralized Reminder Engine

## Status
Accepted

## Context
SynTask already has task due dates, content due dates, workspace/content calendars, notification APIs, dashboard toasts, and startup background loops. Deadline reminders must reuse these surfaces and avoid duplicate notifications across hourly scheduler runs.

## Decision
Implement reminders in `app.services.reminder_service` as a centralized backend service. Startup runs an hourly in-process async scheduler that checks incomplete assigned tasks and unpublished assigned content. Notifications are stored in the existing `notifications` collection with `priority`, `scheduled_for`, toast metadata, and a tenant-scoped `metadata.reminder_key`.

Duplicate protection uses a sparse unique index on `(company_id, user_id, metadata.reminder_key)`. Reminder keys include entity type, entity id, target user id, reminder type, and run date. Dashboard toasts are served through notification endpoints and acknowledged separately from read state.

## Consequences
- No new dependency is required.
- Calendar and frontend surfaces render backend-provided reminder tones instead of calculating dates client-side.
- The service can add future reminder entities by plugging new entity loaders into the same rule and notification creation flow.
- In-process scheduling is simple and matches existing startup behavior, but multi-instance production deployments may run the scheduler in more than one process. Duplicate keys prevent duplicate notifications, while a future queue/leader-election scheduler can replace the loop without changing reminder rules.

## Tenant Isolation
All reminder queries and notifications preserve `company_id`. Toast and notification APIs only expose records for `current_user.id`; cross-user acknowledgement attempts are ignored.
