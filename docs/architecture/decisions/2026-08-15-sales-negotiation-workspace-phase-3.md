# ADR: Sales Negotiation End-to-End Handoff

Date: 2026-08-15

## Status

Accepted

## Context

The Sales lead workflow now includes a Negotiation stage between Proposal and Agreement. Phase 3 needed to finish the live handoff without redesigning the existing Proposal, Agreement, Documents, or pipeline systems.

## Decision

The Negotiation stage remains part of the existing lead workspace, pipeline transition service, lead activity timeline, and Agreement/Contract document workspace.

- Proposal -> Negotiation still uses the existing pipeline transition gate: `proposal_status = accepted`.
- Entering Negotiation initializes the existing Negotiation inner status and records a lead activity event.
- Negotiation saves use the scoped Negotiation API and may suggest obvious non-terminal statuses, but authorized users keep manual control over `negotiation_status`.
- Negotiation -> Agreement still requires `negotiation_status = accepted`.
- Agreement contract creation reuses the existing contract builder. It prefills from the accepted quotation plus Negotiation final terms, and negotiated terms override stale quotation values where the existing contract form has matching fields.
- Stage movement into Agreement records a normal lead activity event.

## Tenant And Authorization Rules

The tenant key remains `company_id`. Negotiation API access reuses lead ownership authorization (`assigned_to`, `assigned_by`, `created_by`) and existing role gates. Pipeline stage movement continues to enforce company isolation and write permissions. Contract handoff reads through the existing lead documents and negotiation APIs, so cross-tenant data cannot be prefetched by frontend state alone.

## Consequences

No separate Negotiation activity tab or contract subsystem is introduced. Contract terms remain editable in the Agreement workspace before document creation. Future automation can improve status suggestions, but it must not remove manual `negotiation_status` edits or bypass the Agreement gate.

## Verification

Targeted tests cover negotiation save/update, manual status changes, activity creation, Agreement gate enforcement, permissions, company isolation, Proposal -> Negotiation activity, and Agreement contract prefill from negotiated terms.
