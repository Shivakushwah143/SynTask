# ADR: Work Phase 1 Project Foundation

## Status

Accepted

## Context

The Work module already had project identity, client references, owner-like leadership through `lead_id`, project permissions, and a controlled lifecycle service. Phase 1 required stronger source-of-truth rules without rebuilding working functionality.

## Decision

Use `Project.client_id` as the canonical Client -> Project relationship and continue maintaining `Client.project_ids` only as a compatibility reference. Use `Project.lead_id` as the canonical Project Owner. Keep `project_workflow.py` as the only backend lifecycle transition authority and add `cancelled` as a terminal state. Store business priority on `Project.priority` and expose deadline pressure separately as `deadline_urgency`. Persist company project type options in `ProjectTypeConfiguration`.

## Consequences

Existing projects remain readable even when owner, priority, or client is missing. New operational projects require owner validation and client-facing projects require a valid same-company client. The project list and workspace can display owner, client, priority, lifecycle, health, deadline urgency, and progress from backend-owned calculations.
