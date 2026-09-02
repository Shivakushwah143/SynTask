# ADR: Client Overview Insights Saved Views and Automation

Date: 2026-08-30

## Status

Accepted

## Context

Phase 9 needs a management layer across Clients that answers portfolio health, attention, daily actions, insights, saved views, and automatable work. Existing systems already own Clients, Work Tasks, Notifications, AutomationExecution, Finance, Deliverables, Renewal, and Health.

## Decision

Client Overview and Insights are implemented as backend aggregation in `app.crm.client_portfolio`, using tenant-scoped queries and capped result sets. The frontend consumes this summary instead of calculating management KPIs from a large client list.

Saved views use a new `ClientSavedView` document that stores only user-owned filter JSON. Built-in views are returned by the API and do not copy Client records.

Built-in Client automation reuses existing `Task`, `Notification`, and `AutomationExecution` records. Automation actions use deterministic client issue keys so overdue payment, renewal reminder, health escalation, approval delay, and inactivity follow-up do not create duplicate unresolved actions.

## Consequences

Client portfolio reporting remains separate from Sales reporting. Client records, projects, invoices, deliverables, and tasks stay canonical. Phase 10 AI/cleanup remains out of scope.
