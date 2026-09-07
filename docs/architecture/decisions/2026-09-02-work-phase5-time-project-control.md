# ADR: Backend Timers and Project Completion Readiness

Date: 2026-09-02

Status: Accepted

## Context

SynTask already had finalized `TimeLog` entries, Timesheets, Task Workflow, Project Workflow, Work Overview, Work Requests, and Scheduled Work. Phase 5 needs live timers and safe project completion without creating a second source of truth or bypassing earlier workflow rules.

## Decision

Add `ActiveTimeSession` as the backend-authoritative live timer record. Keep `TimeLog` as the finalized time source of truth and add `source` plus audit/void metadata. Timer start/pause/resume/stop routes use server time; stopping creates a `TimeLog` and closes the active session.

Add `project_completion_service.py` for completion readiness and call it from `project_workflow.py`. This makes direct project status updates and semantic completion routes share one gate. Readiness checks required tasks, pending reviews, dependency blockers, open blocker Work Requests, active timers, lifecycle eligibility, and authorized owner/manager control.

## Consequences

Refresh and browser crashes do not lose timer state. Time reporting can distinguish timer/manual/system entries. Project completion can no longer be a plain status mutation. Archived projects stay historical/read-mostly and are blocked from new task/timer creation.

## Security

All timer, time-log, report, and completion operations are scoped by `company_id`. Employees can track time only on assigned accessible tasks. Managers and admins can report on scoped company data; ordinary employees see their own finalized logs. Cross-company project/task/client ids fail before mutation.

## Alternatives Considered

Using unfinished `TimeLog` rows as live timer state was rejected because pause/resume and duplicate stop handling would make final facts ambiguous. Replacing Project Workflow was rejected; the readiness service is invoked from the existing lifecycle path instead.
