# SynTask v3.0 — Sidebar Redesign: Launch Kit

> Companion to `sidebar-phase-implementation-plan.md` and `sidebarnewnew.md` (product spec).
> This kit is the **operational handoff**: what to do on launch day, what to send users, and
> what to give support. It is aligned with the **final implemented sidebar** (`config/navigation.js`),
> not the pre-correction spec — every destination below exists in the real 12-section menu.
>
> Owner: Release owner / Product / Comms · Ready for launch-day execution.

---

## 1. Go-live checklist

| # | Step | Details | Evidence |
|---|---|---|---|
| 1 | Merge the sidebar branch | Merge `oj/fixing` → `dev` (staging), then → `main` (prod). CI runs on push to `dev`/`main`. | PR merged; CI badge green |
| 2 | CI must pass | `.github/workflows/ci.yml` runs backend `pytest`, frontend `npm test`, `npm run lint`, `npm run build`, pip/npm audit, Docker builds. | CI run green |
| 3 | Confirm the sidebar-state reset | `NAV_GROUPS_OPEN_KEY` = `syntask-sidebar-groups-open-v2` (bumped in Phase 3). Old collapsed/expanded state from the previous sidebar is dropped on first load — no stale sections open. | Staging: first load after deploy shows correct section expanded on refresh (QA #20) |
| 4 | Deploy to staging (`dev`) | Push to `dev` → `deploy-dev` job (SSH → `/opt/syntask`, `git reset --hard origin/dev`, `docker compose up -d --build`). | `docker compose ps` shows services healthy |
| 5 | Run QA checklist §11 (20 items) on staging | Click every section; verify People label, 1× Departments/Subscriptions, 12 sections, role visibility, refresh persistence, Inbox badges. | 20/20 passed on staging |
| 6 | Deploy to production (`main`) | Push to `main` → `deploy-prod` job (same flow, prod compose file). | Prod services healthy; `GET /health` OK |
| 7 | Post-deploy smoke test in prod | Login as admin + employee; expand each of the 12 sections; visit `/dashboard`, `/crm/leads`, `/crm/inbox`, `/hr/recruitment`; check breadcrumbs start with **Home**. | Smoke test report |
| 8 | Send the launch email (Section 2) | Verbatim, no technical terms. | Email sent (timestamp, audience) |
| 9 | Distribute the quick-reference card (Section 3) | Print/attach to the launch email; pin in the support channel. | Card distributed to support |
| 10 | Capture baseline metrics (Section 4) | Before/at launch: clicks-to-invoice, clicks-to-leads, onboarding time, nav support tickets, DAU. | Baseline recorded |

> **Known engineering note:** the full frontend suite has 10 pre-existing failures in 7 files
> (header gradients, `timeAudit`, project assignees, `AdminPermissions`, lead workspace) — all
> **unrelated** to the sidebar and none import sidebar modules. They are tracked separately in
> `sidebar-phase-implementation-plan.md` §8. The 4 sidebar-related suites are green (47/47).
> Release owner should confirm CI state on the release commit before go.

---

## 2. Launch-day email (spec §12 — send verbatim)

> **Subject: SynTask has a new menu — everything is still here, just easier to find**

Hi team,

You will notice the SynTask menu looks different today. Here's what changed and what didn't:

**What did NOT change:** All your data, all your projects, all your clients, all your conversations — everything is exactly where you left it. Your work has not changed.

**What DID change:** The names and grouping of menu items on the left side. We reorganised the menu to match how you actually work:

- Looking for invoices? → **Finance**
- Managing your staff? → **People**
- Posting to social media? → **Publishing**
- Chatting with clients? → **Inbox**
- Running client projects? → **Work**

If you can't find something, use the **"Where did X go?"** quick reference card attached to this email. You can also search for any feature using the global search bar (`Ctrl + K`).

**Looking for a sub-section?** Click the section in the menu, then pick its **tab at the top of the page** (e.g. click *Clients*, then the *Companies* tab). Sub-sections now live as tabs on each page instead of the menu.

Questions? Reply to this message.

---

## 3. Quick-reference card (spec §13 — corrected to the real sidebar)

> For support / help desk. Every "go to" points at a menu item that exists today.

| If someone asks where to find... | Tell them to go to... | Previous location |
|---|---|---|
| Dashboard / home screen | **Home** | "Dashboard" was in the main menu |
| Invoices | Finance → Invoices | Was under Administration |
| Ledger / Transactions | Finance → Transactions | Was "Ledger" under Administration |
| Subscriptions | Finance → Subscriptions | Was duplicated in Administration AND Finance Tools |
| Leads | Sales → Leads | Was under CRM Tools |
| CRM Pipeline | Sales → Pipeline | Was under CRM Tools |
| Import leads (bulk upload) | Sales → Import Leads | Was "Bulk Lead Import" under Administration |
| Company / Client list | Clients → Companies | Was "CRM Companies" under CRM Tools |
| Contacts | Clients → Contacts | Was "CRM Contacts" under CRM Tools |
| Client calendar | Clients → Client Calendar | Was "CRM Calendar" under CRM Tools |
| Client insights / CRM reports | Clients → Client Insights | Was "CRM Reports" under CRM Tools |
| Client settings / CRM config | Settings → Client Settings | Was "CRM Configuration" under CRM Tools |
| Projects | Work → Projects | Was under Project Delivery |
| Tasks | Work → Tasks | Was under Project Delivery |
| Service Requests / Tickets | Work → Requests | Was "Service Requests" under Core Operations |
| Timesheet | Work → Time Tracking | Was "Timesheet" under Core Operations |
| Scheduled Jobs | Work → Scheduled Work | Was "Scheduled Jobs" under Core Operations |
| Creative / Content Studio | Content → Content Studio | Was "Creative Studio" under AI & Marketing |
| Content Calendar | Content → Content Calendar | Was under AI & Marketing |
| WhatsApp / Instagram / Messenger | Inbox → WhatsApp / Instagram / Messenger | Was under Meta Omnichannel |
| All client conversations | Inbox → Meta Messages | Was "Meta Inbox" under CRM Tools |
| Notifications | Inbox → Notifications | Was under Communication |
| Activity feed | Inbox → Activity Feed | Was "Timeline" under Communication |
| Daily updates (EOD) | Inbox → Daily Updates | Was "Daily EOD" under Communication |
| AI reply drafts | Inbox → AI Replies | Was "AI Reply Drafts" under Meta Omnichannel |
| Human approval queue | Inbox → Approval Queue | Was "Human Approval Queue" under Meta Omnichannel |
| AI tools / AI writer | AI Workspace → AI Assistant | Was "AI Command Center" under AI & Marketing |
| AI marketing assistant | AI Workspace → AI Content Assistant | Was "Marketing Assistant" under AI & Marketing |
| Employees / Staff list | People → Employees | Was "Users" under People & Activity |
| My People / Team | People → My People | Was "My Team" under People & Activity |
| Departments | People → Departments | Was duplicated in People & Activity AND Administration |
| Attendance / Leave | People → Attendance / Leave Management | Was under People & Activity / Communication |
| Live attendance | People → Live Attendance | Was "Live Attendance" under People & Activity |
| Attendance reports | People → Attendance Reports | Was "Attendance Reports" under People & Activity |
| Company directory | People → Company Directory | Was "Company Directory" under Administration |
| Recruitment / Hiring | People → Hiring Dashboard | Was under HR Department |
| Job openings | People → Job Openings | Was "Jobs" under HR Department |
| Applications | People → Applications | Was "Inbox" under HR Department |
| Candidates / Interviews | People → Candidates / Interviews | Was under HR Department |
| Resume pool | People → Talent Pool | Was "Resume Pool" under HR Department |
| Hiring reports | People → Hiring Reports | Was "Reports" under HR Department |
| User permissions / Roles | Settings → Roles & Permissions | Was "Admin Permissions" under Administration |
| Automation / Workflows | Settings → Automation Rules | Was "Workflows" under Administration |
| Audit log | Settings → Activity Logs | Was "Audit Log" under Administration |
| Connected social accounts | Settings → Connected Accounts | Was "Identity Linking" under Meta Omnichannel |
| Google Workspace | Settings → Google Workspace | Was under Communication |
| System settings | Settings → System Settings | Was "Settings" under Administration |
| Publishing centre | Publishing → Publishing Centre | Was "Meta Command Center" under Meta Omnichannel |
| Connected social media accounts | Publishing → Social Accounts | Was "Customer Meta Connect" under Meta Omnichannel |
| Publishing analytics | Publishing → Publishing Analytics | Was "Omnichannel Analytics" under Meta Omnichannel |
| Platform integrations | Publishing → Integrations | Was "Partner Readiness" under Meta Omnichannel |
| Workspace reports | Insights → Workspace Reports | Was under Reports |
| Sales reports | Insights → Sales Reports | Was scattered across CRM Reports |

> **Note (tab sub-nav, v3.1):** the sidebar now shows only the 12 sections. Clicking a section
> opens its landing page (`/sections/:key`), and the section's sub-pages render as Chrome-style
> **tabs at the top of each page** instead of menu sub-items. Favorites and Inbox unread counts
> live on the tabs too. Every destination in this card is still reachable — via a section tab.
>
> Items intentionally **not** in the new sidebar (no page exists yet — Phase 0 hide decision):
> Proposals, Quotations, Contracts, Follow Ups, Won/Lost, Deals (Sales); Documents, Notes,
> Client Communication (Clients); Campaigns, Scripts, Graphics, Videos, Brand Kit, Media Library,
> Content Approvals (Content); Publishing Queue, Scheduled Posts (Publishing); AI Writer,
> AI Reply Generator (AI Workspace); Payments, Expenses (Finance); Business Overview, Marketing,
> Project, Finance, People Reports (Insights). If a user asks about these, tell them the page is
> planned and not yet in the menu.

---

## 4. Post-launch metrics (spec §14)

Measure **before** launch as baseline, then at **4 weeks** and **8 weeks**.

| Metric | How to measure | Target |
|---|---|---|
| Clicks to find an invoice | Time a real user: Finance → Invoices | Max 2 clicks (was 4+ via Administration) |
| Clicks to find leads | Time a real user: Sales → Leads | Max 2 clicks (was 3 via CRM Tools) |
| Onboarding time for new staff | Time from first login to first completed task | −30% |
| Support tickets about "can't find X" | Count navigation-related help requests | −50% within 4 weeks |
| Daily Active Users | Analytics dashboard | +15% within 8 weeks |
| Finance section adoption | Users accessing Finance vs Administration | All finance users shift to Finance |
| Duplicate-confusion tickets | Tickets about Departments/Subscriptions appearing twice | Zero after launch |

---

*SynTask v3.0 Navigation Redesign · Launch Kit · Companion to the phase implementation plan and product spec.*
