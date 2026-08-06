# Miscellaneous User Flows

## Flow Diagram

```mermaid
flowchart TD
  A[Authenticated user] --> B[/dashboard]
  A --> C[/reports]
  A --> D[/activity]
  A --> E[/calendar]
  A --> E1[/google-workspace]
  A --> F[/timesheet]
  A --> G[/time-tracking]
  A --> H[/msa]
  A --> I[/msa/sign/:token]
  A --> J[/chat]
  A --> K[/landing]
  A --> L[/login]
  A --> M[/forgot-password]
  A --> N[/reset-password]
  A --> O[404]
```

## Main Dashboard
- How the user reaches it: post-login default route.
- What they can do: review global work and jump into modules.
- What happens after every action: card/link navigation changes route.
- Backend APIs called: dashboard APIs.
- Timeline events created: none directly.
- Notifications sent: none directly.
- Related modules updated: many app areas by navigation.

### Lead Follow-ups section (top of dashboard)
- How the user reaches it: the dashboard's first section by default (above the Workflow Guide).
- What they can do: see every lead that has a follow-up scheduled, sorted soonest-first, with the lead name/company, follow-up date (overdue and today highlighted), the date the lead was created, the mobile number (tap-to-call `tel:` link), the current pipeline stage, and the follow-up note. Rows link to the lead detail page; the count badge includes an overdue count.
- What happens after every action: clicking a row navigates to `/crm/leads/:id`; calling opens the device dialer; refreshing re-fetches leads with `next_follow_up_at` set.
- Backend APIs called: `GET /api/v1/crm/leads?has_follow_up=true&limit=500` (company-scoped, `transferred_at` excluded, sorted by soonest `next_follow_up_at`).
- Timeline events created: none directly.
- Notifications sent: none directly.
- Related modules updated: CRM Leads; the section updates when a follow-up is scheduled (via the dashboard live-sync events).
- Tenant isolation: the leads list is always filtered to the authenticated user's `company_id`; Employees see only their own calendar follow-up events instead of the company-wide list (RBAC visibility preserved).

## Global Time Settings
- How the user reaches it: navbar live clock.
- What they can do: view active timezone, time format, seconds setting, and automatic/manual time mode.
- What happens after every action: Admin and Super Admin changes save and immediately update clock/display formatting.
- Backend APIs called: `GET /api/v1/time/settings`, `PUT /api/v1/time/settings`.
- Timeline events created: none directly.
- Notifications sent: none directly.
- Related modules updated: all modules consume UTC timestamps and display through shared frontend time formatting.
- Tenant isolation: settings mutate only the authenticated user; no cross-tenant user lookup is exposed.

## Global Reports
- How the user reaches it: main navigation.
- What they can do: inspect charts and switch time period.
- What happens after every action: report queries refetch.
- Backend APIs called: analytics charts/report APIs.
- Timeline events created: none directly.
- Notifications sent: none directly.
- Related modules updated: dashboard analytics.

## Activity Log
- How the user reaches it: main navigation or admin utilities.
- What they can do: filter activity history by type/date/entity.
- What happens after every action: the activity timeline refetches with updated query parameters.
- Backend APIs called: activity timeline API.
- Timeline events created: this is the feed itself, not the source.
- Notifications sent: none directly.
- Related modules updated: supports all operational modules that emit activity.

## Chat
- How the user reaches it: global communication navigation or `/chat`.
- What they can do: search same-company users, start direct conversations, create groups, and manage group membership where authorized.
- What happens after every action: conversation and message panes update within the available content height below the navbar, without being hidden behind fixed navigation.
- Backend APIs called: chat conversation, message, user search, and group APIs.
- Timeline events created: none directly.
- Notifications sent: message sends may create recipient notifications.
- Related modules updated: Chat and Notifications.
- Tenant isolation: user search and group membership remain scoped to the authenticated user's company.

## Calendar
- How the user reaches it: main navigation.
- What they can do: inspect meetings/tasks/activity in a combined calendar feed.
- What happens after every action: view changes re-filter the merged event list.
- Backend APIs called: meetings, tasks, and activity APIs.
- Timeline events created: none directly.
- Notifications sent: none directly.
- Related modules updated: Meetings, Tasks, CRM Activities.

## Google Workspace
- How the user reaches it: the new Google Workspace main navigation item or route `/google-workspace`.
- What they can do: review the connected Google account, browse Gmail folders, send mail, save drafts, manage Calendar views and events, create Meet links, and inspect connection diagnostics.
- What happens after every action: the active tab updates inside the native SynTask workspace and refetches the relevant Google Workspace data without a full page reload.
- Backend APIs called: Google Workspace dashboard, Gmail, Calendar, Meet, settings, and diagnostics endpoints.
- Timeline events created: task sync and event sync actions may create SynTask task or calendar records.
- Notifications sent: email and meeting actions may trigger SynTask notifications or activity records.
- Related modules updated: Tasks, Calendar, Meetings, Notifications.

## Timesheet and Time Tracking
- How the user reaches it: main navigation or task flows.
- What they can do: log time and review timesheets.
- What happens after every action: entries refresh and summary cards update.
- Backend APIs called: timesheet and time-tracking APIs.
- Timeline events created: time logs may be surfaced as activity events where wired.
- Notifications sent: none directly.
- Related modules updated: Tasks, Projects, Reports.

## MSA and Public Signing
- How the user reaches it: main navigation for MSA, public token link for signing.
- What they can do: create/manage agreements or sign via public route.
- What happens after every action: agreements update or signature submit completes the signing flow.
- Backend APIs called: MSA CRUD/sign/download/send endpoints.
- Timeline events created: agreement actions should be audited if backend supports it.
- Notifications sent: agreement/signature notifications may be backend-driven.
- Related modules updated: Clients, Projects.

## Authentication / Landing / 404
- How the user reaches it: public entry points, auth pages, or invalid routes.
- What they can do: log in, request admin access, reset password, or recover from invalid routes.
- What happens after every action: authentication changes route state or completes reset flow.
- Backend APIs called: auth/login/refresh/logout/forgot-password/reset-password endpoints.
- Timeline events created: none directly.
- Notifications sent: auth email flows may be backend-driven.
- Related modules updated: session state and route access only.
