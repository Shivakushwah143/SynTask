# ADR: Client Health Next Action and Escalation Metadata

Date: 2026-08-30

## Status

Accepted

## Context

Client Workspace Phase 8 needs health scoring, explainable reasons, next action, and escalation while preserving existing lifecycle, Work, Deliverables, Communication, Meetings, Finance, Renewal, and Activity systems.

Health must be calculated from real tenant-scoped records and must not become a second lifecycle stage or a duplicate task/finance/project system.

## Decision

Client Health is a derived layer stored as lightweight metadata on `Client.lifecycle_metadata`.

The calculation uses existing same-tenant workspace sources: Tasks, Projects, Client Deliverables and approval fields, Meetings, CRM/Inbox communication, Finance aggregation, Invoices/payments, and Renewal metadata. It stores score, level, reasons, source tabs, signal counts, snapshot history, and level-change history.

Generated next actions are stored in `client_next_action`. Serious health creates a single open `client_health_escalation` for the unresolved issue key, assigned to the account owner or assigned Client owner when available. Completing the next action closes the matching escalation. Lifecycle status is never changed automatically by health.

## Consequences

Client Overview can show health, reasons, next action, escalation, and source links without adding duplicate business records. Activity can include health snapshots and level changes. Phase 9 overview/insights/automation redesign remains out of scope.
