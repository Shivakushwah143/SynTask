# Clients Product Audit

## Scope
Client management and onboarding-related workspace outside CRM.

## Screens

### Clients
- Purpose: client directory and management.
- Route: `/clients`
- Backend APIs used: clients APIs and related document/project endpoints.
- Actions available: create/edit clients, manage tags and details.
- Data displayed: client profile, industry, tags, related work.
- Navigation flow: main app -> clients -> client detail/workflow.
- Related screens: Projects, CRM Companies, Invoices.
- Empty state: no-client state.
- Loading state: query and form loading.
- Error state: fetch and validation errors.
- Permissions: task/project/customer-related access.
- Current implementation status: Functional.
- Missing functionality: first-class CRM relationship with Company/Lead.
- UX issues: more operations-oriented than CRM.
- Technical debt: client is conceptually overlapping with company/customer entities.
- Production readiness: 7/10

## Audit Findings
- Broken navigation: none critical.
- Dead routes: none identified.
- Placeholder pages: none critical.
- Duplicate features: client/company relationships overlap.
- Unused components: none critical.
- Inconsistent UI: moderate relative to CRM.
- Missing CRUD operations: depends on linked document/project workflows.
- Missing validation: light client-side validation.
- Missing authorization: should be audited per client document/workflow.
- Missing tenant isolation: endpoint-level checks needed.
- Missing audit trail: client-side activity trail coverage is unclear.
- Missing timeline integration: not consistently surfaced in CRM.
