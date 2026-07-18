# ADR: In-Process Scheduled Job Engine

Date: 2026-07-18

## Status

Accepted

## Context

SynTask needs future project and task creation without duplicating project/task business logic. The repository already starts in-process background workers during FastAPI startup and has notification and timeline services that can record execution outcomes.

## Decision

Use the existing FastAPI startup background-worker pattern for the first production implementation of scheduled project/task creation. Store jobs in the tenant-scoped `scheduled_jobs` collection, execute due pending/failed jobs every minute, atomically move jobs to `RUNNING` before execution, and call the existing project/task creation core services. The API rejects past schedule times and enforces action-specific role gates before a job is queued.

## Consequences

- The implementation reuses existing authorization, validation, notification, and timeline paths.
- Multi-instance deployments can run more than one in-process scheduler; the atomic `PENDING/FAILED -> RUNNING` lock prevents duplicate execution for the same due job.
- A future queue-backed scheduler can replace the loop without changing the `scheduled_jobs` API or stored job states.
