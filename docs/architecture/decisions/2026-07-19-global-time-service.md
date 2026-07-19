# Global Time And Timezone Service

Date: 2026-07-19

## Status

Accepted

## Context

SynTask had mixed local browser time and UTC timestamp rendering across tasks, projects, reminders, schedules, reports, CRM, attendance, leave, notifications, and activity logs.

## Decision

- Backend code uses `app.core.clock.ClockService` for current time and UTC parsing.
- Frontend code uses `frontend/src/services/timeService.js` for current time, UTC serialization, and display formatting.
- Stored timestamps remain UTC internally.
- Display conversion happens only at the frontend using selected timezone.
- Time settings are stored on the user document: `timezone`, `automatic_time`, `manual_time`, `hour_format`, and `show_seconds`.
- Browser timezone is detected on first login when no stored timezone exists.
- Editing time settings is limited to Admin and Super Admin. First-login timezone detection can write only when the user has no stored timezone.

## Tenant Isolation And Authorization

Tenant key: `company_id` remains on user and module data. Time settings are scoped to authenticated user record.

Authorization rule: `GET /api/v1/time/settings` requires authentication. `PUT /api/v1/time/settings` requires Admin or Super Admin except first-login detected timezone initialization for current user.

Negative cross-tenant case: endpoint only mutates `current_user`, so users cannot update another tenant's time settings through this API.

## Consequences

New date/time UI and backend services must use centralized services instead of direct business-time calls to `new Date()`, `Date.now()`, `datetime.now()`, or `datetime.utcnow()`.
