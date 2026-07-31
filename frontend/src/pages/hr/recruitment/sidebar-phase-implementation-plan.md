# SynTask v3.0 — Sidebar Redesign: Phase-wise Implementation Plan

> Derived from `sidebarnewnew.md` (Navigation Redesign Implementation Plan).
> This document is the **engineering handoff**: it converts the product spec into ordered, testable phases and flags every place where the spec conflicts with the actual codebase.
> Owner: Developer / Codex · Status: Ready for review · Companion doc: `sidebarnewnew.md` (product truth)

## Implementation status

| Phase | Name | Status |
|---|---|---|
| 0 | Ground truth & spec corrections | ✅ Done (route table corrected in `config/navigation.js`) |
| 1 | Sidebar data-model refactor | ✅ Done (`config/navigation.js` created; `Sidebar.jsx` consumes it) |
| 2 | Duplicate removal | ✅ Done (Departments / Subscriptions / Users appear once) |
| 3 | 12-section grouping & labels | ✅ Done (exact order, icons, auto-expand, `-v2` key) |
| 4 | Role-based visibility mapping | ✅ Done (section `roles` gates; employee = Home/Work/Inbox; manager/lead hide Settings; sub-admin inherits admin) |
| 5 | Breadcrumb updates | ✅ Done (Home → Section → Page via `utils/breadcrumbs.js`) |
| 6 | Inbox unread badges | ✅ Done (hook + sidebar badges, 30s component-scoped polling) |
| 7 | Testing & QA | ✅ Done (automated: 12 sections, duplicates, roles, route-correctness vs App.jsx; §11 manual checklist documented below) |
| 8 | Deploy & user communication | ✅ Done (go-live checklist, launch email, quick-reference card, post-launch metrics in `sidebar-launch-kit.md`) |

---

## 0. TL;DR

The redesign is **only a navigation-layer change**. It touches one primary file
(`frontend/src/components/Sidebar.jsx`), one layout (`frontend/src/layouts/MainLayout.jsx` for
breadcrumbs), and supporting config/tests. **No routes are created, deleted, or renamed. No page
component is modified. No permission logic changes.**

**8 phases, 2 decision gates:**

| Phase | Name | Effort | Gate |
|---|---|---|---|
| 0 | Ground truth & spec corrections | S | Product sign-off on corrections |
| 1 | Sidebar data-model refactor | M | — |
| 2 | Duplicate removal (Departments / Subscriptions / Users) | S | — |
| 3 | New 12-section grouping & labels | M | Visual QA |
| 4 | Role-based visibility mapping | M | Security review |
| 5 | Breadcrumb updates | S | — |
| 6 | Inbox unread badges | M | Data check |
| 7 | Testing & QA checklist | M | Full QA pass |
| 8 | Deploy & user communication | S | Go-live |

Phases 2–3 are the core visual change and can ship together. Phase 6 (badges) can ship after.

---

## 1. Phase 0 — Ground Truth & Spec Corrections

### Why this phase exists

The spec (`sidebarnewnew.md`) was written against screenshots and assumed routes that do not match
the real codebase in **~25 places**. If followed literally, links will 404. This phase fixes the
mapping table *before* any code is written.

### Files touched

- `frontend/src/pages/hr/recruitment/sidebarnewnew.md` (correct the mapping table — or record corrections in this plan and leave the product doc as-is, per Product decision)

### Route corrections (doc route → actual route in `frontend/src/App.jsx`)

