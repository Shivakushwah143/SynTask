# ADR: Work Overview is a tenant-scoped read projection

## Status

Accepted — implemented 2026-09-14.

## Context

Supervisors need one overview spanning employee identity, attendance, current work, task health, tracked time, daily updates, and activity. These facts already have separate authoritative SynTask domains. A monitoring table or client-side fan-out would duplicate data, weaken tenant boundaries, and create N+1 queries.

## Decision

`work_monitoring_service.py` is a read-only aggregation boundary behind `/api/v1/work/overview/monitoring*`. It resolves the current-company scope first: Admin/Sub Admin are company-scoped, Manager/Lead use the existing `ancestors` descendant relation, and Employee is self-only. Detail and timeline routes repeat that check.

The service bulk-reads User, EmployeeProfile, Department, Attendance, BreakLog, Task, Project, ActiveTimeSession, TimeLog, EODReport, and TimelineEvent. It stores no monitoring snapshot. Source systems retain their writes and calculations; Live Monitor remains separately authorized and unembedded.

Because Tasks reference projects by the logical `project_id` code and Departments by `_id`, the projection resolves both key styles and only converts values that are valid ObjectIds before using them in `_id` lookups. A code-style reference is skipped rather than raising, so one legacy link cannot fail the whole monitoring response.

## Consequences

The Overview has normalized department-first evidence while retaining source ownership and tenant isolation. Missing evidence remains neutral and no productivity score is inferred. A future materialized view needs a new ADR backed by measured performance evidence.
