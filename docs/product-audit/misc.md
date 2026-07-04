# Misc Product Audit

## Scope
Landing, reports, dashboard, MSA, chat, ledger, subscriptions, departments, timesheet, and supporting screens not covered elsewhere.

## Screens

### Main Dashboard
- Purpose: authenticated app overview.
- Route: `/dashboard`
- Backend APIs used: dashboard stats and supporting lists.
- Actions available: navigate to major modules.
- Data displayed: global KPIs, tasks, tickets, projects, activity.
- Navigation flow: main app -> functional areas.
- Related screens: Tasks, Tickets, Projects, CRM Dashboard.
- Empty state: dashboard sections have local empty cards.
- Loading state: cards/widgets loading.
- Error state: fetch/widget failures.
- Permissions: authenticated access.
- Current implementation status: Functional.
- Missing functionality: deeper personalization and consolidated cross-module drilldown.
- UX issues: broad scope, can feel crowded.
- Technical debt: dashboard aggregates multiple domains.
- Production readiness: 8/10

### Reports
- Purpose: global reporting.
- Route: `/reports`
- Backend APIs used: reports analytics charts.
- Actions available: switch period, inspect charts.
- Data displayed: analytics charts and report summaries.
- Navigation flow: main app -> reports.
- Related screens: CRM Reports, Sales Reports.
- Empty state: empty chart states.
- Loading state: chart skeletons.
- Error state: query failures.
- Permissions: authenticated access.
- Current implementation status: Functional.
- Missing functionality: report exports and deeper breakdowns in some areas.
- UX issues: analytics space can be heavy.
- Technical debt: duplicated reporting concepts across modules.
- Production readiness: 7/10

### MSA
- Purpose: agreement drafting/management.
- Route: `/msa`
- Backend APIs used: MSA CRUD, template, signature, download, send.
- Actions available: create, edit, save as template, send, sign-related flows.
- Data displayed: agreements, templates, signatures.
- Navigation flow: main app -> MSA -> detail/sign routes.
- Related screens: Clients, Projects.
- Empty state: no-template/no-agreement states.
- Loading state: form/list loading.
- Error state: API errors.
- Permissions: authenticated/task access.
- Current implementation status: Functional.
- Missing functionality: some CRM handoff connections.
- UX issues: complex workflow surface.
- Technical debt: agreement model overlaps with proposal-like workflows.
- Production readiness: 7/10

### MSA Sign
- Purpose: public signing flow.
- Route: `/msa/sign/:token`
- Backend APIs used: sign verification/submit endpoints.
- Actions available: review and sign.
- Data displayed: agreement content and signature state.
- Navigation flow: external/public sign link.
- Related screens: MSA.
- Empty state: invalid token / no agreement.
- Loading state: sign verification.
- Error state: token/submit errors.
- Permissions: token-based access.
- Current implementation status: Functional.
- Missing functionality: stronger governance/audit details.
- UX issues: specialized signing workflow.
- Technical debt: separate public signing contract.
- Production readiness: 8/10

### Ledger
- Purpose: finance ledger.
- Route: `/ledger`
- Backend APIs used: ledger APIs.
- Actions available: view entries and totals.
- Data displayed: ledger lines, financial summaries.
- Navigation flow: main app -> ledger.
- Related screens: Invoices, Billing Revenue.
- Empty state: no-ledger state.
- Loading state: table loading.
- Error state: query failures.
- Permissions: module access.
- Current implementation status: Functional.
- Missing functionality: richer finance controls.
- UX issues: finance-specific UI diverges from workspace shell.
- Technical debt: overlaps with billing analytics.
- Production readiness: 7/10

### Subscriptions
- Purpose: subscription plans and billing.
- Route: `/subscriptions`
- Backend APIs used: plans, payment-intent, confirm-payment, current subscription.
- Actions available: review plans, subscribe, manage payments.
- Data displayed: current plan, available plans, feature list.
- Navigation flow: main app -> subscriptions.
- Related screens: Super Admin Plans, Billing Revenue.
- Empty state: plan selections when none available.
- Loading state: plan loading.
- Error state: payment/subscription errors.
- Permissions: authenticated access.
- Current implementation status: Functional.
- Missing functionality: more robust billing lifecycle controls.
- UX issues: payment-oriented flow separate from CRM.
- Technical debt: billing logic spread across platform and product modules.
- Production readiness: 7/10

### Departments
- Purpose: department management.
- Route: `/departments`
- Backend APIs used: departments CRUD.
- Actions available: create/update/deactivate departments.
- Data displayed: departments list.
- Navigation flow: main app -> departments.
- Related screens: Users, My Team.
- Empty state: no-department state.
- Loading state: list skeletons.
- Error state: query/action errors.
- Permissions: admin-level access.
- Current implementation status: Functional.
- Missing functionality: richer org hierarchy management.
- UX issues: standard admin tables.
- Technical debt: org structure tooling is detached from CRM.
- Production readiness: 8/10

### My Team
- Purpose: team overview.
- Route: `/my-team`
- Backend APIs used: users/team APIs.
- Actions available: browse team data.
- Data displayed: team members and status.
- Navigation flow: main app -> my team.
- Related screens: Users, Departments.
- Empty state: no-team-member state.
- Loading state: list loading.
- Error state: query failures.
- Permissions: authenticated access.
- Current implementation status: Functional.
- Missing functionality: CRM owner assignment could reuse this more directly.
- UX issues: generic team surface.
- Technical debt: team and role data shared with admin/user systems.
- Production readiness: 7/10

### Not Found
- Purpose: 404 fallback.
- Route: `*`
- Backend APIs used: none.
- Actions available: navigate home.
- Data displayed: error state messaging.
- Navigation flow: any unknown route -> fallback.
- Related screens: all routes.
- Empty state: not applicable.
- Loading state: none.
- Error state: the route itself is the error state.
- Permissions: none.
- Current implementation status: Functional.
- Missing functionality: none.
- UX issues: minimal.
- Technical debt: none significant.
- Production readiness: 10/10

## Audit Findings
- Broken navigation: review any external links into deprecated placeholder routes.
- Dead routes: some feature shells exist but are intentionally placeholder-backed depending on sprint state.
- Placeholder pages: CRM calendar/reports/settings historically had placeholders; CRM reports/settings now updated, calendar remains simplified.
- Duplicate features: dashboard/reporting/analytics overlap across product areas.
- Unused components: possible legacy UI variants remain in repo.
- Inconsistent UI: product-wide, especially across older screens.
- Missing CRUD operations: varies by module; many core modules are functional but not unified.
- Missing validation: mostly backend-driven across legacy forms.
- Missing authorization: module guards exist unevenly.
- Missing tenant isolation: should be verified route by route on backend.
- Missing audit trail: not every workflow emits timeline/activity records.
- Missing timeline integration: CRM timeline is partial; non-CRM modules are not consistently integrated.