| Doc Section 4 row | Doc route | **Actual route** | Notes |
|---|---|---|---|
| My Team | `/team` | `/my-team` | Doc route does not exist |
| Live Attendance | `/attendance/live` | `/live-monitor` | `/attendance/live` is a redirect to `/live-monitor` |
| Attendance Reports | `/attendance/reports` | `/attendance-reports` | redirect exists |
| CRM Meta Inbox | `/crm/meta-inbox` | `/crm/inbox` | MetaInbox page |
| Meta Command Center | `/meta/command` | `/crm/settings?meta=command-center` | Meta panels live inside CRM Settings |
| WhatsApp / Instagram / Messenger | `/meta/whatsapp` etc. | `/crm/settings?meta=whatsapp` etc. | query-string panels |
| AI Reply Drafts | `/meta/ai-replies` | `/crm/settings?meta=ai-drafts` | |
| Human Approval Queue | `/meta/approvals` | `/crm/settings?meta=approval-queue` | |
| Omnichannel Analytics | `/meta/analytics` | `/crm/settings?meta=analytics` | |
| Partner Readiness | `/meta/partner` | `/crm/settings?meta=readiness` | |
| Customer Meta Connect | `/meta/connect` | `/crm/settings?meta=connect` | |
| AI Command Center | `/ai` | `/ai-hub` | Also `/ai-assistant` (chat) |
| Creative Studio | `/creative` | `/creative-director` | |
| Marketing Assistant | `/ai/marketing` | `/marketing-support` | |
| Content Calendar | `/content/calendar` | `/content-calendar` | |
| HR Jobs / Inbox / Candidates / Employees / Resume Pool / Interviews / Reports | `/hr/jobs` … | `/hr/recruitment/jobs` … | HR lives under `/hr/recruitment/*` |
| Admin Permissions | `/admin/permissions` | `/admin-permissions` | |
| Workflows | `/admin/workflows` | `/workflows` | |
| Company Directory | `/admin/directory` | `/companies` | |
| Bulk Lead Import | `/admin/import` | `/bulk-leads` | |
| Audit Log | `/admin/audit` | `/activity` | |
| Admin Settings | `/admin/settings` | `/settings` | |
| Admin Users | `/admin/users` | `/users` | (duplicate removed in Phase 2) |

### Sub-menu items with **no existing page** (must be decided, not coded)

The spec's Section 8 lists sub-items that have no route in `App.jsx`. Options per item: **(a)** link to nearest existing page, **(b)** hide until the page exists, **(c)** build a placeholder page (out of scope — needs product decision).

| Section | Spec sub-item | Existing page? | Recommended action |
|---|---|---|---|
| Sales | Meetings | ✅ `/meetings` | Link |
| Sales | Proposals / Quotations / Contracts / Follow Ups / Won-Lost / Deals | ❌ none | Hide until built (or group into `/crm/pipeline` views) |
| Clients | Documents / Notes / Client Communication | ❌ none | Hide until built |
| Content | Campaigns / Scripts / Graphics / Videos / Brand Kit / Media Library / Content Approvals | ❌ none | Hide until built; keep Content Calendar + Content Studio only |
| Publishing | Publishing Queue / Scheduled Posts | ❌ none | Hide; keep Publishing Centre / Social Accounts / Analytics / Integrations |
| AI Workspace | AI Writer / AI Reply Generator | ❌ none | Hide; keep AI Assistant (`/ai-hub`) + AI Content Assistant (`/marketing-support`) |
| Finance | Payments / Expenses | ❌ none | Hide; keep Invoices / Transactions (Ledger) / Subscriptions |
| Insights | Business Overview / Sales / Marketing / Project / Finance / People Reports | Partial (`/reports`, `/crm/reports`, `/sales/reports`, `/attendance-reports`) | Map what exists, hide the rest |

### Phase 0 acceptance criteria

- [ ] A corrected, code-verified route table exists (this document serves as it).
- [ ] Product signs off on the hide-vs-link decisions for missing pages.
- [ ] The "12 sections, 3 duplicate removals" scope is confirmed unchanged.

---

## 2. Phase 1 — Sidebar Data-Model Refactor

### Why

Today `Sidebar.jsx` (≈1,140 lines) mixes three concerns: item definition (`navigation` array),
grouping (`navigationGroups`), and rendering (`SidebarNavGroup`/`SidebarNavItem`). To restructure
safely, first extract the data so Phase 2–3 become declarative config edits with zero risk to
permissions.

### Files touched

