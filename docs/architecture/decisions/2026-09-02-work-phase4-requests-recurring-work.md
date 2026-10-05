# ADR: Work Requests and Recurring Scheduled Work

Date: 2026-09-02

Status: Accepted

## Context

SynTask already has Support Tickets, Tasks, Projects, and one-time Scheduled Jobs. Phase 4 needs operational Work Requests and recurring work creation without replacing those existing domains or weakening task/project workflow rules from Phases 1 and 2.

## Decision

Add a tenant-scoped `WorkRequest` model and `/api/v1/work-requests` API for operational requests, reviews, approvals, rejection, cancellation, and conversion into Tasks or Projects. Keep Support Tickets separate.

Extend `ScheduledJob` with `schedule_type`, recurrence settings, timezone, enabled state, next/last run metadata, and occurrence count. Add `ScheduledJobOccurrence` as immutable execution history per scheduled time. The scheduler continues to invoke existing `ProjectService` and `TaskService` creation paths so owner, project, assignee, reviewer, module, and tenant validation stay centralized.

## Consequences

Work Requests have their own lifecycle and audit trail but converted work still lands in canonical Tasks or Projects. Recurring schedules can be paused, resumed, inspected, and retried without deleting historical occurrence evidence. One-time scheduled jobs remain backward compatible.

## Security

Every Work Request and Scheduled Work route is scoped by `company_id`. Project, task, client, reviewer, assignee, and conversion targets must resolve inside the same company. Cross-tenant ids fail before conversion or scheduling. Negative tests must cover foreign context ids and foreign detail lookups.

## Alternatives Considered

Reusing Support Tickets was rejected because tickets are support/issue records, while Work Requests include internal approval and conversion workflows. Creating a separate recurring-task engine was rejected because the existing scheduled-job runner already has locking, notifications, and task/project creation integration.
