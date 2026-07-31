# SynTask — Tab-Based Sub-Navigation Implementation Plan

> Companion to `sidebar-phase-implementation-plan.md` and `sidebarnewnew.md`.
> Question answered: **Can we move every main section's sub-items out of the sidebar and into
> Chrome-style tabs inside the page, keeping only the 12 main sections in the sidebar?**
> Status: Ready for product sign-off · Owner: Developer / Product

---

## 0. Direct answer — YES ✅

**Yes, this is completely doable, and it is cheap to build on top of what Phases 0–8 already
delivered.** The pattern is tab-based sub-navigation (exactly like Chrome tabs / the Apollo-style
"People · Companies · Lists · Saved Searches" header):

- The sidebar shows **only the 12 main sections** — no sub-items.
- Clicking a section lands on that section's first tab, and a **horizontal tab bar** renders across
  the top of the content area — one tab per sub-item (e.g. Clients → `Companies | Contacts | Client
  Calendar | Client Insights | Client Settings`).
- The **active tab follows the URL**, so deep links, refresh, and detail pages all keep the right
  tab highlighted.
- **No routes, no data, no permissions change** — it is a navigation-layer UI change, exactly like
  the redesign that already shipped.

**Why it is cheap:** Phase 5 built `getNavContextForPath(pathname, search)` in
`config/navigation.js` — it already resolves any route to its section + item (including `?meta=…`
panels and detail-page prefixes). The tab bar is mostly a new component that reads that same
function, plus a small refactor to move the sidebar's item-gating logic into a shared helper.

---

## 1. What changes vs. what stays

| Aspect | Today | After this plan |
|---|---|---|
| Sidebar top level | 12 sections (unchanged) | 12 sections (unchanged) |
| Sidebar sub-items | Collapsible list under each section | **Removed** — sections become direct links |
| Sub-navigation location | In the sidebar | **In-page horizontal tabs** (Chrome-style) |
| Active state | Sidebar item highlighted | Tab highlighted (from the URL) |
| Routes | Unchanged | **Unchanged** — tabs reuse existing routes |
| Permissions / roles | Section + item gates in `Sidebar.jsx` | Same gates, moved to a shared helper used by both Sidebar and the tab bar |
| Breadcrumbs | `Home → Section → Page` (Phase 5) | Unchanged — already reads the same config |
| Inbox unread badges | Badges on Inbox sub-items + header total (Phase 6) | Badges move to the **Inbox tabs** (per-channel) |
| Favorites | Sub-items can be starred | Decide: keep (favorites links still work) or re-scope to sections |
| `NAV_GROUPS_OPEN_KEY` (expand state) | Needed for collapsible groups | No longer needed → removed entirely (stale keys ignored, no bump required) |

---

## 2. Section → tab mapping (from the shipped `config/navigation.js`)

| Section | Tabs (first tab = landing route) |
|---|---|
| Home | Home (`/dashboard`) · Calendar (`/calendar`) *(decide: tabs or plain)* |
| Sales | Leads · Pipeline · Import Leads |
| Clients | All Clients · Companies · Contacts · Client Calendar · Client Insights |
| Work | Projects · Tasks · Requests · Scheduled Work · Time Tracking |
| Content | Content Calendar · Content Studio |
| Publishing | Publishing Centre · Social Accounts · Publishing Analytics · Integrations *(Social Accounts / Publishing Analytics / Integrations have "Soon" badges)* |
| Inbox | WhatsApp · Instagram · Messenger · Meta Messages · Notifications · Activity Feed · Daily Updates · AI Replies · Approval Queue *(Approval Queue has a "Soon" badge)* |
| AI Workspace | AI Assistant · AI Content Assistant |
| People | Employees · My People · Attendance · Live Attendance · Attendance Reports · Leave Management · Departments · Company Directory **+ HR items** (Hiring Dashboard, Job Openings, Applications, Candidates, Talent Pool, Interviews, Hiring Reports) **+ dynamic "Your Departments"** |
| Finance | Invoices · Transactions · Subscriptions |
| Insights | Workspace Reports · Sales Reports |
| Settings | System Settings · Roles & Permissions · Automation Rules · Connected Accounts · Google Workspace · Activity Logs · Client Settings |

