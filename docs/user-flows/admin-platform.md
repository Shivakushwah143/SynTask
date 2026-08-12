# Admin and Platform User Flows

## Flow Diagram

```mermaid
flowchart TD
  A[Super admin] --> B[/super-admin]
  B --> C[/super-admin/tenants]
  B --> D[/super-admin/plans]
  B --> E[/super-admin/usage]
  B --> F[/super-admin/billing]
  B --> G[/super-admin/users]
  A --> H[/settings]
  A --> I[/users]
  A --> J[/departments]
```

## Super Admin Dashboard
- How the user reaches it: `/super-admin`.
- What they can do: inspect platform KPIs and jump to governance areas.
- What happens after every action: chart or navigation updates route state.
- Backend APIs called: super-admin analytics APIs.
- Timeline events created: administrative actions should be logged if backend emits them.
- Notifications sent: admin alerts may be backend-driven.
- Related modules updated: Tenants, Plans, Usage, Billing, Users.

## Tenant Management and Detail
- How the user reaches it: super-admin dashboard.
- What they can do: review tenants, approve/suspend/activate, update modules and subscription.
- What happens after every action: tenant record and its lists refresh.
- Backend APIs called: tenant list/detail/approve/suspend/activate/modules/subscription endpoints.
- Timeline events created: admin audit/timeline events should be emitted by backend.
- Notifications sent: tenant lifecycle notifications may be backend-driven.
- Related modules updated: Subscriptions, module access, company-level setup.

## Plans, Usage, Billing
- How the user reaches it: super-admin dashboard.
- What they can do: manage plans, inspect usage, review billing/revenue, export data.
- What happens after every action: plan or billing actions refresh the selected table/chart.
- Backend APIs called: plan CRUD, usage analytics, revenue analytics, transaction/export endpoints.
- Timeline events created: financial/admin audit events should be logged if supported.
- Notifications sent: billing-related backend notifications may be produced.
- Related modules updated: Subscriptions, Tenant Management.

## Users and Departments
- How the user reaches it: main app or admin navigation.
- What they can do: manage users and departments.
- What happens after every action: CRUD mutations refresh the list/detail state.
- Backend APIs called: user and department CRUD/reporting endpoints.
- Timeline events created: user/admin audit events should be logged if supported.
- Notifications sent: account/admin notifications may be emitted by backend.
- Related modules updated: My Team, CRM ownership defaults, task assignment.

### Member Module Permissions

Status: Implemented
Last reviewed: 2026-08-12

- Tenant key: user records are scoped by `company_id`.
- Authorization rule: company admins, sub admins, managers and leads can open the relevant member-management surfaces according to existing role rules; non-admin creators cannot grant modules they do not hold.
- Permission model: the member form stores backend-supported module IDs such as `tasks_projects`, `sales_crm`, `attendance_leaves`, `recruitment`, `invoicing_ledger`, `reports`, and `ai_agents`.
- Sidebar alignment: the permission selector is organized by the current sidebar sections and nested options. Selecting a main sidebar section selects every supported module used by its internal options. Selecting an internal option toggles the module that controls that option.
- Core options: entries that are always available by role or do not have a backend module gate are labelled `Core`; they explain visibility but are not saved as separate module permissions.
- Legacy behavior: users with pre-permission-system module lists keep legacy role auto-grants until an admin saves an explicit list for them.
- Negative cross-tenant test expectation: updating one member's modules must not affect users in another company, and non-admin creators cannot escalate another member beyond the creator's own module authority.