- **New:** `frontend/src/config/navigation.js` — move `navigation`, `crmNavigation`, `metaOmnichannelNavigation`, `departmentItems` logic, `navigationGroups`, and color maps here as pure data
- **Edit:** `frontend/src/components/Sidebar.jsx` — import from config; keep all rendering + auth logic (`useAuthStore`, `filteredNavigation` filtering, `hasModule`, `hasCapability`, `hasDepartment`, favorites, open-groups state, localStorage keys)

### Rules (from spec §7 — non-negotiable)

1. No route changes. Keep every `href` exactly as the corrected table.
2. No permission changes. Keep `roles`, `module`, `capability`, `department` fields intact.
3. No page/component/form/data changes.

### Acceptance criteria

- [ ] Sidebar renders **identically** to today after refactor (pixel-compare, all roles).
- [ ] `navigationGroups` becomes a pure function of `(filteredNavigation, user)`.
- [ ] `npm test` Sidebar tests still pass (one test exists: `Sidebar.test.jsx`).

---

## 3. Phase 2 — Duplicate Removal (highest priority per spec §6)

### Items to remove

| Duplicate | Remove from | Keep in | Route (unchanged) |
|---|---|---|---|
| Departments | Administration group | People → Departments | `/departments` |
| Subscriptions | Administration group | Finance → Subscriptions | `/subscriptions` |
| Users | Administration group | People → Employees | `/users` |

### Files touched

- `frontend/src/config/navigation.js` (or `Sidebar.jsx` if Phase 1 not yet merged)

### Acceptance criteria

- [ ] The strings "Departments", "Subscriptions", and "Users" appear **once** in the sidebar for admins.
- [ ] No route, guard, or permission code touched.

---

## 4. Phase 3 — New 12-Section Grouping & Labels

### Target structure (spec §2 + §8) — exact order

```
Home        (no sub-menu; default landing = /dashboard, relabel "Dashboard" → "Home")
Sales       Leads, Pipeline, Import Leads  (+ hidden: Deals/Meetings/Proposals/… until pages exist)
Clients     Clients (All Clients), Companies, Contacts, Client Calendar, Client Insights, Client Settings
Work        Projects, Tasks, Requests (/tickets), Scheduled Work (/scheduled-jobs), Time Tracking (/timesheet)
Content     Content Calendar, Content Studio (/creative-director)
Publishing  Publishing Centre, Social Accounts, Publishing Analytics, Integrations (meta panels)
Inbox       WhatsApp, Instagram, Messenger, Notifications, Activity Feed (/timeline), Daily Updates (/eod), AI Replies, Approval Queue, Meta Messages (/crm/inbox)
AI Workspace  AI Assistant (/ai-hub), AI Content Assistant (/marketing-support)
People      Employees (/users), Attendance, Live Attendance, Leave Management (/leaves), Departments, Company Directory (/companies), Hiring Dashboard, Job Openings, Applications, Candidates, Talent Pool, Interviews, Hiring Reports
Finance     Invoices, Transactions (/ledger), Subscriptions
Insights    Workspace Reports (/reports), CRM Reports (/crm/reports), Attendance Reports
Settings    Organisation (/settings), Roles & Permissions (/admin-permissions), Automation Rules (/workflows), Connected Accounts (meta identity), Google Workspace, Activity Logs (/activity), System Settings (/settings), Client Settings (/crm/settings)
```

### Icon mapping (spec §10.4 → lucide icons already in `Sidebar.jsx`)

| Section | Icon (available in project) |
|---|---|
| Home | `LayoutDashboard` |
| Sales | `TrendingUp` or `Briefcase` |
| Clients | `Briefcase` or `Factory` |
| Work | `FolderKanban` |
| Content | `Palette` |
| Publishing | `Megaphone` |
| Inbox | `MessageSquareText` |
| AI Workspace | `Bot` |
| People | `UserCog` / `Users` (import `Users` from lucide) |
| Finance | `DollarSign` or `CreditCard` |
| Insights | `LineChart` |
| Settings | `Settings` |

### UI behaviour to implement (spec §10.1–10.2, adapted to existing dark theme)

