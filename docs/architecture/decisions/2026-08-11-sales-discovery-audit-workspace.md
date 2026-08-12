# Sales Discovery and Audit Workspace

Date: 2026-08-11

## Status

Accepted

## Context

The Sales lifecycle needs structured pre-conversion Discovery and Audit work that feeds the existing quotation and contract flow. SynTask already has `SalesProspect` as the lead source of truth and `CRMDocument` as the quotation/contract document model with public links, PDF generation, acceptance, and contract creation.

Adding dozens of Discovery/Audit fields directly to `SalesProspect` would make the lead model harder to maintain and risk duplicating fields such as budget, decision maker, company identity, phone, email, and timeline. Creating a separate quotation or contract implementation would split the commercial workflow and could bypass existing sent/accepted document snapshots.

## Decision

Create dedicated tenant-scoped `SalesDiscovery` and `SalesAudit` documents with a unique `(company_id, lead_id)` index. The documents store structured workspace data and completion state while pointing to the existing `SalesProspect`.

`SalesProspect` remains authoritative for lead identity and shared qualification fields. Discovery updates sync supplied numeric budget, primary decision-maker name, and primary timeline back to the existing lead fields.

Quotation draft generation uses the existing `CRMDocument` quotation service. Generated quotation documents start as `draft`, include line items mapped from existing `SalesProduct` records when possible, and store `content_snapshot.source_snapshot.generated_from` with Discovery/Audit ids, versions, timestamps, and captured data.

Contracts continue to be created from the accepted quotation document snapshot. Discovery/Audit never mutates sent, accepted, or historical quotation documents and never creates Clients or Projects.

## Consequences

- Discovery/Audit can grow independently without bloating the lead model.
- One Discovery and one Audit record per tenant+lead prevents repeated-click duplication.
- Existing CRM document public link, PDF, acceptance, and contract behavior remains authoritative.
- Future crawler/AI audit services can populate `SalesAudit.audit_source`, `findings`, and structured sections without changing the manual workflow.
- Tests must cover tenant scoping, partial updates, completion blockers, recommendation mapping, quotation source snapshots, and preservation of existing quotation/contract gates.
