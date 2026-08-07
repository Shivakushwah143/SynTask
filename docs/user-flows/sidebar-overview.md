# Sidebar Overview Panel

Status: implemented frontend behavior
Last reviewed: 2026-08-07

## Scope

Main sidebar module routes at `/sections/:sectionKey` open a dashboard-style overview before users enter a submodule page. Submodule pages render their normal page content without an extra persistent overview panel. The overview keeps the existing route structure, sidebar permissions, module gates, and business logic. It does not add backend routes, change APIs, or bypass role checks.

Three sections have a dedicated default page instead of the generic `/sections/:key` landing: the sidebar **Home** link opens the Dashboard (`/dashboard`), the sidebar **Sales** link opens the Sales Overview dashboard (`/sales-overview`, `SALES_OVERVIEW_HREF`), and the sidebar **Clients** link opens the All Clients page (`/clients`, `overviewHref: "/clients"`). For Home and Clients the in-page **Overview tab is removed** (`hideOverviewTab: true`) because the dedicated page already is the overview; Sales keeps its Overview tab pointing at the dedicated dashboard. The generic landing routes (`/sections/home`, `/sections/sales`, `/sections/clients`) remain registered for direct URL access.

## User Flow

1. User selects a main sidebar module such as Home, Sales, Clients, Work, People, Finance, Insights, or Settings.
2. Home, Sales, and Clients open their dedicated default pages (`/dashboard`, `/sales-overview`, `/clients`); every other section resolves its landing page through `getSectionItems(sectionKey, user, orgDepartments)`.
3. The page displays a module summary, status cards, quick actions, searchable operational insight cards, and an activity placeholder based only on authorized frontend navigation items and already-cached frontend data.
4. User searches within visible cards to narrow available tools.
5. User opens a card or quick action and lands on the existing submodule route.
6. The section tab bar keeps the Overview tab visible on sibling submodule pages so users can return to the parent module overview without switching sidebar modules.

## Authorization and Tenant Isolation

The overview does not create new permissions or backend contracts. Card visibility remains the same as the sidebar because both use `getSectionItems` with the authenticated user and organization department context. Operational counts are derived from existing React Query cache entries when a destination page has already loaded compatible data. For the Work module, the overview also reuses existing list APIs for Projects, Tasks, Requests, Scheduled Work, Time Tracking, and Daily Updates (EOD) with small limits; unavailable or unauthorized data falls back to neutral placeholders.

Tenant key: tenant-owned data remains enforced by the destination APIs and pages through `company_id` and existing backend authorization. The overview does not expose cross-tenant counts, record names, identifiers, files, or activity data.

Negative tests: ordinary users must not see cards hidden by disabled modules, missing role capability, inactive user state, or department/module gating. Deep-linking to a hidden destination must still be denied by the destination page and backend API.

## Acceptance Criteria

- Every sidebar section with visible items renders a summary header, KPI-style status cards, attention alerts, quick actions where matching existing routes are available, searchable overview cards, and a recent activity or empty state panel.
- Overview cards include an icon, name, operational metrics, status badge, quick actions, hover/focus states, and link to the existing route.
- Search filters locally and does not call new APIs.
- Submodule routes do not render the overview panel; they continue to use their existing page layouts.
- Submodule tab bars keep the Overview tab visible and link it back to the section's default page: `/sections/:sectionKey`, or the dedicated route for sections with `overviewHref` (Sales → `/sales-overview`). Home and Clients render **no Overview tab** (`hideOverviewTab: true`); their default pages are the overview themselves.
- Empty sections show a role-safe empty state.
- Light mode, dark mode, mobile, tablet, and desktop layouts remain usable.
- No backend logic, API contract, permission rule, or route path changes are required.
