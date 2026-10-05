# ADR: Sales Negotiation Workspace Phase 2

Date: 2026-08-15

## Status

Accepted

## Context

Phase 1 added a frontend Negotiation tab and temporarily stored several terms in lead `custom_fields`. Phase 2 needs backend/domain ownership while preserving the existing Sales lead model, pipeline stage gates, permissions, and activity timeline.

## Decision

Add a scoped Negotiation workspace API:

- `GET /api/v1/crm/leads/{lead_id}/negotiation`
- `PATCH /api/v1/crm/leads/{lead_id}/negotiation`

Reuse existing `SalesProspect` fields where they already express the domain concept:

- `negotiation_status`
- `negotiation_notes`
- `won_amount` for final agreed amount
- `timeline` for delivery timeline
- `next_follow_up_at` for next follow-up

Add first-class `SalesProspect` fields only for negotiation terms without existing equivalents:

- `customer_counter_offer`
- `discount`
- `final_scope`
- `payment_terms`
- `client_conditions`
- `accepted_quotation_reference`

Manual `negotiation_status` edits remain valid for authorized users. Automation may fill an empty status suggestion, but it cannot remove or block manual control. Agreement entry continues to require `negotiation_status = accepted`.

## Security

The Negotiation API resolves the lead server-side and enforces existing company and ownership access with `company_id`, `assigned_to`, `assigned_by`, and `created_by`. Client-supplied company or stage values are ignored. Updates write normal CRM lead activity records for timeline visibility.

## Consequences

Negotiation data is now queryable without parsing `custom_fields`, and stage gating remains centralized in the existing pipeline service. Future migrations can clean up older Phase 1 custom-field data if production data exists.