- **Default collapsed state:** all groups collapsed except the section containing the current route → auto-expand (already exists via `openGroups`; change default from `true` to route-aware).
- **Active state:** current page gets the existing active gradient (purple `from-primary-500/15`) — keep current style; spec's `#5B4FE8`/`#EEF0FF` are light-theme values and the app uses a dark sidebar — apply as "primary" token, not hard-coded hex.
- **Hover state:** `hover:bg-white/5` (existing) — keep.
- **localStorage reset on deploy:** bump `NAV_GROUPS_OPEN_KEY` (`syntask-sidebar-groups-open`) to a new key name (e.g. `syntask-sidebar-groups-open-v2`) so stale collapsed state is dropped.

### Files touched

- `frontend/src/config/navigation.js` — new group definitions + labels + icons
- `frontend/src/components/Sidebar.jsx` — renderer tweaks only (auto-expand on route, key bump)
- `frontend/src/components/Sidebar.test.jsx` — update "Client Management" expectation to new structure

### Acceptance criteria

- [ ] Exactly 12 top-level sections, in the spec's order, for an admin.
- [ ] All links resolve to real routes (no 404s).
- [ ] Favorites, collapse/width toggles, HR special-casing, and "Your Departments" dynamic list still work.
- [ ] Sub-menu items for missing pages are hidden (Phase 0 decisions).

---

## 5. Phase 4 — Role-Based Visibility Mapping

### Spec vs reality (must be reconciled)

The spec §9 lists roles that **do not exist** in the app's role enum (`frontend/src/utils/roles.js`:
`SUPER_ADMIN | ADMIN | SUB_ADMIN | MANAGER | LEAD | EMPLOYEE`). Map spec roles to real ones:

| Spec role | Real role(s) | Notes |
|---|---|---|
| Super Admin | `SUPER_ADMIN` | all sections |
| Admin | `ADMIN`, `SUB_ADMIN` | all sections (Sub Admin inherits Admin visibility) |
| Manager / Team Lead | `MANAGER`, `LEAD` | hide Settings |
| Sales Executive | module `sales` / `sales_crm` users | gate by existing `hasModule` |
| Social Media Manager / Content Creator / HR Executive / Finance Executive | not a distinct role today | gate by module (`ai_agents`, `hr`, `invoicing_ledger`) + department |
| Employee | `EMPLOYEE` | Home, Work (own tasks), Inbox only |

### Implementation

- Keep using the **existing** `filteredNavigation` gate (roles + modules + capabilities + department). Do **not** build a parallel role system.
- Add a `sections` visibility array on each nav item (`sections: ['sales']`) and let group membership drive section visibility; a section renders if any of its items survive the existing filter.
- **Security rule:** never broaden access — the sidebar hides things, but guards in `App.jsx` (e.g. `CompanyAdminGuard`, `CRMSettingsGuard`, `ModuleGuard`) remain the source of truth.

### Files touched

- `frontend/src/config/navigation.js`
- `frontend/src/components/Sidebar.jsx`

### Acceptance criteria

- [ ] Employee sees only Home, Work, Inbox.
- [ ] Manager does not see Settings.
- [ ] Non-sales user does not see Sales section.
- [ ] Negative tests in `Sidebar.test.jsx` for the above.

---

## 6. Phase 5 — Breadcrumb Updates

### Spec (§10.5)

All breadcrumbs start with **Home**, not Dashboard. Format: `Home → Section → Page`.

### What was implemented

- **New:** `frontend/src/config/navigation.js` — `getNavContextForPath(pathname, search)` resolves a route to its sidebar section + item (query-aware for meta panels, prefix-aware for detail pages).
- **New:** `frontend/src/utils/breadcrumbs.js` — `buildBreadcrumbTrail(pathname, search)` returns `['Home', Section, Page, …]` reusing the sidebar labels (so renamed items like `Requests`/`Scheduled Work`/`Employees` and HR renames like `Job Openings` show in both nav and breadcrumb).
- **New:** `frontend/src/utils/breadcrumbs.test.js` — unit tests for the acceptance criteria.
- **Edit:** `frontend/src/layouts/MainLayout.jsx` — removed the inline `BREADCRUMB_LABELS`/`CRM_BREADCRUMB_LABELS` maps and the segment-joiner; now calls `buildBreadcrumbTrail` (pageTitle fallback `Main Dashboard` → `Home`).

