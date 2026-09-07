# ADR: Phase 2 Task Execution, Review, and Approval

Date: 2026-09-02

## Status

Accepted

## Context

Task state changes were previously accepted as direct status assignments. Phase 2 needs predictable execution, review, revision, approval, completion, and cancellation behavior without replacing existing task APIs or project-scoped authorization.

## Decision

Use `backend/app/services/task_workflow.py` as the workflow authority for task execution. All explicit action endpoints and the legacy status endpoint route through the same state machine.

Implemented statuses are `todo`, `assigned`, `in_progress`, `in_review`, `revision_required`, `approved`, `completed`, and `cancelled`. Assigned task creation starts in `assigned`; unassigned creation starts in `todo`. Review-required project tasks must be approved before completion. Sales follow-up tasks keep review bypass behavior.

Task workflow writes preserve tenant isolation through `company_id` and task/project permission checks. Reviewers must be active same-tenant users with review authority and cannot be the assignee for review-required work. Dependencies must be same-tenant tasks, and dependency writes reject self-dependencies and cycles.

## Consequences

Direct invalid status jumps now return 400/403 instead of silently changing task state. Legacy callers can still use `PATCH /api/v1/tasks/{task_id}/status`, but only for valid transitions. Task responses include review metadata, allowed actions, normalized checklist entries, dependency blockers, and blocking state.

Timeline, changelog, notifications, health sync, and domain events are emitted from the workflow service so action behavior stays consistent across endpoints.

## Verification

Targeted tests cover state-machine transitions, reviewer validation, checklist gates, dependency blockers, cross-tenant dependency rejection, allowed actions, project-scoped permissions, task visibility, task health, and frontend status helpers.