Notes:
- **Query-string panels** (`/crm/settings?meta=whatsapp` → Inbox · WhatsApp) already resolve via
  `getNavContextForPath` — no extra work.
- **Detail routes** (`/crm/leads/:id`, `/projects/:id/board`, `/clients/:id/workspace`) keep the
  parent tab active via prefix matching (already implemented).
- **People** is the one section whose tabs must be assembled from three sources (config items +
  HR items + dynamic departments). The plan centralises this so the tab bar and sidebar agree.

---

## 3. Key design decisions — need product sign-off (gate 1)

| # | Decision | Options |
|---|---|---|
| D1 | What does clicking a sidebar section do? | (a) Navigate to the section's first tab *(recommended)* (b) Open a section landing page |
| D2 | Does **Home** get tabs (Home · Calendar)? | (a) No — Home is the plain landing page, Calendar stays a second sidebar item *(recommended)* (b) Yes — two tabs |
| D3 | Items with the **"Soon"** badge (Publishing Analytics, Integrations, Social Accounts, Approval Queue)? | (a) Show as disabled tabs with "Soon" (b) Hide until live (c) Render as normal tabs now |
| D4 | **Favorites**: keep starring sub-items? | (a) Keep — existing sub-item favorites still navigate to the same routes, and the tab bar gets a star toggle so they stay manageable *(recommended)* (b) Re-scope to section-level only, pruning stored sub-item favorites (c) Migrate stored favorites on load |
| D5 | **Single-item sections** (none currently, but AI has 2): show a tab bar? | (a) Yes, always for consistency (b) Only when a section has ≥2 tabs |
| D6 | Mobile behaviour | Tab bar scrolls horizontally (Chrome-like) — confirm no pinching requirement |
| D7 | Section with a **hidden/merged** item (HR "Employees") | Already excluded via `HR_ITEM_SKIP` — tab list must apply the same skip set |

---

## 4. Phase A — Shared navigation data + gating (config layer)

**Goal:** one source of truth for "the tabs of section X" used by both the sidebar (section count /
role gate) and the new tab bar.

- **New:** `config/navigation.js` — add `getSectionItems(sectionKey, user)` that returns the final,
  gated, ordered item list for a section (reusing the existing `filteredNavigation`,
  `filteredCrmNavigation`, `filteredMetaNavigation`, HR assembly, `HR_ITEM_RENAMES`/`HR_ITEM_SKIP`,
  dynamic departments, and `gateItem` logic currently living inside `Sidebar.jsx`).
- `Sidebar.jsx` switches to this helper (behaviour unchanged — same output).
- `getNavContextForPath` stays the router for active-tab resolution.

**Acceptance:** `Sidebar.test.jsx` still green after the refactor (identical rendering).

---

## 5. Phase B — `SectionTabs` component (new)

**New:** `src/components/layout/SectionTabs.jsx` (or `src/components/SectionTabs.jsx`).

- Renders a horizontal, scrollable tab list for the **section that owns the current route**
  (via `getNavContextForPath(pathname, search)`).
- **Active tab** = the resolved item; deep-link and refresh safe.
- **Gating:** uses `getSectionItems` so role/module/capability rules match the sidebar exactly.
- **"Soon"** badges render per D3.
- **Inbox counts:** consumes `useInboxUnreadCounts()` (Phase 6 hook) so tabs show
  WhatsApp 45 · Instagram 32 · … and the active count follows the same polling (30s, no reload).
- **Accessibility:** `role="tablist"` / `role="tab"` / `aria-selected`, arrow-key navigation,
  visible focus ring.
- **Styling:** Chrome-like — compact, pill or underline active state, subtle top border; dark theme
  tokens only (no hard-coded light-theme hex, per Phase 3 rule).

**Acceptance:** unit tests for active-tab resolution, gating, badge rendering, a11y roles.

---

## 6. Phase C — Mount the tab bar in the layout

**Edit:** `src/layouts/MainLayout.jsx` — render `<SectionTabs />` between the `Header` and the
`content-card` (it already computes `buildBreadcrumbTrail` and reads `location`).

- Renders only when the current route belongs to a sidebar section (chat/meetings/auth pages show
  nothing).
