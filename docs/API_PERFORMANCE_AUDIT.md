# Frontend API Performance Audit

Scope: `frontend/src`

Method: static code audit plus a live in-browser monitor added to the app.

Notes:
- No raw `fetch()` calls were found in `src` during this audit. Current traffic goes through the shared Axios client.
- The new monitoring layer records Axios and wrapped fetch timing in memory and exposes a browser dashboard at `/dev/api-performance`.
- The build was verified after the instrumentation change.

## Executive Summary

The frontend has a small number of high-impact performance risks:

1. `Dashboard.jsx` loads data sequentially, creating a waterfall on first render.
2. `usersAPI.getAssignableUsers()` is requested from many surfaces, which can create duplicate requests across pages and modals.
3. Several pages fetch the same sales master data with separate React Query keys, reducing cache reuse.
4. `NotificationBell.jsx` and `Chat.jsx` poll aggressively, which can generate repeated traffic in active sessions.
5. Detail modals and boards load several related resources at once without shared cache keys, causing repeated reads of similar data.

## Highest-Risk Requests

| Endpoint URL | Method | File(s) | Triggering page/component(s) | Initial-load executions | Duplicate request risk | Sequential or parallel | Potential performance issue |
|---|---:|---|---|---:|---|---|---|
| `/dashboard/stats` | GET | `src/pages/Dashboard.jsx` | Dashboard | 1 | Low | Sequential with follow-up requests | Start of the dashboard waterfall; any latency blocks the rest of the page. |
| `/tasks/?limit=8` | GET | `src/pages/Dashboard.jsx` | Dashboard | 1 after stats | Medium | Sequential after stats | Delays task cards and makes the dashboard feel slower than necessary. |
| `/reports/analytics/charts?period=month` | GET | `src/pages/Dashboard.jsx` | Dashboard | 1 conditional | Low | Sequential after tasks | Optional chart load still waits behind prior requests. |
| `/tasks/?...` | GET | `src/pages/Tasks.jsx` | Tasks page | 1 on mount, then on filter/search changes | Medium | Mostly sequential with user lookup | Search and filter changes can refetch repeatedly without shared cache. |
| `/users/assignable?...` | GET | `src/pages/Tasks.jsx`, `src/pages/Tickets.jsx`, `src/pages/TaskDetail.jsx`, `src/components/TaskDetailModal.jsx`, `src/components/TicketDetailModal.jsx`, `src/pages/Projects.jsx`, `src/pages/sales/SalesProspects.jsx` | Multiple task/ticket/project/sales surfaces | 1 per mounted consumer | High | Often parallel but duplicated across screens | The same staff list is fetched from many components with no shared query key. |
| `/notifications/?...` | GET | `src/components/NotificationBell.jsx` | Header notifications | 1 on mount, then every 10s | High | Polling | Repeated reads even when the user is idle; good candidate for longer stale windows. |
| `/chat/conversations` | GET | `src/pages/Chat.jsx` | Chat page | 1 initial, then every third poll | Medium | Polling | Conversation list is reloaded on a schedule even if nothing changed. |
| `/chat/conversations/:id/messages?...` | GET | `src/pages/Chat.jsx` | Chat page | 1 initial for selected conversation, then every 8s | High | Polling | Message polling can become expensive in long sessions. |
| `/search?q=...` | GET | `src/components/GlobalSearch.jsx` | Global search overlay | 0 until query length >= 2, then 1 per debounce | Medium | Single request per debounce | Can generate many requests during typing if the backend search is not indexed. |
| `/msa?...` | GET | `src/pages/MSA.jsx`, `src/pages/MSASign.jsx` | MSA listing and signing pages | 1-3 depending on tab/filter state | Medium | Mostly parallel in one effect | Multiple list loads on mount and filter changes; cache reuse is limited. |
| `/clients` | GET | `src/api/clients.js`, `src/pages/MSA.jsx` | MSA page and client-management views | 1 on pages that mount it | Medium | Depends on caller | Shared client data is fetched from multiple places with different query lifecycles. |
| `/projects/` | GET | `src/pages/Projects.jsx`, `src/pages/ProjectBoard.jsx`, `src/pages/Tasks.jsx`, `src/pages/TimeTracking.jsx` | Projects, project board, tasks, time tracking | 1 on each mounting page | High | Often duplicated across pages | Project lists are reused for several workflows without a unified cache key. |
| `/projects/:id/board` | GET | `src/pages/ProjectBoard.jsx` | Project board | 1 | Low | Parallel with other board data | Large board payloads can be heavy and should be isolated from unrelated calls. |
| `/projects/:id/summary?days=7` | GET | `src/pages/ProjectBoard.jsx` | Project board | 1 | Low | Parallel with other board data | Summary data is useful, but can still be expensive if requested with board data on every entry. |
| `/projects/:id/components` | GET | `src/pages/Projects.jsx`, `src/components/TaskDetailModal.jsx`, `src/pages/TaskDetail.jsx` | Project detail/task detail | 1 per opened project/task detail | Medium | Parallel with versions | Duplicate project metadata fetches appear in several detail flows. |
| `/projects/:id/versions` | GET | `src/pages/Projects.jsx`, `src/components/TaskDetailModal.jsx`, `src/pages/TaskDetail.jsx` | Project detail/task detail | 1 per opened project/task detail | Medium | Parallel with components | Same duplication pattern as components. |
| `/tickets/?...` | GET | `src/pages/Tickets.jsx` | Tickets page | 1 on mount, then on filter changes | Medium | Mostly sequential with assignable users | Ticket list and lookup requests are tied to page state and can refetch often. |
| `/time-tracking/tasks/:taskId/time-logs` | GET | `src/pages/TimeTracking.jsx` | Time tracking page | 1 per selected task | Low | Parallel with time summary | Good use of parallelism, but can repeat as task selection changes. |
| `/time-tracking/tasks/:taskId/time-summary` | GET | `src/pages/TimeTracking.jsx` | Time tracking page | 1 per selected task | Low | Parallel with time logs | Same as above; suitable for memoized caching by task id. |
| `/sales/dashboard` | GET | `src/pages/sales/SalesDashboard.jsx` | Sales dashboard | 1 | Low | Parallel with other sales dashboard queries | Dashboard queries are already isolated but can be cached longer. |
| `/sales/contacts/?...` | GET | `src/pages/sales/SalesDashboard.jsx`, `src/pages/sales/SalesContacts.jsx` | Sales dashboard and contacts page | 1 per screen | Medium | Parallel | Similar contact data is fetched on multiple pages with different keys. |
| `/sales/prospects/?...` | GET | `src/pages/sales/SalesDashboard.jsx`, `src/pages/sales/SalesProspects.jsx`, `src/pages/sales/SalesPipeline.jsx`, `src/pages/sales/SalesReports.jsx` | Sales surfaces | 1 per mounted page | High | Parallel but fragmented cache | Prospects are fetched several times with different filters and keys. |
| `/sales/masters/stages` | GET | `src/pages/sales/SalesProspects.jsx`, `src/pages/sales/SalesPipeline.jsx`, `src/pages/sales/SalesSettings.jsx` | Sales settings, pipeline, prospect drawer | 0-1 depending on screen state | High | Mostly parallel but duplicated | Same master data is fetched with separate query keys, so cache hits are missed. |
| `/sales/categories/` | GET | `src/pages/sales/SalesProspects.jsx`, `src/pages/sales/SalesSettings.jsx` | Sales settings, prospect drawer | 0-1 depending on screen state | High | Mostly parallel but duplicated | Repeated master-data request across two flows. |
| `/sales/products/` | GET | `src/pages/sales/SalesProspects.jsx`, `src/pages/sales/SalesSettings.jsx` | Sales settings, prospect drawer | 0-1 depending on screen state | High | Mostly parallel but duplicated | Same cache fragmentation as stages and categories. |
| `/superadmin/tenants/` | GET | `src/pages/superadmin/AdminDashboard.jsx`, `src/pages/superadmin/TenantManagement.jsx` | Super admin dashboard and tenant management | 1 per screen | Medium | Parallel with revenue queries | Shared tenant data should use a common key strategy. |
| `/superadmin/billing/revenue/analytics` | GET | `src/pages/superadmin/AdminDashboard.jsx`, `src/pages/superadmin/BillingRevenue.jsx` | Super admin billing surfaces | 1 per screen | Medium | Parallel with other analytics | Aggregated analytics can be expensive and may need longer caching. |
| `/superadmin/usage/analytics` | GET | `src/pages/superadmin/UsageAnalytics.jsx` | Usage analytics page | 1 | Low | Single query | Likely backend-heavy aggregation endpoint. |
| `/calendar/events?month=...` | GET | `src/pages/Calendar.jsx` | Calendar page | 1 per month | Low | Single query | Safe query, but month navigation can trigger repeated fetches. |
| `/timesheet/my-timesheet` | GET | `src/pages/Timesheet.jsx` | Timesheet page | 1 | Low | Single query | Already cached with React Query; low risk. |
| `/meetings/` | GET | `src/pages/Meetings.jsx` | Meetings page | 1 | Low | Single query | Already cached with React Query; low risk. |
| `/reports/analytics/charts?period=...` | GET | `src/pages/Reports.jsx` | Reports page | 1 per period | Low | Single query | Fine as long as the period is cached by query key. |