### Acceptance criteria

- [x] `/dashboard` shows breadcrumb `Home`.
- [x] `/projects` shows `Home / Work / Projects` (section label injected).
- [x] CRM pages show `Home / Sales / …`-style labels (`/crm/leads` → `Home / Sales / Leads`; `?meta=whatsapp` → `Home / Inbox / WhatsApp`).
- [x] Non-sidebar routes (`/chat`, `/meetings`) fall back to `Home / <page>`.

---

## 7. Phase 6 — Inbox Unread Badges

### Spec (§10.3)

Inbox top-level shows total unread; each channel sub-item shows its own count (WhatsApp 45, Instagram 32, …), updating in real time.

### What was implemented (option 1 — reuse existing APIs)

- **New:** `frontend/src/hooks/useInboxUnreadCounts.js` — component-scoped hook that polls `notificationsAPI.listNotifications()` (`.unread_count`) + `metaInboxApi.getConversations()` (sums `unread_count` per channel) every 30s. `Promise.allSettled` so one failing source never blanks the other. Deliberately does **not** dispatch app-wide refresh events (NotificationBell cascade lesson). `computeInboxCounts` is a pure exported aggregator (unit-tested).
- **Edit:** `frontend/src/components/Sidebar.jsx` — Inbox section items (WhatsApp/Instagram/Messenger/Meta Messages/Notifications) get per-channel badges; the Inbox section header shows the grand total (`metaTotal + notifications`); badges hidden when the count is 0; counts capped at `99+`.
- **Tests:** `frontend/src/hooks/useInboxUnreadCounts.test.js` + new badge cases in `Sidebar.test.jsx`.

### Acceptance criteria

- [x] Badges render for Inbox + channel items; hide badge when count is 0.
- [x] Counts refresh without a page reload (30s polling).

---

## 8. Phase 7 — Testing & QA

### Automated

- `frontend/src/components/Sidebar.test.jsx` (updated across Phases 3–6):
  - 12 sections exist in order (admin). ✅
  - Duplicates removed (Departments/Subscriptions/Users appear once). ✅
  - Role visibility (employee/manager/lead) — negative cases. ✅
  - Inbox unread badges (Phase 6). ✅
