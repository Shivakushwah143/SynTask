# ADR: Client Finance Renewal and Churn Metadata

Date: 2026-08-30

## Status

Accepted

## Context

Client Workspace Phase 7 needs Finance, Renewal, Churn, and Archive workflows. SynTask already has source systems for invoices, invoice payments, MSAs, Client Services, lifecycle status, and Client Activity.

Duplicating invoice or payment rows into Client records would create reconciliation risk and weaken tenant-owned finance boundaries. Renewal and churn, however, need workflow-specific state that is not represented by Invoice or MSA records.

## Decision

Finance remains an aggregation over existing tenant-scoped Invoice, Invoice payment, Client Service, Client, and MSA records.

Renewal, churn, and archive workflow state is stored as lightweight metadata under `Client.lifecycle_metadata`:

- `renewal` and append-only `renewal_history`
- `churn` and append-only `churn_history`
- `archive` and append-only `archive_history`

Churn is non-destructive. It may safely end active Client Services, but it never deletes Contacts, Projects, Tasks, Deliverables, Communication, Files, Finance, or Activity. Archive is allowed from Churned and records historical metadata without hard deletion.

## Consequences

Existing Finance and Work systems stay canonical. Client Activity can show renewal, churn, archive, overdue invoice, and payment events from existing records and Client metadata. Phase 8 Client Health remains out of scope.
