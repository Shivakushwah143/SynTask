# CRM User Flows

## CRM Navigation

```mermaid
flowchart TD
  A[Authenticated user] --> B[Main app navigation]
  B --> C[/crm/pipeline]
  B --> D[/crm/leads/:leadId]
  B --> E[/crm/companies]
  B --> F[/crm/contacts]
  B --> G[/crm/activities]
  B --> H[/crm/calendar]
  B --> I[/crm/reports]
  B --> J[/crm/settings]
```

## CRM Dashboard
- How the user reaches it: opens `/crm` or `/crm/dashboard`; layout redirects to pipeline by default, dashboard link remains available in the shell.
- What they can do: review summary analytics, open major CRM surfaces, use global search in the CRM shell.
- What happens after every action:
  - Opening a navigation item changes route and loads the target workspace.
  - Refreshing the dashboard refetches the aggregation payload.
- Backend APIs called: `GET /api/v1/crm/dashboard`
- Timeline events created: none directly.
- Notifications sent: none directly.
- Related modules updated: dashboard data is derived from Sales/CRM data only.

## CRM Pipeline
- How the user reaches it: CRM sidebar, dashboard shortcut, or direct `/crm/pipeline`.
- What they can do: search, filter, drag leads, move leads with quick actions, open a lead workspace.
- What happens after every action:
  - Search and filters update URL state and board visibility.
  - Drag/drop or quick move sends a stage update request.
  - Successful move updates the board optimistically and refreshes pipeline history.
- Backend APIs called:
  - `GET /api/v1/crm/pipeline`
  - `PATCH /api/v1/crm/pipeline/{leadId}/stage`
  - `GET /api/v1/crm/pipeline/history/{leadId}`
- Timeline events created: `LeadStageChanged` on backend stage success.
- Notifications sent: none explicitly in the frontend; backend may emit existing notifications if configured.
- Related modules updated: Lead Workspace, Activities, Timeline, Sales domain stage history.

## Leads Dashboard
- How the user reaches it: CRM sidebar, dashboard shortcut, or direct `/crm/leads`.
- What they can do: view lead analytics and charts, search/filter leads, create leads, import/export leads, bulk edit leads, review and merge duplicates, and assign leads to employees.
- What happens after every action:
  - Search and filters update the visible lead list client-side.
  - Creating a lead opens a modal; on success the lead list and pipeline are refreshed.
  - **Import opens a bulk import modal that accepts any file type (CSV, XLSX, or text).** The file is parsed and columns are auto-detected. Known columns (phone, name, email, etc.) map to lead fields; unknown columns are stored as custom fields on the lead record. A field mapping recommendation panel shows detected columns and their mapping status. Missing fields are filled as null. On success the lead list and pipeline are refreshed.
  - Export generates a CSV download of all leads.
  - Bulk edit opens a modal to update stage/owner for selected leads.
  - **Assign (admin/manager only)**: selecting leads and clicking "Assign" opens a modal to choose an employee; on success the selected leads are reassigned and the list is refreshed.
  - Merge opens a merge modal for duplicate groups; on success duplicates are refreshed.
- Backend APIs called:
  - `GET /api/v1/crm/pipeline` (for board data)
  - `GET /api/v1/crm/leads` (full lead list)
  - `GET /api/v1/crm/leads/duplicates`
  - `POST /api/v1/crm/leads` (create lead)
  - `PATCH /api/v1/crm/leads/{leadId}` (update lead, including assignment)
  - `POST /api/v1/crm/leads/merge`
  - `GET /api/v1/crm/categories`
  - `GET /api/v1/crm/products`
  - `GET /api/v1/users/assignable`
- Permission rules:
  - **Assign button**: visible only to Admin, Manager, and Super Admin roles. Requires at least one lead selected.
  - **Create category**: restricted to Admin, Manager, Lead, and Super Admin with `sales_crm` module.
  - **Employee view**: Employees see only leads assigned to them. The "Lead Workspace" table, "All Leads" section (renamed to "My Leads"), and stat cards all reflect only their assigned leads. Duplicate Management is hidden.
  - **Manager/Admin view**: Managers and Admins see all leads across the account, including Duplicate Management.
- Timeline events created: lead creation and stage changes publish domain events via backend.
- Notifications sent: none explicitly in the frontend.
- Related modules updated: Pipeline, Lead Workspace, Duplicate Management.

## Lead Workspace
- How the user reaches it: click a lead card in pipeline, calendar, activities, company/leads links, or open `/crm/leads/:leadId`.
- What they can do: inspect lead summary, update deal-related data, manage notes/files, inspect timeline/history, open related CRM modules.
- What happens after every action:
  - Tab changes swap sections without leaving the workspace.
  - Notes/files mutations refresh the lead record sections.
  - Timeline/history changes are read-only refreshes.
