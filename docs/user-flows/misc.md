# Miscellaneous User Flows

## Flow Diagram

```mermaid
flowchart TD
  A[Authenticated user] --> B[/dashboard]
  A --> C[/reports]
  A --> D[/activity]
  A --> E[/calendar]
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

## Calendar
- How the user reaches it: main navigation.
- What they can do: inspect meetings/tasks/activity in a combined calendar feed.
- What happens after every action: view changes re-filter the merged event list.
- Backend APIs called: meetings, tasks, and activity APIs.
- Timeline events created: none directly.
- Notifications sent: none directly.
- Related modules updated: Meetings, Tasks, CRM Activities.

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
