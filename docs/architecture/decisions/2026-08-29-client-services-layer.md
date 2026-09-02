# 2026-08-29 Client Services Layer

## Status
Accepted

## Context
Clients need a profile workspace with contacts and services, but SynTask already has canonical systems for CRM Companies, Contacts, Projects, Sales handoff, tasks, meetings, documents, and finance. Duplicating contacts or projects inside Clients would break tenant isolation and make conversion idempotency harder.

## Decision
Add `ClientService` as the Client -> Service -> Project relationship layer. A service belongs to one tenant-scoped Client and stores service name/type, status, value, billing cycle, dates, owner/team, linked Project ids, Sales lead/category source, and notes. Projects remain canonical execution records and are linked by id.

Client contacts continue to use existing `SalesContact` records linked through `CRMCompany`. Primary contact stays on `SalesContact.is_primary_contact`. Additional client-specific roles are lightweight metadata in `Client.lifecycle_metadata.contact_roles`.

Sales Won handoff seeds one `ClientService` from `Client.source_lead_id`/`SalesProspect` and links the generated or existing Project. Repeated conversion checks `(company_id, client_id, source_lead_id)` before creating a service.

## Consequences
- Tenant isolation is enforced by `Client.company_id`, `ClientService.company_id`, linked `Project.company_id`, `SalesContact.company_id`, and owner/team user `company_id`.
- The Client Workspace can summarize active services and client value without duplicating Project execution data.
- Contact roles can evolve without creating a parallel ClientContact identity collection.
- Deliverables, approvals, and advanced work execution remain out of scope for this phase.

## Verification
- Negative tenant behavior is covered by service/project/user validation paths.
- Regression tests cover workspace loading, CRM contact role metadata, and service serialization.
- Frontend build validates the Client Workspace tabs and forms compile.
