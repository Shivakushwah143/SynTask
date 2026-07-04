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
