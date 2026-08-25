# CRM Document-Driven Proposal and Agreement Status

## Status

Accepted

## Context

SynTask already has `SalesProspect` for lead stage/status state and `CRMDocument` for quotation/contract artifacts, PDFs, public links, and public responses. Allowing users to separately mark Proposal Accepted or Agreement Signed creates duplicate sources of truth and can bypass quotation/contract evidence.

## Decision

Quotation and contract document lifecycle events are authoritative for Proposal and Agreement completion.

- Quotation status synchronizes `SalesProspect.proposal_status` server-side.
- Contract status synchronizes `SalesProspect.agreement_status` server-side.
- The generic stage-status API rejects manual authoritative Proposal/Agreement outcomes unless the requested value is a no-op.
- Contracts are created only from accepted quotations and are idempotent for the same source quotation.
- Required unpriced quotation lines block send/share in the backend.
- Uploaded PDFs require explicit document type and preserve the original uploaded file.

## Consequences

Salespeople manage commercial evidence through Proposal/Quotation and Agreement/Contract workspaces instead of manually synchronizing statuses. Tenant isolation continues to use `company_id`, lead ownership checks, and document scoping by lead. Existing `CRMProposal` records are not deleted; the quotation document workflow becomes authoritative for Proposal status going forward.