## Waterfall and Duplicate-Request Findings

### 1. Dashboard waterfall

`src/pages/Dashboard.jsx` loads `getStats()`, then `listTasks({ limit: 8 })`, then `getAnalyticsCharts('month')`.

Why this matters:
- Each request waits for the previous one.
- The dashboard cannot show partial content as early as it could.
- The chart request is independent and should not depend on the task list.

Recommended fix:
- Run the requests in parallel with `Promise.all`.
- Render each widget as soon as its data is ready.

### 2. Shared assignable-users lookup is duplicated

`usersAPI.getAssignableUsers()` is used by:
- `src/pages/Tasks.jsx`
- `src/pages/Tickets.jsx`
- `src/pages/TaskDetail.jsx`
- `src/components/TaskDetailModal.jsx`
- `src/components/TicketDetailModal.jsx`
- `src/pages/Projects.jsx`
- `src/pages/sales/SalesProspects.jsx`

Why this matters:
- The same data can be fetched many times in one session.
- Modals and pages do not appear to share one cache key.

Recommended fix:
- Centralize it under a single React Query key such as `assignable-users`.
- Increase `staleTime` because this list changes infrequently.

### 3. Sales master data is cached inconsistently

`salesApi.getStages()`, `salesApi.getCategories()`, and `salesApi.getProducts()` are each queried from multiple screens with different keys.

