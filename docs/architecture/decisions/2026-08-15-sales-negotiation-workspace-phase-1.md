# ADR: Sales Negotiation Workspace Phase 1

Date: 2026-08-15

## Status

Superseded by `2026-08-15-sales-negotiation-workspace-phase-2.md`

## Context

The Sales lead workflow already includes a `Negotiation` pipeline stage and backend stage gate from Negotiation to Agreement based on `SalesProspect.negotiation_status = accepted`. The lead workspace UI previously skipped from Proposal directly to Agreement, leaving no dedicated place to edit negotiation terms before contract creation.

Phase 1 must add the workspace UI without changing backend workflow behavior or creating a separate activity surface.

## Decision

Add `Negotiation` as a stage-aware lead workspace tab between Proposal and Agreement. The tab uses the existing lead workspace architecture and existing lead update endpoint.

Canonical existing fields remain on `SalesProspect`:

- `negotiation_status`
- `negotiation_notes`
- `won_amount`
- `timeline`
- `next_follow_up_at`

Negotiation-only Phase 1 fields that do not yet have first-class model columns are stored in `SalesProspect.custom_fields`:

- `accepted_quotation_reference`
- `customer_counter_offer`
- `final_agreed_amount`
- `discount`
- `final_scope`
- `payment_terms`
- `delivery_timeline`
- `client_conditions`

`negotiation_status` remains manually editable by authorized users. Future automation may suggest or prefill values, but must not remove manual control.

## Consequences

The UI can render and save Phase 1 negotiation data without a migration or new workflow service. Tenant isolation and authorization continue through the existing Sales lead update endpoint, scoped by company and lead ownership rules.

Phase 2 should decide whether negotiation terms need a first-class workspace document/model, validation rules, activity events, or automation hooks. If promoted, data migration from the namespaced `custom_fields` keys should preserve existing tenant boundaries and include negative cross-tenant tests.