- **New:** `frontend/src/config/navigation.routes.test.js` — route correctness + config integrity:
  - Parses App.jsx's `<Route>` tree **at test time** (JSX-aware, comment-aware) so the check can never drift, then asserts **every sidebar href** (navigation + crmNavigation + metaNavigation + HR items) resolves to a registered route — no 404s.
  - Meta omnichannel panels all point at the real `/crm/settings` route.
  - No sidebar href is duplicated across sections.
  - Every `SECTIONS` item name resolves to a real nav item (no silent drops from the `itemByName` lookup).
  - Exactly 12 sections, unique keys.
  - HR rename keys + skip list target real HR module items.
  - `NAV_GROUPS_OPEN_KEY` is the `-v2` key (deploy reset, QA #20).
- Run: `npm test` (vitest) — the 4 sidebar-related suites stay green (**47/47**: `navigation.routes` 8, `Sidebar` 19, `breadcrumbs` 14, `useInboxUnreadCounts` 7 — verified 2026-07-31). The **full** suite has 10 failures in 7 files (`pageHeaderGradients`, `timeAudit`, `projectsData`, `ProjectBoard`, `TaskDetail.helpers`, `AdminPermissions`, `crm/leads/workspace`) — all **pre-existing and unrelated** to this redesign: none of those files import the sidebar config/hooks, none were touched by Phases 0–6 (confirmed via `git diff --name-only`), and their failures concern header gradients, `new Date` usage in `api/ai.js`, assignee splitting, the admin department query param, and lead-workspace save confirmation. Track separately from this plan.

### Manual QA — spec §11 checklist (condensed to 20 rows in `sidebarnewnew.md`)

Run items 1–20 personally before release. Key ones:
- #9 People label is "People", not "Team".
- #10/#12 Departments & Subscriptions appear exactly once.
- #15 exactly 12 top-level sections.
- #16/#17 role-based visibility (Social Media Manager → no Settings/Finance/Sales; Employee → Home/Work/Inbox only).
- #20 refresh mid-navigation keeps correct section expanded (localStorage key bump).

### Files touched

- `frontend/src/config/navigation.routes.test.js` (new)
- `frontend/src/components/Sidebar.test.jsx` (updated in Phases 3–6)
- No other test files reference the old group labels (verified: only Sidebar.test.jsx).

---

## 9. Phase 8 — Deploy & User Communication

### What was produced

**New: `frontend/src/pages/hr/recruitment/sidebar-launch-kit.md`** — the operational handoff, aligned with the **final implemented sidebar** (not the pre-correction spec):

1. **Go-live checklist (10 steps)** — mapped to the real pipeline: merge `oj/fixing` → `dev` → `main`, CI gates (`.github/workflows/ci.yml`: pytest, `npm test`, lint, build, audits, Docker builds), the `NAV_GROUPS_OPEN_KEY` v2 localStorage reset (Phase 3), `deploy-dev`/`deploy-prod` jobs (SSH → `/opt/syntask` → docker compose up), staging QA §11, prod smoke test, email + card distribution, baseline metrics. Includes the known-issue note about the 10 pre-existing unrelated frontend failures.
2. **Launch-day email** (spec §12) — verbatim template, ready to send.
3. **Quick-reference card** (spec §13) — corrected to the real sidebar: every "go to" is a live menu item (e.g. `Clients → Client Insights`, `Inbox → Meta Messages`, `Settings → Connected Accounts`); spec rows pointing at pages that don't exist (Email channel, etc.) were removed/rewritten. A separate note lists the items intentionally hidden (Phase 0 decisions).
4. **Post-launch metrics** (spec §14) — baseline + 4/8-week measurement table.

### Drift guard

- `navigation.routes.test.js` gained a test that parses the quick-reference card table and asserts every `Section → Item` destination resolves to a real `SECTIONS` item (including People HR items) — the card can never point at a menu item that doesn't exist.

### Deploy steps (recap)

1. Merge + CI (`npm test`, build).
2. **Reset stored sidebar state** — the new `NAV_GROUPS_OPEN_KEY` version bump handles this; confirm in staging.
3. Deploy to production (per `docs/infrastructure/DEPLOYMENT.md` / CI pipeline).

### Files touched

- `frontend/src/pages/hr/recruitment/sidebar-launch-kit.md` (new)
- `frontend/src/pages/hr/recruitment/sidebar-phase-implementation-plan.md` (this doc)
- `frontend/src/config/navigation.routes.test.js` (drift-guard test)
- README: no change needed (verified no sidebar/nav/menu mentions).

---

## 10. Risks & Guardrails

| Risk | Mitigation |
|---|---|
| Spec routes don't exist → 404s | Phase 0 corrected route table; automated href check in tests |
| "Hidden" sub-items are expected by users | Phase 0 product sign-off on hide decisions; communicate in launch email |
| Role mapping drift (spec roles ≠ real roles) | Use existing module/capability gates; never broaden access |
| Stale localStorage breaks auto-expand | Key version bump in Phase 3 |
| Inbox badges = N+1 polling | Poll component-scoped, reuse existing APIs first (Phase 6 option 1) |
| Breadcrumb labels touched by many pages | Keep to `MainLayout` + CRM/HR label maps; QA spot-check |

---

## 11. Definition of Done

- [ ] All 12 sections in exact spec order; no duplicates.
- [ ] Zero route changes; zero permission changes; zero page-component changes.
- [ ] Breadcrumbs start with Home.
- [ ] Role visibility per §9 mapped to real roles.
- [ ] Inbox badges live-updating (if Phase 6 included).
- [ ] `npm test` green; manual §11 checklist complete.
- [ ] Docs updated: this plan + corrected `sidebarnewnew.md`; README only if nav structure is mentioned there.

---

*Companion to `sidebarnewnew.md` · Prepared by Buffy · Phase plan v1.0*