Why this matters:
- The same master data is fetched repeatedly.
- Separate query keys prevent cache reuse across the app.

Recommended fix:
- Introduce one shared query key per dataset.
- Reuse the query result in the prospect drawer, pipeline, and settings screens.

### 4. Polling-heavy surfaces

`NotificationBell.jsx` polls every 10 seconds and `Chat.jsx` polls messages every 8 seconds.

Why this matters:
- These endpoints can dominate traffic during long sessions.
- Active users create repeated backend load even when they are not interacting.

Recommended fix:
- Use longer intervals when the tab is hidden or inactive.
- Prefer push updates or optimistic invalidation where possible.

### 5. Modal data loads are broad

`TaskDetailModal.jsx` and `Projects.jsx` load several related resources at once:
- comments
- subtasks
- users
- watchers
- issue links
- changelog
- issue types
- components
- versions

Why this matters:
- Opening one task can trigger many requests.
- Some of those resources are not always visible immediately.

Recommended fix:
- Split modal data into visible and lazy sections.
- Keep the currently visible critical data first, then load lower-priority panels after paint.

## Frontend Optimization Recommendations

Ranked by impact:

1. Parallelize the dashboard requests in `Dashboard.jsx`.
2. Standardize shared query keys for `usersAPI.getAssignableUsers()` and sales master data.
3. Reduce polling frequency or pause polling when tabs are backgrounded.
4. Add shared React Query caching to detail modals and project screens.
5. Keep search endpoints debounced and avoid eager prefetches.

