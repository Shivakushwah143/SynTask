# Workflow architecture refactor

## Current workflow

Navigation grouped work by technical modules: Dashboard, CRM, Workspace, Finance,
and Administration. Lead work crossed CRM and legacy Sales routes before continuing
into Clients, Projects, Tasks, Invoices, Ledger, and Reports. Several entry links used
redirect-only URLs; one Lead link and one Client search link reached missing routes.

## Improved workflow

Single source: `frontend/src/config/businessWorkflow.js`.

Lead > Qualification > Follow-up > Meeting > Proposal > Negotiation > Won > Client
> Project > Tasks > Execution > Invoice > Payment > Reports

Sidebar presents this sequence first. Dashboard journey consumes same definition.
Workflow pages receive role/module-aware previous and next links from main layout.
`/workflow` and `/leads` provide workflow entry points while all existing URLs remain.

## Redirects removed

- `/crm/dashboard` now renders existing CRM dashboard instead of redirecting to pipeline.
- Active Sales dashboard Lead actions now target `/crm/leads` directly.
- Bulk Lead fallback now targets `/crm/pipeline` directly.

## Redirects kept

- Authentication, public-route, role, company-admin, and module guards.
- `/crm` index to `/crm/pipeline`.
- `/sales/prospects`, `/sales/queue`, and `/sales/pipeline` compatibility redirects.
- `/sales/prospects/:id` compatibility redirect, now preserving ID at `/crm/leads/:id`.

## Pages still interrupting flow

- Proposal, Negotiation, and Won share pipeline page because no standalone frontend pages exist.
- Won-to-Client conversion remains business-logic driven; navigation cannot infer new Client ID.
- Generic Client, Project, Task, and Invoice pages cannot infer a record-specific next URL.
- CRM Calendar, Reports, and Settings include planned/placeholder states outside core sequence.
- Some role/module combinations skip restricted workflow steps intentionally.

## Manual review

- Confirm live pipeline stage keys for `proposal`, `negotiation`, and `won`.
- Add entity-aware next links after API responses expose converted Client/Project/Invoice IDs.
- Confirm whether Execution should enter Time Tracking or a selected Project board by default.
- Review permission policy for Client, Invoice, Payment, and Reports workflow visibility.
- Retire legacy Sales redirects only after external bookmarks and clients complete migration.

## Files changed

- `frontend/src/App.jsx`
- `frontend/src/components/CommandPalette.jsx`
- `frontend/src/components/GlobalSearch.jsx`
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/components/workflow/WorkflowJourney.jsx`
- `frontend/src/components/workflow/WorkflowStepNavigation.jsx`
- `frontend/src/config/businessWorkflow.js`
- `frontend/src/layouts/MainLayout.jsx`
- `frontend/src/pages/BulkLeads.jsx`
- `frontend/src/pages/Reports.jsx`
- `frontend/src/pages/sales/SalesDashboard.jsx`
- `docs/WORKFLOW_ARCHITECTURE_REFACTOR.md`
