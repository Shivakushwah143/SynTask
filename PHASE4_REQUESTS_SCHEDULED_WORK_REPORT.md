# Phase 4 - Work Requests and Scheduled / Recurring Work Report

## 1. Executive Summary

Phase 4 adds backend-owned Work Requests and upgrades Scheduled Work from one-time jobs to one-time plus recurring rules with occurrence history. Phase 2 task workflow remains the execution authority underneath converted and scheduled Tasks.

## 2. Files Changed

- `backend/app/models/work_request.py`: new Work Request document, enums, fields, indexes.
- `backend/app/services/work_request_service.py`: validation, visibility, review, conversion, audit, notifications.
- `backend/app/api/v1/endpoints/work_requests.py`: create/list/detail/action/conversion API.
- `backend/app/models/scheduled_job.py`: recurrence fields and occurrence-history model.
- `backend/app/services/scheduling_service.py`: recurring schedule calculation, occurrence locking/history, pause/resume behavior.
- `backend/app/api/v1/endpoints/scheduled_jobs.py`: recurring create/update/list filters, occurrence list, pause, resume.
- `backend/app/core/database.py`: Beanie registration for Work Requests and Scheduled Job Occurrences.
- `backend/app/api/v1/router.py`: Work Request router registration.
- `frontend/src/api/workRequests.js`: Work Request API client.
- `frontend/src/pages/WorkRequests.jsx`: Work Request list/create/review/convert page.
- `frontend/src/api/scheduledJobs.js`: recurring filters, occurrence, pause, resume client methods.
- `frontend/src/pages/ScheduledJobs.jsx`: recurring schedule display and pause/resume actions.
- `frontend/src/App.jsx`, `frontend/src/config/navigation.js`: Work Request route and navigation.
- `backend/tests/api/test_work_requests_scheduled_phase4.py`: Work Request enum/context and recurrence tests.

## 3. Architecture Reused

Task and Project conversion use existing service paths. Phase 2 `TaskWorkflowService` remains authoritative for task execution after creation. Scheduled Jobs keep existing atomic job lock, notification, and timeline patterns.

## 4. Work Request Model

Work Requests are company-scoped records with logical `request_id`, type, title, description, status, priority, requester, reviewer, resolver, optional project/task/client context, reason/change metadata, decision metadata, and converted Task/Project references.

## 5. Work Request Lifecycle

Statuses: `submitted`, `under_review`, `approved`, `rejected`, `converted`, `cancelled`.

Open requests can be reviewed, approved, rejected, cancelled, or converted according to role/context rules. Conversion is idempotent at service level by returning the previously converted target when present.

## 6. Request Types

Supported types: `new_work`, `change_request`, `approval_request`, `deadline_extension`, `resource_request`, `blocker`, `leave_availability`, `client_request`, and `other`.

## 7. Scheduled Work

Scheduled Jobs now support `one_time` and `recurring`. Recurring jobs store recurrence, timezone, enabled state, `next_run_at`, `last_run_at`, and `occurrence_count`.

## 8. Recurrence Rules

Implemented frequencies: `daily`, `weekly`, `monthly`, and `custom`. Monthly schedules clamp invalid days to the month's last valid day. Timezone handling preserves local wall-clock intent before storing UTC.

## 9. Occurrence History

Each run creates or updates a `ScheduledJobOccurrence` with scheduled time, running/completed/failed status, result reference, error, and timestamps. A unique occurrence id prevents duplicate rows for the same scheduled run.

## 10. Pause / Resume

Pause disables a recurring pending/failed job without deleting recurrence or history. Resume re-enables it and advances missed run times to the next future occurrence; it does not backfill missed Tasks.

## 11. Permissions

Work Requests and Scheduled Work are scoped by `company_id`. Context ids for projects, tasks, clients, reviewers, and assignees must resolve inside the same company. Scheduled Project creation remains management-scoped; scheduled Task creation also allows authorized project Leads.

## 12. API Changes

New `/api/v1/work-requests` routes: list, create, detail, start-review, approve, reject, cancel, convert.

Enhanced `/api/v1/scheduled-jobs` routes: list filters by schedule type/enabled, create/update recurrence fields, list occurrences, pause, resume.

## 13. Frontend Changes

The Work navigation now routes "Requests" to `/work-requests` and keeps Support Tickets as a separate route. Scheduled Jobs show recurring state and pause/resume actions.

## 14. Audit and Notifications

Work Request actions write changelog/timeline records and notify request participants where wired. Scheduled Job execution continues writing notifications/timeline events and now stores occurrence history.

## 15. Backward Compatibility

Existing one-time Scheduled Jobs remain valid because `schedule_type` defaults to `one_time`, `enabled` defaults true, and existing payload/status fields remain unchanged. Support Tickets are not migrated or replaced.

## 16. Automated Verification

- `python -m compileall backend/app/models/task.py backend/app/models/timeline.py backend/app/models/work_request.py backend/app/models/scheduled_job.py backend/app/services/task_workflow.py backend/app/services/task_service.py backend/app/services/task_health_service.py backend/app/services/work_request_service.py backend/app/services/scheduling_service.py backend/app/api/v1/endpoints/tasks.py backend/app/api/v1/endpoints/changelog.py backend/app/api/v1/endpoints/work_requests.py backend/app/api/v1/endpoints/scheduled_jobs.py backend/app/core/database.py`: pass.
- Targeted backend pytest suite: 144 passed.
- `npm.cmd run test -- --run src/api/tasks.test.js src/pages/tasksData.test.js src/pages/ProjectBoard.test.jsx`: 24 passed.
- `npm.cmd run build`: pass.

## 17. Manual Verification Checklist

1. Create each Work Request type and verify required contextual fields.
2. Start review, approve, reject with reason, cancel, and convert to Task.
3. Confirm Support Tickets remain reachable separately.
4. Create recurring daily, weekly, monthly, and custom Scheduled Jobs.
5. Pause and resume recurring jobs and verify no missed-run backfill.
6. Inspect occurrence history after success and failure.
7. Attempt cross-company project/task/client/reviewer ids and verify denial.

## 18. Known Remaining Issues

- Full frontend lint remains blocked by existing repo-wide lint debt recorded in Phase 1.
- Work Request UI is functional but minimal; richer detail timeline and Work Overview surfacing remain follow-up work.
- Conversion idempotency returns existing converted targets but does not yet use a database-level compare-and-set lock.
- No migration/backfill script was added for historical scheduled jobs because model defaults keep them readable.

## 19. Documentation Updated

Updated `README.md`, `docs/product/PRD.md`, `docs/user-flows/projects-tasks.md`, `backend/API_DOCUMENTATION.md`, `backend/DATABASE_SCHEMA.md`, `docs/architecture/ARCHITECTURE.md`, and this ADR/report.

## 20. Final Phase 4 Status

PHASE 4 INCOMPLETE

Core backend, API, frontend entry points, docs, and targeted tests are in place. Full completion is blocked by existing frontend lint debt and remaining polish/integration gaps listed above.