## Likely Backend Bottlenecks

These endpoints are the most likely to expose backend latency:

- `/dashboard/stats`
- `/reports/analytics/charts`
- `/projects/:id/board`
- `/projects/:id/summary`
- `/search`
- `/notifications/`
- `/chat/conversations/:id/messages`
- `/sales/prospects/`
- `/sales/masters/stages`
- `/sales/categories/`
- `/sales/products/`

If any of these are slow in the new dashboard, the root cause is likely backend aggregation, missing indexes, or over-fetching payloads.

## Monitoring Layer Added

Files added:
- `frontend/src/utils/apiPerformanceMonitor.ts`
- `frontend/src/utils/apiFetch.ts`
- `frontend/src/pages/ApiPerformanceDashboard.jsx`

Files updated:
- `frontend/src/api/axios.js`
- `frontend/src/App.jsx`

Behavior:
- Axios requests are intercepted for timing, success/failure, duplicate detection, and estimated response size.
- A fetch wrapper is available for future fetch usage.
- The browser dashboard is available at `/dev/api-performance`.

## Dashboard follow-up (Sep 2026)

A follow-up pass on the Dashboard request/render path (`frontend/src/pages/Dashboard.jsx` + the endpoints it calls) confirmed and fixed the root causes below. See the Dashboard performance change summary for before/after request counts.

| Finding | Status | Fix |
|---|---|---|
| Whole-page loader gated every section (one slow endpoint blocked the shell) | Fixed | Shell (hero + static guides) renders immediately; each data section shows its own `SectionSkeleton` until the slices it reads settle (`renderSection`/`ready` map). |
| Sequential waves: ~9 role-dependent requests waited on `/dashboard/stats` | Fixed | Role is read from the session; every slice is fired in ONE parallel wave. `/dashboard/stats` is now requested only for Super Admins (it returns `null` for every other role). |
| Stuck full-page loader under React StrictMode (in-flight refresh shared with a dead `isMounted` closure) | Fixed | Deduped refresh commits via a component-lifetime `isMountedRef` that StrictMode remounts re-arm, so the shared in-flight run still applies results. |
| Duplicate StrictMode fetches (calendar, refresh fan-out) | Fixed | Both effects are deduped with in-flight refs (single request per mount cycle). |
| Unused 30-day `/content-calendar` request fed only an unrendered state | Removed | Dashboard now fetches only the workspace calendar events it renders. |
| Meetings list N+1 user queries (`User.get` per host + per participant) | Fixed | One batched `_id: {$in}` user query per list page. |
| Projects list N+1 (task-count query + `User.get` per assignee per project) | Fixed | One task-count aggregation + one batched user query; falls back to the old loop if the aggregation is unavailable. |
| Task Health endpoints re-scanned the same task dataset 3× per dashboard load | Fixed | New `GET /tasks/health/dashboard` (summary + team completion + extension counts in ONE scan). Dashboard calls it once instead of `health/summary` + `health/team-completion` + `health/extensions`. |
| Cross-origin `Content-Type: application/json` default forced CORS preflights when `VITE_API_URL` points at a dev backend | Fixed | Removed the static header (Axios sets it only for JSON bodies); `.env.example` now documents the same-origin Vite proxy default. |
| Redis init/retry stalling requests when Redis is down | Already fixed | `backend/app/core/redis_client.py` caches failure with a 30s cooldown + per-attempt timeouts; no change needed. |
| Notification cascade / polling | Already fixed | Poll pauses when the tab is hidden and never dispatches page-refresh events; no change needed. |

## Validation

- `npm -C frontend run build` passed.
- `npm -C frontend run lint` still reports many pre-existing issues in unrelated files; the new monitoring code was adjusted to avoid introducing additional build/lint regressions.