- Backend APIs called:
  - `GET /api/v1/crm/leads/{leadId}/timeline`
  - `GET /api/v1/crm/pipeline/history/{leadId}`
  - `GET /api/v1/crm/leads/{leadId}/deal`
  - `GET/POST/PATCH/DELETE /api/v1/crm/leads/{leadId}/notes`
  - `GET/POST/DELETE /api/v1/crm/leads/{leadId}/files`
  - `GET/POST/PATCH /api/v1/crm/leads/{leadId}/proposals`
- Timeline events created: note/file/deal/proposal/timeline-related changes should publish activity events from backend workflows.
- Meta Lead Ads ingestion publishes canonical `LeadReceivedFromMeta` or `MetaAttributionUpdated` events with the webhook correlation ID. Unable to verify from the current codebase whether this timeline reader renders persisted domain events; no parallel timeline store is introduced.
- Notifications sent: none explicitly in the frontend; backend may emit existing notification events for write actions.
- Related modules updated: Pipeline, Activities Hub, Company Workspace, Contact Workspace, Timeline.

## Company Workspace
- How the user reaches it: CRM companies list, pipeline/company links, activities, lead/company cross-links, or `/crm/companies/:companyId`.
- What they can do: view company overview, manage contacts, inspect related leads, manage notes/files/meetings/timeline where supported.
- What happens after every action:
  - Navigating tabs changes company section.
  - CRUD actions refresh the affected list sections.
- Backend APIs called:
  - `GET/POST/PATCH/DELETE /api/v1/crm/companies`
  - `GET /api/v1/crm/companies/{companyId}`
  - `GET /api/v1/crm/contacts`
  - related lead/deal/proposal aggregation APIs where supported
- Timeline events created: company/contact/lead activity should flow into CRM timeline where backend emits it.
- Notifications sent: none explicitly in the frontend.
- Related modules updated: Contacts, Leads, Activities, Timeline.

## Contacts
- How the user reaches it: CRM contacts list, company workspace, or direct `/crm/contacts`.
- What they can do: browse contacts and open contact records.
- What happens after every action: route navigation opens the target detail; CRUD list actions reload table data.
- Backend APIs called: `GET/POST/PATCH/DELETE /api/v1/crm/contacts`, `GET /api/v1/crm/contacts/{contactId}`
- Timeline events created: contact-related updates should be reflected through backend events if configured.
- Notifications sent: none explicitly in the frontend.
- Related modules updated: Company Workspace, Lead Workspace, Activities.

## Activities Hub
- How the user reaches it: CRM sidebar or entity links like `/crm/activities?entity_type=lead&entity_id=...`.
- What they can do: create/edit/complete/snooze/delete activities; filter/search; navigate to related records.
- What happens after every action:
  - Filters update URL query state.
  - CRUD actions refresh the activity feed and task queue.
- Backend APIs called:
  - `GET/POST/PATCH/DELETE /api/v1/crm/activities`
  - task APIs for the task queue
- Timeline events created: activity CRUD should publish activity/timeline events in the backend activity engine.
- Notifications sent: none explicitly in the frontend.
- Related modules updated: Lead Workspace, Company Workspace, Calendar, Timeline.

## Calendar
- How the user reaches it: CRM sidebar or related links.
- What they can do: filter a unified calendar feed, change month/week/day/agenda views, open related entities.
- What happens after every action:
  - Filters recompute visible events client-side.
  - Clicks on items navigate to lead/company/contact targets.
- Backend APIs called:
  - existing meetings API
  - existing task APIs
  - existing activity timeline API
- Timeline events created: none directly.
- Notifications sent: none directly.
- Related modules updated: Meetings, Tasks, Activities, Lead/Company/Contact views.

## Reports
- How the user reaches it: CRM sidebar or direct `/crm/reports`.
- What they can do: inspect analytics, filter by date, export CSV.
- What happens after every action:
  - Date filters update the view locally.
  - Export generates a CSV snapshot from the analytics payload.
- Backend APIs called: `GET /api/v1/crm/dashboard`
- Timeline events created: none directly.
- Notifications sent: none directly.
- Related modules updated: Dashboard-derived analytics only.

## Settings
- How the user reaches it: CRM sidebar or direct `/crm/settings`.
- What they can do: manage pipeline masters, CRM taxonomy, team defaults, automation presets, preferences.
- What happens after every action:
  - Existing sales master actions persist through Sales endpoints.
  - Locally persisted settings update browser storage for unsupported groups.
- Backend APIs called:
  - `GET/POST /api/v1/sales/masters/stages`
  - `GET/POST /api/v1/sales/masters/tags`
  - `GET/POST /api/v1/sales/masters/channels`
  - `GET/POST /api/v1/sales/categories`
  - `GET/POST /api/v1/sales/products`
- Timeline events created: not consistently emitted yet.
- Notifications sent: none explicitly in the frontend.
- Related modules updated: Pipeline, Sales masters, downstream CRM filters and defaults.
