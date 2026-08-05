# Sales User Flows

## Sales Overview

```mermaid
flowchart TD
  A[Authenticated user with sales access] --> B[/sales/dashboard]
  B --> C[/sales/contacts]
  B --> D[/sales/prospects]
  B --> E[/sales/pipeline]
  B --> F[/sales/reports]
  B --> G[/sales/settings]
```

## Sales Dashboard
- How the user reaches it: `/sales` or module navigation.
- What they can do: inspect sales overview and jump to sales workspaces.
- What happens after every action: route navigation or filter changes trigger the corresponding list/dashboard fetch.
- Backend APIs called: `GET /api/v1/sales/dashboard`
- Timeline events created: none directly.
- Notifications sent: none directly.
- Related modules updated: Prospect, Contact, Pipeline, Reports.

## Sales Contacts
- How the user reaches it: sales dashboard/sidebar or `/sales/contacts`.
- What they can do: list, create, edit, delete contacts; open contact detail.
- What happens after every action: CRUD mutations refresh the list/detail.
- Backend APIs called: `GET/POST/PUT/DELETE /api/v1/sales/contacts`
- Timeline events created: contact updates may be reflected in CRM timeline if the backend emits activity events.
- Notifications sent: none explicitly in the frontend.
- Related modules updated: CRM Contacts, Company Workspace.

## Sales Prospects
- How the user reaches it: sales dashboard/sidebar or `/sales/prospects`.
- What they can do: list prospects, create prospects, edit prospects, bulk upload, open detail.
- What happens after every action: list updates, stage updates, and detail screens refresh the prospect record. Manual create requires a phone number but allows duplicate phones so duplicate management can review and merge them later.
- Backend APIs called: `GET/POST/PUT /api/v1/sales/prospects`, bulk upload, search/contact helpers.
- Timeline events created: prospect lifecycle events should flow into CRM activity/timeline if backend emits them.
- Notifications sent: none explicitly in the frontend.
- Related modules updated: CRM Pipeline, Lead Workspace, Activities.

## Sales Pipeline
- How the user reaches it: sales sidebar or `/sales/pipeline`.
- What they can do: drag prospects between stages.
- What happens after every action: the board updates and the prospect stage is persisted.
- Backend APIs called: sales prospect read/update APIs and stage data.
- Timeline events created: stage updates should be surfaced in activity/timeline where configured.
- Notifications sent: none directly.
- Related modules updated: CRM Pipeline, Lead Timeline, Reports.

## Sales Reports
- How the user reaches it: `/sales/reports`.
- What they can do: inspect report views and review analytics.
- What happens after every action: report filters refetch data.
- Backend APIs called: sales report endpoints.
- Timeline events created: none directly.
- Notifications sent: none directly.
- Related modules updated: CRM Reports.

## Sales Settings
- How the user reaches it: `/sales/settings`.
- What they can do: manage stages, tags, channels, categories, products. Admin, Sub Admin, Manager, Lead, and Super Admin users with sales module access can create and update categories and products for their permitted tenant scope.
- What happens after every action: configuration lists refresh after CRUD mutations.
- Backend APIs called:
  - `GET/POST /api/v1/sales/masters/stages`
  - `GET/POST /api/v1/sales/masters/tags`
  - `GET/POST /api/v1/sales/masters/channels`
  - `GET/POST /api/v1/sales/categories`
  - `GET/POST /api/v1/sales/products`
- Timeline events created: generally not yet consistent.
- Notifications sent: none directly.
- Related modules updated: CRM Settings, Pipeline, Reports.