- Respects D5 (single-tab sections may hide the bar).
- Chat page (`/chat`) unaffected.

**Acceptance:** breadcrumbs and layout tests stay green; manual check on `/projects`, `/crm/leads`,
`/crm/settings?meta=whatsapp`, `/hr/recruitment/jobs`.

---

## 7. Phase D — Sidebar simplification

**Edit:** `src/components/Sidebar.jsx`.

- Remove sub-item rendering (`SidebarNavItem` list under each group). Sections become **direct
  links** to their first tab (D1) instead of expand/collapse buttons.
- Remove `openGroups` / `NAV_GROUPS_OPEN_KEY` entirely (no groups to expand, so no state to
  persist — no key bump needed; stale keys are simply ignored).
- **Remove the section count pill** (it renders `group.items.length`, which is meaningless once
  sub-items no longer live in the sidebar).
- **Move the Inbox header unread badge out of the sidebar** — the per-channel counts live on the
  Inbox tabs only, so `useInboxUnreadCounts` is consumed by exactly one component (no double
  30s polling loops).
- Keep: section role gating, collapse/width toggles, logo/user footer, favorites (per D4).
- `isNavItemActive` moves to the shared helper (used for the sidebar's active state on sections).

**Acceptance:** `Sidebar.test.jsx` updated — sections are links, no sub-links; duplicates and
12-section and role-visibility tests still pass; localStorage key reset verified.

---

## 8. Phase E — Tests & QA

**Automated:**
- New `SectionTabs` unit tests (Phase B).
- `Sidebar.test.jsx` updated for the link-based sidebar (Phase D).
- `navigation.routes.test.js` (Phase 7) still green — every tab href must resolve (it already
  validates every config href).
- `breadcrumbs.test.js` unchanged — trail derives from the same config.

**Manual QA (mirror spec §11):**
- Click each section → correct tab bar appears, first tab active.
- Click each tab → page loads, tab stays active on refresh.
- Detail pages keep the parent tab active (Projects → `/projects/p1/board` keeps "Projects").
- Role check: manager sees no Settings section; employee sees only Home/Work/Inbox tabs.
- Inbox badges update without reload (30s poll).
- Mobile: tab bar scrolls horizontally; sidebar collapses to icons.

---

## 9. Phase F — Deploy & user communication

- Update the launch kit (`sidebar-launch-kit.md`): the quick-reference card gains a note —
  "sub-sections now appear as tabs at the top of each page, not in the menu".
- Launch email addendum: "Looking for a sub-section? Click the section, then its tab at the top."
- Reset stored sidebar state via the `-v3` key bump (Phase D).
- Same CI/deploy pipeline as the redesign (merge → `dev`/`main`).

---

## 10. Risks & guardrails

| Risk | Mitigation |
|---|---|
| Tab bar drift from sidebar gating | Single `getSectionItems` helper — one source of truth |
| Favorites pointing at removed sub-items | Favorites are plain `<Link>`s to real routes — still work; decide D4 |
| People section assembly complexity | Centralised resolver (Phase A) — sidebar and tabs use identical output |
| "Soon" items confusing users | D3 decision + disabled-tab styling |
| Stale expand-state localStorage | `openGroups` state removed entirely — stale keys ignored |
| Sidebar + tabs both polling inbox counts | Single consumer: counts live on the Inbox tabs only |
| Stale sub-item favorites with no star UI | D4: tab bar star toggle (a) or migrate/prune (b)/(c) |
| A11y regressions | ARIA tablist roles + keyboard nav in Phase B |
| Big visual change for users | Launch email + quick-reference card update (Phase F) |

---

## 11. Definition of done

- [ ] Sidebar = 12 link-only sections; zero sub-items.
- [ ] Each section renders in-page Chrome-style tabs from the same gated config.
- [ ] Active tab follows the URL (deep links, refresh, detail pages).
- [ ] Inbox per-channel counts on tabs, updating without reload.
- [ ] Routes / permissions / data untouched; full frontend suite green.
- [ ] Docs updated: this plan + launch kit; README only if nav is mentioned.

---

*Companion to the sidebar redesign plan · Prepared by Buffy · Tab sub-navigation plan v1.0*
