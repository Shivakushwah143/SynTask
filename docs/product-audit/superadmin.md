# Super Admin Product Audit

## Scope
Tenant, subscription, usage, billing, user administration, and platform governance.

## Screens

### Admin Dashboard
- Purpose: super-admin overview.
- Route: `/super-admin`
- Backend APIs used: superadmin analytics endpoints.
- Actions available: navigate to tenants, usage, billing, plans, users, settings.
- Data displayed: platform summary and usage stats.
- Navigation flow: super-admin shell -> management screens.
- Related screens: Tenants, Plans, Usage Analytics, Billing Revenue, Users.
- Empty state: dashboard fallback states.
- Loading state: chart/table loading.
- Error state: query failures.
- Permissions: super_admin only.
- Current implementation status: Functional.
- Missing functionality: deeper governance workflows.
- UX issues: more admin-console style than product shell.
- Technical debt: analytics and management views are broad.
- Production readiness: 8/10

### Tenant Management
- Purpose: manage tenant lifecycle.
- Route: `/super-admin/tenants`
- Backend APIs used: tenant list/detail/approve/suspend/activate/modules/subscription.
- Actions available: approve, suspend, activate, edit modules/subscription.
- Data displayed: tenant records, status, module config.
- Navigation flow: dashboard -> tenant list -> tenant detail.
- Related screens: Usage Analytics, Billing Revenue.
- Empty state: no-tenants state.
- Loading state: table loading.
- Error state: fetch/action failures.
- Permissions: super_admin only.
- Current implementation status: Functional.
- Missing functionality: richer audit history for tenant operations.
- UX issues: dense admin tables.
- Technical debt: platform control surface is separate from product UX.
- Production readiness: 8/10

### Tenant Detail
- Purpose: tenant-level inspection.
- Route: `/super-admin/tenants/:id`
- Backend APIs used: tenant detail and related admin APIs.
- Actions available: inspect modules, subscription, status actions.
- Data displayed: tenant metadata and governance info.
- Navigation flow: tenant list -> tenant detail.
- Related screens: Tenant Management.
- Empty state: detail sections without data.
- Loading state: detail loading.
- Error state: fetch/action errors.
- Permissions: super_admin only.
- Current implementation status: Functional.
- Missing functionality: more operational context/history.
- UX issues: admin-heavy layout.
- Technical debt: may overlap with tenant governance in other admin tools.
- Production readiness: 7/10

### Subscription Plans
- Purpose: plan management.
- Route: `/super-admin/plans`
- Backend APIs used: plan CRUD.
- Actions available: create, update, delete plans.
- Data displayed: plans and counts.
- Navigation flow: dashboard -> plans.
- Related screens: Billing Revenue, Tenant Management.
- Empty state: no-plans state.
- Loading state: table loading.
- Error state: query/action errors.
- Permissions: super_admin only.
- Current implementation status: Functional.
- Missing functionality: plan preview and change impact visualization.
- UX issues: form-based admin UI.
- Technical debt: plan management is business-critical and should stay well tested.
- Production readiness: 8/10

### Usage Analytics
- Purpose: platform usage monitoring.
- Route: `/super-admin/usage`
- Backend APIs used: usage analytics endpoints.
- Actions available: filter/review usage metrics.
- Data displayed: usage by company and time period.
- Navigation flow: dashboard -> usage.
- Related screens: Tenant Detail, Billing Revenue.
- Empty state: no-usage state.
- Loading state: charts/table loading.
- Error state: query failures.
- Permissions: super_admin only.
- Current implementation status: Functional.
- Missing functionality: deeper export and drilldown.
- UX issues: analytics density.
- Technical debt: reporting derived from platform data rather than CRM/business data.
- Production readiness: 7/10

### Billing Revenue
- Purpose: platform revenue monitoring.
- Route: `/super-admin/billing`
- Backend APIs used: billing revenue analytics, transactions, export.
- Actions available: review transactions, export.
- Data displayed: billing totals, revenue analytics, transactions.
- Navigation flow: dashboard -> billing.
- Related screens: Plans, Usage Analytics.
- Empty state: no-transaction state.
- Loading state: table/chart loading.
- Error state: query/action errors.
- Permissions: super_admin only.
- Current implementation status: Functional.
- Missing functionality: finance-level reconciliation workflows.
- UX issues: admin financial screens are utilitarian.
- Technical debt: revenue data model may overlap with CRM reporting metrics.
- Production readiness: 7/10

### Users
- Purpose: user administration.
- Route: `/users`
- Backend APIs used: user CRUD/search/creatable roles/reporting options.
- Actions available: create/edit/manage users.
- Data displayed: users, roles, hierarchy.
- Navigation flow: super-admin/main app -> users.
- Related screens: My Team, Departments.
- Empty state: no-users state.
- Loading state: list loading.
- Error state: query/action errors.
- Permissions: admin/super_admin scope.
- Current implementation status: Functional.
- Missing functionality: unified access governance across all modules.
- UX issues: admin tables can be dense.
- Technical debt: role model spans both platform and product access.
- Production readiness: 8/10

### Settings
- Purpose: generic app settings.
- Route: `/settings`
- Backend APIs used: mixed platform/settings APIs depending on panel.
- Actions available: update preferences.
- Data displayed: user/app settings.
- Navigation flow: main app -> settings.
- Related screens: profile/admin pages.
- Empty state: section-level empties.
- Loading state: loading states vary by panel.
- Error state: query/action errors.
- Permissions: authenticated user or admin depending on panel.
- Current implementation status: Functional.
- Missing functionality: CRM-specific preferences are separated into CRM Settings.
- UX issues: multiple settings contexts across app.
- Technical debt: settings surface is fragmented across modules.
- Production readiness: 7/10

## Audit Findings
- Broken navigation: none critical.
- Dead routes: none identified.
- Placeholder pages: none critical.
- Duplicate features: admin analytics overlaps with billing and CRM reporting.
- Unused components: none critical.
- Inconsistent UI: admin shell differs from product shell.
- Missing CRUD operations: some admin subresources may be partial.
- Missing validation: admin forms should be audited.
- Missing authorization: strong super_admin gating is present in route structure.
- Missing tenant isolation: tenant-specific data must remain scoped.
- Missing audit trail: administrative actions should ideally be logged.
- Missing timeline integration: not relevant to all screens, but audit log coverage could be stronger.
