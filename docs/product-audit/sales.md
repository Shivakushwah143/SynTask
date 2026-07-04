# Sales Product Audit

## Scope
Legacy Sales module that remains the backend domain source for CRM.

## Screens

### Sales Dashboard
- Purpose: sales overview and prospect triage.
- Route: `/sales`
- Backend APIs used: `GET /api/v1/sales/dashboard`
- Actions available: open prospects, contacts.
- Data displayed: summary metrics, stage breakdown, recent activity.
- Navigation flow: sales layout -> prospects/contacts/pipeline/reports/settings.
- Related screens: Sales Prospects, Sales Contacts, Sales Pipeline, Sales Reports, Sales Settings.
- Empty state: dashboard sections fall back when datasets are empty.
- Loading state: page skeletons via shared UI.
- Error state: query failures handled by page-level states.
- Permissions: Sales module access.
- Current implementation status: Functional.
- Missing functionality: no CRM-native workspace linking beyond basic navigation.
- UX issues: older visual language than CRM shell.
- Technical debt: duplicated analytics concepts now also power CRM.
- Production readiness: 8/10

### Sales Contacts
- Purpose: legacy sales contact directory.
- Route: `/sales/contacts`, `/sales/contacts/:id`
- Backend APIs used: sales contact CRUD APIs.
- Actions available: list, create, edit, delete, share.
- Data displayed: contact identity and related sales fields.
- Navigation flow: sales dashboard/prospects -> contact detail.
- Related screens: CRM Contacts, Company Workspace.
- Empty state: list/table empty states.
- Loading state: table skeletons.
- Error state: fetch and validation failures.
- Permissions: Sales module access.
- Current implementation status: Functional.
- Missing functionality: CRM-specific contact/company relationship UX.
- UX issues: less integrated than CRM surfaces.
- Technical debt: overlapping contact model with CRM contact directory.
- Production readiness: 8/10

### Sales Prospects
- Purpose: legacy lead/prospect management.
- Route: `/sales/prospects`, `/sales/prospects/:id`
- Backend APIs used: `/api/v1/sales/prospects` CRUD and bulk upload.
- Actions available: create, edit, bulk upload, stage updates.
- Data displayed: prospect, category, stage, owner, products, deal metadata.
- Navigation flow: dashboard -> prospects -> detail.
- Related screens: CRM Pipeline, Lead Workspace.
- Empty state: list empty state.
- Loading state: table/board skeletons.
- Error state: validation and fetch failures.
- Permissions: Sales module access.
- Current implementation status: Functional.
- Missing functionality: CRM workspace deep link parity.
- UX issues: dense forms and older patterns.
- Technical debt: reused by CRM pipeline data normalization.
- Production readiness: 8/10

### Sales Pipeline
- Purpose: legacy pipeline board.
- Route: `/sales/pipeline`
- Backend APIs used: sales prospects and stage update APIs.
- Actions available: drag/drop, stage updates.
- Data displayed: prospects by stage.
- Navigation flow: sales dashboard -> pipeline -> prospect detail.
- Related screens: CRM Pipeline.
- Empty state: board empty state.
- Loading state: kanban skeleton.
- Error state: mutation/query failures.
- Permissions: Sales module access.
- Current implementation status: Functional.
- Missing functionality: richer analytics and CRM lead workspace integration.
- UX issues: older board compared with CRM pipeline.
- Technical debt: partial overlap with CRM pipeline logic.
- Production readiness: 8/10

### Sales Reports
- Purpose: legacy sales analytics.
- Route: `/sales/reports`
- Backend APIs used: sales report endpoints.
- Actions available: filters/export where supported.
- Data displayed: prospect, sales, activity, lost, inventory reports.
- Navigation flow: sales layout -> reports.
- Related screens: CRM Reports.
- Empty state: report-specific no-data states.
- Loading state: query-driven skeletons.
- Error state: fetch failures.
- Permissions: Sales module access.
- Current implementation status: Functional.
- Missing functionality: CRM-level analytics consolidation.
- UX issues: analytics UI differs from CRM reports.
- Technical debt: overlapping metrics with CRM dashboard/reporting.
- Production readiness: 7/10

### Sales Settings
- Purpose: manage Sales masters.
- Route: `/sales/settings`
- Backend APIs used: `/api/v1/sales/masters/*`, `/api/v1/sales/categories`, `/api/v1/sales/products`
- Actions available: add stages/tags/channels/categories/products.
- Data displayed: master configuration lists.
- Navigation flow: sales layout -> settings.
- Related screens: CRM Settings.
- Empty state: empty-table states.
- Loading state: list skeletons.
- Error state: query failures.
- Permissions: Sales module access.
- Current implementation status: Functional.
- Missing functionality: CRM-specific settings persistence and ownership defaults.
- UX issues: management screen is utilitarian.
- Technical debt: Sales settings are reused by CRM settings.
- Production readiness: 8/10

## Audit Findings
- Broken navigation: none critical.
- Dead routes: none identified.
- Placeholder pages: none critical.
- Duplicate features: Sales and CRM overlap in masters, reports, and pipeline concepts.
- Unused components: no critical evidence.
- Inconsistent UI: yes, compared with CRM shell.
- Missing CRUD operations: some masters have only partial CRUD.
- Missing validation: form validation mostly backend-driven.
- Missing authorization: Sales module access is enforced in backend routes.
- Missing tenant isolation: route-layer access patterns appear tenant-aware, but should be audited per endpoint.
- Missing audit trail: some master changes may not emit timeline events.
- Missing timeline integration: configuration changes are not broadly timeline-backed.
