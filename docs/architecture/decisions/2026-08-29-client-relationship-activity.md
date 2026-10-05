# ADR: Client Relationship Activity Aggregation

Date: 2026-08-29

## Status

Accepted

## Context

Client Workspace Phase 6 needs one relationship history across communication, meetings, files, work, deliverables, finance, and lifecycle activity. SynTask already has canonical systems for CRM activities, Meta Inbox messages, Meetings, Client documents, Projects, Tasks, Client Services, Client Deliverables, Invoices, CRM Companies, and CRM Contacts.

Creating separate Client communication or file collections would duplicate ownership, permissions, lifecycle, and storage rules. It would also increase the risk of cross-tenant leakage or stale copied records.

## Decision

Client relationship history is an aggregation layer over existing tenant-scoped records.

- Communication is read from same-tenant `crm_activities` and supported Meta Inbox messages associated through Client, CRM Company, CRM Contact, or Project relationships.
- Internal notes remain separate from client-facing communication.
- Meetings gain optional explicit `client_id`, `project_id`, and `contact_id` fields so Client Workspace does not infer meetings from account-owner participation.
- Files are referenced from existing Client document metadata and Deliverable linked files instead of copied into a second store.
- Activity is built chronologically from existing Client lifecycle/onboarding, Services, Projects, Tasks, Deliverables, Meetings, Communication, file references, and Invoice events.

## Consequences

Tenant isolation remains source-owned: every query includes the Client company key or validates same-tenant linked records. Existing Inbox, Meeting, Project, Task, Deliverable, Finance, and CRM timeline flows remain canonical. The Client Activity API can add more event sources later, but Phase 7 renewal/churn and finance redesign are out of scope.
