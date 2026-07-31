# SynTask v3.0 — Navigation Redesign Implementation Plan
### Codex-Ready · Written for Non-Technical Teams · Direct Developer Handoff

---

## The One Rule That Governs Everything

> **We are NOT changing any feature, page, or functionality. We are ONLY changing where things appear in the left sidebar menu — organised around how agency teams actually work, not around internal software department names.**

If a developer asks "does this break anything?" — the answer is **NO**, because:

- All existing routes (URLs) stay exactly the same
- All existing permissions and roles stay exactly the same
- All existing data, forms, and logic stay exactly the same
- Only the sidebar labels and groupings change

---

## Table of Contents

1. [Problem Analysis — What the Screenshots Reveal](#1-problem-analysis)
2. [New Sidebar Structure — Exact Specification](#2-new-sidebar-structure)
3. [Critical Naming Decision](#3-critical-naming-decision)
4. [Complete Before → After Mapping](#4-complete-before--after-mapping)
5. [Screen-by-Screen Analysis](#5-screen-by-screen-analysis)
6. [Duplicate Removal — Exact Instructions](#6-duplicate-removal)
7. [Codex Implementation Prompt](#7-codex-implementation-prompt)
8. [Sub-Menu Structure for Each Section](#8-sub-menu-structure)
9. [Role-Based Visibility Rules](#9-role-based-visibility-rules)
10. [Sidebar UI Behaviour Specifications](#10-sidebar-ui-behaviour)
11. [Testing Checklist for QA](#11-testing-checklist)
12. [User Communication — Launch Day](#12-user-communication)
13. [Quick Reference Card](#13-quick-reference-card)
14. [Success Metrics](#14-success-metrics)
15. [Document Ownership and Next Steps](#15-next-steps)

---

## 1. Problem Analysis

The uploaded screenshots show 5 working screens. Comparing these against the current sidebar reveals the following confirmed issues that must be fixed before anything else.

### Issue 1 — "Team" Appears Twice

In the current sidebar, "Team" appears as:

- **"Team"** — under the main navigation (People & Activity group)
- **"Your Departments"** — also people-related, listed separately below

This confuses non-technical users because both sections manage people. Under the new structure, all people-related items must be unified under ONE section called **"People"** — not "Team". The word "Team" is used colloquially to mean both the whole company and a sub-group, causing ambiguity. "People" is unambiguous.

### Issue 2 — Finance Data Hidden in Administration

Invoices and Ledger are currently buried inside the "Administration" group. Non-technical users — especially agency finance staff — look for invoices under billing or finance, not admin. This must be resolved by moving all financial items to the Finance section.

### Issue 3 — "Departments" Appears Twice

The word "Departments" currently appears in both "People & Activity" AND "Administration" — pointing to the same `/departments` route. A non-technical user clicking both finds identical screens and is confused. This must be deduplicated to one entry only.

### Issue 4 — Technical Label Names in the Sidebar

The current sidebar shows labels like "Core Operations", "Meta Omnichannel", "CRM Tools", "Project Delivery". These are developer-invented category names. A social media manager or account manager does not know what "Core Operations" means. Every label must use plain business English.

### Issue 5 — Communication is Fragmented

WhatsApp, Instagram, Messenger, and Email notifications currently live in separate locations. The Inbox screenshot confirms these should be unified. All communication channels must be merged into one Inbox section.

---

## 2. New Sidebar Structure

> **This is the EXACT structure to implement. Every item listed here must appear in the sidebar in this order. Nothing else. No additional items. No rearrangement.**

| # | Icon | Sidebar Label | What It Contains | Who Uses It Daily |
|---|------|---------------|-----------------|-------------------|
| 1 | 🏠 | **Home** | Dashboard, today's tasks, calendar, AI briefing, recent activity, notifications | Everyone — first screen on login |
| 2 | 💼 | **Sales** | Leads, pipeline, deals, proposals, quotations, contracts, follow-ups, won/lost | Sales team, account managers |
| 3 | 👥 | **Clients** | Client list, company profiles, contacts, documents, notes, client calendar, client chat history | Account managers, client-facing staff |
| 4 | 📂 | **Work** | Projects, tasks, service requests, scheduled work, time tracking | Project managers, operations team |
| 5 | 🎨 | **Content** | Campaigns, content calendar, scripts, graphics, videos, brand kit, media library, content approvals | Content creators, designers, social media managers |
| 6 | 📢 | **Publishing** | Publishing queue, scheduled posts, connected social accounts, publishing analytics, platform integrations | Social media managers, publishing team |
| 7 | 💬 | **Inbox** | WhatsApp (45), Instagram (32), Messenger (18), Email (20), Notifications, AI Replies, Approval Queue | Everyone who communicates externally |
| 8 | 🤖 | **AI Workspace** | AI assistant, AI writer, AI marketing assistant, AI reply generator | Content team, anyone using AI tools |
| 9 | 👨‍💼 | **People** | Employees, attendance, leave management, recruitment/hiring, candidates, interviews, departments | HR staff, managers — **NOT called "Team"** |
| 10 | 💰 | **Finance** | Invoices, transactions, subscriptions, payments, expenses, ledger | Finance staff, directors |
| 11 | 📊 | **Insights** | Business overview, sales reports, marketing reports, project reports, finance reports, team reports | Executives, team leads |
| 12 | ⚙️ | **Settings** | Organisation profile, roles, permissions, automation rules, integrations, audit logs, system config | Admin only — no operational features here |

---

## 3. Critical Naming Decision

> ⚠️ **The 9th section is named "People" — NOT "Team".**

**Reason:** In the current screenshots, "Team" already appears as a navigation label. If the people management section is also called "Team", non-technical users cannot tell which "Team" menu they need. "People" is unambiguous — it clearly means "manage the humans in our organisation."

The word "Team" can be used **inside** this section for sub-groups (e.g. "Marketing Team", "Design Team"), but the **sidebar label must say "People"**.

---

## 4. Complete Before → After Mapping

> Give this table to Codex as the authoritative source of truth. Every single current menu item is mapped to its new location.

| Current Group | Current Item Name | Current Route | New Section | New Display Name |
|---------------|------------------|---------------|-------------|-----------------|
| Core Operations | Service Requests | `/tickets` | Work | Requests |
| Core Operations | Workspace Calendar | `/calendar` | Home | Calendar (in Home) |
| Core Operations | Scheduled Jobs | `/scheduled-jobs` | Work | Scheduled Work |
| Core Operations | Timesheet | `/timesheet` | Work | Time Tracking |
| Project Delivery | Projects | `/projects` | Work | Projects |
| Project Delivery | Tasks | `/tasks` | Work | Tasks |
| Client Management | Clients | `/clients` | Clients | Clients |
| Client Management | Client Workspace | `/clients/:id/workspace` | Clients | Client Workspace |
| People & Activity | My Team | `/team` | People | My People |
| People & Activity | Users | `/users` | People | Employees |
| People & Activity | Departments | `/departments` | People | Departments ← ONE ENTRY ONLY |
| People & Activity | Attendance | `/attendance` | People | Attendance |
| People & Activity | Live Attendance | `/attendance/live` | People | Live Attendance |
| People & Activity | Attendance Reports | `/attendance/reports` | People | Attendance Reports |
| Communication | Notifications | `/notifications` | Inbox | Notifications |
| Communication | Timeline | `/timeline` | Inbox | Activity Feed |
| Communication | Leaves | `/leaves` | People | Leave Management |
| Communication | Daily EOD | `/eod` | Inbox | Daily Updates |
| Communication | Google Workspace | `/google-workspace` | Settings | Google Workspace |
| CRM Tools | CRM Pipeline | `/crm/pipeline` | Sales | Pipeline |
| CRM Tools | Leads | `/crm/leads` | Sales | Leads |
| CRM Tools | CRM Companies | `/crm/companies` | Clients | Companies |
| CRM Tools | CRM Contacts | `/crm/contacts` | Clients | Contacts |
| CRM Tools | Meta Inbox | `/crm/meta-inbox` | Inbox | Meta Messages |
| CRM Tools | CRM Calendar | `/crm/calendar` | Clients | Client Calendar |
| CRM Tools | CRM Reports | `/crm/reports` | Clients | Client Insights |
| CRM Tools | CRM Configuration | `/crm/settings` | Settings | Client Settings |
| Meta Omnichannel | Meta Command Center | `/meta/command` | Publishing | Publishing Centre |
| Meta Omnichannel | WhatsApp | `/meta/whatsapp` | Inbox | WhatsApp |
| Meta Omnichannel | Instagram | `/meta/instagram` | Inbox | Instagram |
| Meta Omnichannel | Messenger | `/meta/messenger` | Inbox | Messenger |
| Meta Omnichannel | AI Reply Drafts | `/meta/ai-replies` | Inbox | AI Replies |
| Meta Omnichannel | Human Approval Queue | `/meta/approvals` | Inbox | Approval Queue |
| Meta Omnichannel | Identity Linking | `/meta/identity` | Settings | Connected Accounts |
| Meta Omnichannel | Omnichannel Analytics | `/meta/analytics` | Publishing | Publishing Analytics |
| Meta Omnichannel | Partner Readiness | `/meta/partner` | Publishing | Integrations |
| Meta Omnichannel | Customer Meta Connect | `/meta/connect` | Publishing | Social Accounts |
| HR Department | Recruitment Dashboard | `/hr/recruitment` | People | Hiring Dashboard |
| HR Department | Jobs | `/hr/jobs` | People | Job Openings |
| HR Department | Inbox (HR) | `/hr/inbox` | People | Applications |
| HR Department | Candidates | `/hr/candidates` | People | Candidates |
| HR Department | Employees (HR) | `/hr/employees` | People | Employees (merged) |
| HR Department | Resume Pool | `/hr/resume-pool` | People | Talent Pool |
| HR Department | Interviews | `/hr/interviews` | People | Interviews |
| HR Department | Reports (HR) | `/hr/reports` | People | Hiring Reports |
| AI & Marketing | AI Command Center | `/ai` | AI Workspace | AI Assistant |
| AI & Marketing | Creative Studio | `/creative` | Content | Content Studio |
| AI & Marketing | Marketing Assistant | `/ai/marketing` | AI Workspace | AI Content Assistant |
| AI & Marketing | Content Calendar | `/content/calendar` | Content | Content Calendar |
| Finance Tools | Subscriptions | `/subscriptions` | Finance | Subscriptions ← ONE ENTRY ONLY |
| Administration | Users | `/admin/users` | People | Employees (merged — remove duplicate) |
| Administration | Departments | `/departments` | **REMOVE** | Duplicate — already in People |
| Administration | Admin Permissions | `/admin/permissions` | Settings | Roles & Permissions |
| Administration | Workflows | `/admin/workflows` | Settings | Automation Rules |
| Administration | Company Directory | `/admin/directory` | People | Company Directory |
| Administration | Bulk Lead Import | `/admin/import` | Sales | Import Leads |
| Administration | Audit Log | `/admin/audit` | Settings | Activity Logs |
| Administration | Settings | `/admin/settings` | Settings | System Settings |
| Administration | Subscriptions | `/subscriptions` | **REMOVE** | Duplicate — already in Finance |
| Administration | Ledger | `/ledger` | Finance | Transactions |
| Administration | Invoices | `/invoices` | Finance | Invoices |
| Your Departments | (Dynamic org departments) | (dynamic) | People | Under Departments sub-menu |

---

## 5. Screen-by-Screen Analysis

The uploaded image shows 5 real SynTask screens. Below is the analysis of each and what must be preserved or adjusted.

### Screen 1 — Home Dashboard

**What is shown:**
- Stat cards: Projects in Progress (18), Tasks Due Today (24), Pending Approvals (07), Revenue This Month (₹8,45,230)
- Today's Schedule: 4 meetings with Join/View buttons
- Tasks Due Today: list with priority tags (High, Medium, Low)
- Recent Activity feed
- AI Briefing card with 3 AI-generated insights and "Ask AI Assistant" CTA

**Implementation instruction for Codex:**
- Keep this screen 100% as-is — layout, data, and components are correct
- Only change: sidebar must show "Home" as selected, with the 12-item structure defined in Section 2
- The stat cards, schedule, and AI briefing are the correct design pattern — replicate this card-based layout across all main section landing pages

---

### Screen 2 — Clients Page

**What is shown:**
- Breadcrumb: Dashboard → Clients
- Tab bar: All Clients | Active | Inactive | Prospects
- Table columns: Client/Company, Primary Contact, Projects (count), Status badge, Last Activity
- "+ Add Client" button top right
- Status badges: Active (green), Prospect (blue/outline), Inactive (red)

**Implementation instruction for Codex:**
- Keep this screen 100% as-is
- Breadcrumb should update to: **Home → Clients** (not Dashboard → Clients)
- The "Contacts" and "Companies" items from CRM Tools must now appear as sub-items within this Clients section:
  - Clients → Companies (was CRM Companies)
  - Clients → Contacts (was CRM Contacts)
  - Clients → Client Calendar (was CRM Calendar)
  - Clients → Client Insights (was CRM Reports)

---

### Screen 3 — Work → Projects (Kanban Board)

**What is shown:**
- Breadcrumb: Dashboard → Work → Projects
- View toggle: Board | List | Timeline | Calendar
- 4 kanban columns: Planning (3), In Progress (3), Review (2), Completed (4)
- "+ New Project" button with Filter and Group by controls
- Project cards show: client name tag, progress bar, team avatar stack

**Implementation instruction for Codex:**
- Breadcrumb updates to: **Home → Work → Projects**
- "Work" section in sidebar must contain these sub-items in this order:
  - Projects (this screen)
  - Tasks
  - Requests (was Service Requests)
  - Scheduled Work (was Scheduled Jobs)
  - Time Tracking (was Timesheet)
- The kanban layout, card design, and column structure shown is the correct target — keep exactly as shown

---

### Screen 4 — Content Calendar

**What is shown:**
- Breadcrumb: Dashboard → Content → Content Calendar
- Month/Week/Today toggle, month navigation arrows
- Calendar grid: July 2024, showing scheduled posts per day
- Each post card shows: time, platform icon (IG, FB, YouTube, Twitter), post type label
- Left panel: Filters for Campaign, Platform, Status
- Legend at bottom: Draft | Scheduled | In Review | Approved | Published
- "+ Create Content" button top right

**Implementation instruction for Codex:**
- Breadcrumb updates to: **Home → Content → Content Calendar**
- "Content" section in sidebar must contain these sub-items:
  - Campaigns
  - Content Calendar (this screen)
  - Content Studio (was Creative Studio)
  - Media Library
  - Brand Kit
  - Content Approvals

---

### Screen 5 — Inbox

**What is shown:**
- Left panel: Channels list — All Messages (129), WhatsApp (45), Instagram (32), Messenger (18), Email (20), Notifications (13), AI Replies (9), Approval Queue (5)
- Centre: Conversation list with contact names, previews, timestamps
- Right panel: Full chat thread with message bubbles, link previews, timestamps
- Tabs: All | Unread | Assigned | Mentions | Sort

**Implementation instruction for Codex:**
- This screen is the correct target implementation for the Inbox section
- The channel list in the left panel maps directly to Inbox sub-items:
  - All Messages → default Inbox landing
  - WhatsApp → `/meta/whatsapp`
  - Instagram → `/meta/instagram`
  - Messenger → `/meta/messenger`
  - Email → `/email`
  - Notifications → `/notifications`
  - AI Replies → `/meta/ai-replies`
  - Approval Queue → `/meta/approvals`
- The badge numbers (45, 32, 18 etc.) are real unread counts — keep this pattern

---

## 6. Duplicate Removal

> ⚠️ **These 3 duplicates must be resolved before any other changes. They are the highest-priority fixes.**

### Duplicate 1 — "Departments"

Currently appears in: People & Activity group AND Administration group (same `/departments` route)

- **Action:** Remove the Departments entry from Administration completely
- **Keep:** One single "Departments" entry under People → sub-items
- **Route stays:** `/departments` (unchanged)

### Duplicate 2 — "Subscriptions"

Currently appears in: Finance Tools group AND Administration group

- **Action:** Remove the Subscriptions entry from Administration completely
- **Keep:** One single "Subscriptions" entry under Finance section
- **Route stays:** `/subscriptions` (unchanged)

### Duplicate 3 — "Users / Employees"

Currently appears as "Users" in People & Activity AND "Users" in Administration — both pointing to user management

- **Action:** Remove the Users entry from Administration completely
- **Keep:** Under People section, rename to "Employees"
- **Consolidate** with HR Employees (`/hr/employees`) so there is ONE employees list, not two

---

## 7. Codex Implementation Prompt

> Copy the text below and paste it directly into Codex, Cursor, or any AI coding assistant. It contains everything the developer needs.

---

```
Task: Restructure the sidebar navigation in SynTask (frontend/src/components/Sidebar.jsx)

RULES:
1. Do NOT change any route (URL path). All existing routes stay exactly the same.
2. Do NOT change any permissions, roles, or access control logic.
3. Do NOT change any page component, form, data, or business logic.
4. Only change: the navigationGroups array in Sidebar.jsx — labels, grouping, order, and icons.
5. Remove ALL duplicate entries:
   - Departments must appear once (in People)
   - Subscriptions must appear once (in Finance)
   - Users/Employees must appear once (in People)

NEW SIDEBAR STRUCTURE (implement in this exact order):
1. Home
2. Sales
3. Clients
4. Work
5. Content
6. Publishing
7. Inbox
8. AI Workspace
9. People  ← NOT "Team"
10. Finance
11. Insights
12. Settings

For every item's new home and new display name, refer to the mapping table in Section 4 of the implementation plan. The mapping table is the ground truth.

Items to REMOVE entirely (duplicates):
- Departments entry under Administration (keep only in People)
- Subscriptions entry under Administration (keep only in Finance)
- Users entry under Administration (merged into Employees under People)

Breadcrumbs: Update all breadcrumbs to start with "Home" not "Dashboard".
Format: Home → [Section] → [Page Name]
```

---

## 8. Sub-Menu Structure

Every top-level section must expand to show these exact sub-items when clicked.

### 🏠 Home
Opens directly — no sub-menu. This is the default landing page.

### 💼 Sales
- Leads
- Pipeline
- Deals
- Meetings
- Proposals
- Quotations
- Contracts
- Follow Ups
- Won / Lost
- Import Leads *(was Bulk Lead Import under Administration)*

### 👥 Clients
- All Clients
- Companies *(was CRM Companies)*
- Contacts *(was CRM Contacts)*
- Documents
- Notes
- Client Calendar *(was CRM Calendar)*
- Client Communication
- Client Insights *(was CRM Reports)*
- Client Settings *(was CRM Configuration)*

### 📂 Work
- Projects
- Tasks
- Requests *(was Service Requests)*
- Scheduled Work *(was Scheduled Jobs)*
- Time Tracking *(was Timesheet)*

### 🎨 Content
- Campaigns
- Content Calendar
- Content Studio *(was Creative Studio)*
- Scripts
- Graphics
- Videos
- Brand Kit
- Media Library
- Content Approvals

### 📢 Publishing
- Publishing Centre *(was Meta Command Center)*
- Social Accounts *(was Customer Meta Connect)*
- Publishing Queue
- Scheduled Posts
- Publishing Analytics *(was Omnichannel Analytics)*
- Integrations *(was Partner Readiness)*

### 💬 Inbox
- All Messages *(with total unread badge)*
- WhatsApp *(badge: 45)*
- Instagram *(badge: 32)*
- Messenger *(badge: 18)*
- Email *(badge: 20)*
- Notifications *(badge: 13)*
- Activity Feed *(was Timeline)*
- Daily Updates *(was Daily EOD)*
- AI Replies *(badge: 9)*
- Approval Queue *(badge: 5)*

### 🤖 AI Workspace
- AI Assistant
- AI Writer
- AI Content Assistant *(was Marketing Assistant)*
- AI Reply Generator

### 👨‍💼 People *(NOT "Team")*
- Employees *(merged: was Users in People & Activity + Employees in HR)*
- Attendance
- Live Attendance
- Leave Management *(was Leaves under Communication)*
- Departments *(one entry only — remove from Settings/Admin)*
- Company Directory
- Hiring Dashboard *(was Recruitment Dashboard)*
- Job Openings *(was Jobs)*
- Applications *(was Inbox under HR)*
- Candidates
- Talent Pool *(was Resume Pool)*
- Interviews
- Hiring Reports

### 💰 Finance
- Invoices *(moved from Administration)*
- Transactions *(was Ledger under Administration)*
- Subscriptions *(one entry only — remove from Administration)*
- Payments
- Expenses

### 📊 Insights
- Business Overview
- Sales Reports
- Marketing Reports
- Project Reports
- Finance Reports
- People Reports *(was Team Reports)*

### ⚙️ Settings
- Organisation
- Roles & Permissions *(was Admin Permissions)*
- Automation Rules *(was Workflows)*
- Connected Accounts *(was Identity Linking)*
- Google Workspace
- Activity Logs *(was Audit Log)*
- System Settings
- Client Settings *(was CRM Configuration)*

> **Settings must contain ZERO financial or operational features. No invoices, no subscriptions, no employee lists here.**

---

## 9. Role-Based Visibility Rules

The sidebar must show different items based on the logged-in user's role. No logic changes — only what appears in the new sidebar groups.

| Role | Sections Visible | Sections Hidden |
|------|-----------------|-----------------|
| Super Admin | All 12 sections | Nothing hidden |
| Admin | All 12 sections | Nothing hidden |
| Manager / Team Lead | Home, Sales, Clients, Work, Content, Publishing, Inbox, AI Workspace, People (limited), Finance (limited), Insights | Settings hidden |
| Sales Executive | Home, Sales, Clients, Inbox, AI Workspace, Insights (sales only) | Work, Content, Publishing, People, Finance, Settings |
| Social Media Manager | Home, Clients (view only), Work (tasks only), Content, Publishing, Inbox, AI Workspace | Sales, People, Finance, Settings |
| Content Creator | Home, Work (tasks only), Content, Inbox, AI Workspace | Sales, Clients, Publishing, People, Finance, Insights, Settings |
| HR Executive | Home, People, Inbox, Insights (team only) | Sales, Clients, Work, Content, Publishing, AI Workspace, Finance, Settings |
| Finance Executive | Home, Finance, Insights (finance only) | Sales, Clients, Work, Content, Publishing, Inbox, AI Workspace, People, Settings |
| Employee | Home, Work (own tasks only), Inbox (own messages only) | All other sections |

---

## 10. Sidebar UI Behaviour

### 10.1 — Default Expanded / Collapsed State

- On first load after the update: all sections are collapsed except Home (which opens directly)
- When a user navigates to a page: the parent section auto-expands to show the current page highlighted
- User's collapsed/expanded preferences are saved in localStorage per user session
- **CRITICAL:** Reset sidebar stored state on deploy — old collapsed states from the previous navigation will cause the wrong sections to open on first load

### 10.2 — Active State Highlighting

- Current page: purple background `#5B4FE8`, white text
- Parent section when a child is active: section label stays visible with a light highlight (not full purple)
- Hover state: light purple background `#EEF0FF` on any item

### 10.3 — Badge Counts (Inbox Only)

- Inbox top-level item: shows total unread count as a badge (e.g. "129" as seen in screenshots)
- Each Inbox sub-item: shows its own channel count (WhatsApp: 45, Instagram: 32, etc.)
- Badge style: small rounded rectangle, purple background, white text, right-aligned in the menu item
- Counts update in real-time without page refresh

### 10.4 — Icons

Use these icons for each top-level section (from the existing icon library already in the project):

| Section | Icon |
|---------|------|
| Home | `HomeIcon` |
| Sales | `BriefcaseIcon` |
| Clients | `UsersIcon` |
| Work | `FolderIcon` |
| Content | `PaintBrushIcon` |
| Publishing | `MegaphoneIcon` |
| Inbox | `ChatBubbleIcon` |
| AI Workspace | `SparklesIcon` |
| People | `UserGroupIcon` |
| Finance | `CurrencyRupeeIcon` |
| Insights | `ChartBarIcon` |
| Settings | `CogIcon` |

### 10.5 — Breadcrumb Update

- All breadcrumbs must start with "Home" not "Dashboard"
- Format: `Home → [Section] → [Page Name]`
- Examples:
  - `Home → Work → Projects`
  - `Home → Clients → Client Insights`
  - `Home → Finance → Invoices`

---

## 11. Testing Checklist

> A non-technical team member must personally complete every item on this checklist before releasing to users.

| # | Test | Expected Result | Pass / Fail |
|---|------|----------------|-------------|
| 1 | Click "Home" in the sidebar | Dashboard loads. Today's tasks, calendar, AI briefing all visible | |
| 2 | Click "Sales" → "Leads" | Lead list page loads. No "CRM" label visible anywhere | |
| 3 | Click "Clients" → "Companies" | Companies list loads. Was previously under "CRM Tools → CRM Companies" | |
| 4 | Click "Work" → "Projects" | Kanban board loads. Planning / In Progress / Review / Completed columns visible | |
| 5 | Click "Content" → "Content Calendar" | Content calendar loads showing scheduled posts by day | |
| 6 | Click "Publishing" → "Publishing Centre" | Publishing management loads. Was previously "Meta Command Center" | |
| 7 | Click "Inbox" → "WhatsApp" | WhatsApp messages load. Unread count matches badge number | |
| 8 | Click "AI Workspace" | AI tools section loads. Not buried under another section | |
| 9 | Click "People" | People section expands. Label says "People" NOT "Team" | |
| 10 | Click "People" → "Departments" | Departments page loads. Confirm "Departments" does NOT appear anywhere else in the sidebar | |
| 11 | Click "Finance" → "Invoices" | Invoices page loads. Was previously under "Administration" | |
| 12 | Click "Finance" → "Subscriptions" | Subscriptions page loads. Confirm "Subscriptions" does NOT appear anywhere else | |
| 13 | Click "Finance" → "Transactions" | Transactions page loads. Was previously "Ledger" under "Administration" | |
| 14 | Click "Settings" | Settings expands. Confirm: NO invoices, NO subscriptions, NO employee list here | |
| 15 | Count total sidebar items | Exactly 12 top-level sections. No more. No less. | |
| 16 | Log in as a Social Media Manager role | Settings, Finance, Sales sections are NOT visible | |
| 17 | Log in as an Employee role | Only Home, Work (own tasks), and Inbox visible | |
| 18 | Time: navigate to Leads | Takes 2 clicks: Sales → Leads. Maximum 3 clicks from Home. | |
| 19 | Time: find an invoice | Takes 2 clicks: Finance → Invoices. Maximum 3 clicks from Home. | |
| 20 | Refresh the page mid-navigation | Page reloads on the same page. Sidebar shows the correct section expanded. | |

---

## 12. User Communication

> Send this message to all SynTask users on launch day. Use exactly this language — no technical terms.

---

**Subject: SynTask has a new menu — everything is still here, just easier to find**

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

Questions? Reply to this message.

---

## 13. Quick Reference Card

> Print or pin this for the support / help desk team. This is the most frequently needed document on launch day.

| If someone asks where to find... | Tell them to go to... | Previous location |
|----------------------------------|----------------------|-------------------|
| Invoices | Finance → Invoices | Was under Administration |
| Ledger / Transactions | Finance → Transactions | Was "Ledger" under Administration |
| Subscriptions | Finance → Subscriptions | Was duplicated in Administration AND Finance Tools |
| Leads | Sales → Leads | Was under CRM Tools |
| CRM Pipeline | Sales → Pipeline | Was under CRM Tools |
| Proposals / Quotations | Sales → Proposals or Quotations | Was under CRM Tools |
| Company / Client list | Clients → Companies | Was "CRM Companies" under CRM Tools |
| Contacts | Clients → Contacts | Was "CRM Contacts" under CRM Tools |
| Projects | Work → Projects | Was under Project Delivery |
| Tasks | Work → Tasks | Was under Project Delivery |
| Service Requests / Tickets | Work → Requests | Was "Service Requests" under Core Operations |
| Timesheet | Work → Time Tracking | Was "Timesheet" under Core Operations |
| Scheduled Jobs | Work → Scheduled Work | Was "Scheduled Jobs" under Core Operations |
| Creative / Content Studio | Content → Content Studio | Was "Creative Studio" under AI & Marketing |
| Content Calendar | Content → Content Calendar | Was under AI & Marketing |
| WhatsApp / Instagram / Messenger | Inbox → WhatsApp / Instagram / Messenger | Was under Meta Omnichannel |
| Email messages | Inbox → Email | Was scattered across Communication |
| Approval Queue | Inbox → Approval Queue | Was "Human Approval Queue" under Meta Omnichannel |
| AI tools / AI writer | AI Workspace | Was under AI & Marketing |
| Employees / Staff list | People → Employees | Was "Users" under People & Activity |
| Departments | People → Departments | Was duplicated in People & Activity AND Administration |
| Attendance / Leave | People → Attendance / Leave Management | Was under People & Activity / Communication |
| Recruitment / Hiring | People → Hiring Dashboard | Was under HR Department |
| Candidates / Interviews | People → Candidates or Interviews | Was under HR Department |
| User permissions / Roles | Settings → Roles & Permissions | Was "Admin Permissions" under Administration |
| Automation / Workflows | Settings → Automation Rules | Was "Workflows" under Administration |
| Audit Log | Settings → Activity Logs | Was "Audit Log" under Administration |
| Connected social accounts | Settings → Connected Accounts | Was "Identity Linking" under Meta Omnichannel |
| Sales reports | Insights → Sales Reports | Was scattered across CRM Reports |
| Business overview / Dashboard | Insights → Business Overview | Was on Dashboard / not clearly accessible |

---

## 14. Success Metrics

Measure these numbers **before launch** (as baseline) and again at **4 weeks** and **8 weeks** after launch.

| Metric | How to Measure | Target Improvement |
|--------|---------------|-------------------|
| Clicks to find an invoice | Time a real user: Finance → Invoices | Max 2 clicks (was 4+ via Administration) |
| Clicks to find leads | Time a real user: Sales → Leads | Max 2 clicks (was 3 via CRM Tools) |
| Onboarding time for new staff | Time from first login to completing first task | Reduce by 30% |
| Support tickets about "can't find X" | Count navigation-related help requests | Reduce by 50% within 4 weeks |
| Daily Active Users | Count from analytics dashboard | Increase by 15% within 8 weeks |
| Feature adoption — Finance section | Count users accessing Finance vs Administration | All finance users shift to Finance section |
| Duplicate confusion tickets | Count tickets about Departments or Subscriptions appearing twice | Zero after launch |

---

## 15. Next Steps

| Action | Owner | Deadline |
|--------|-------|----------|
| Review Section 2 (new structure) and sign off | Product Lead | Before dev starts |
| Resolve any naming disagreements (especially "People" vs alternatives) | Product + Design | Day 1 |
| Resolve the 3 duplicates listed in Section 6 | Developer | Day 2 — before any other work |
| Hand Section 4 mapping table to Codex / developer | Product Lead | Day 2 |
| Developer implements Sidebar.jsx changes | Developer / Codex | Week 2–3 |
| Product Lead runs Section 11 QA checklist personally | Product Lead | End of Week 3 |
| Reset all users' stored sidebar state (localStorage) before deploy | Developer | Deploy day |
| Prepare launch day email using Section 12 template | Product / Comms | Week 3 |
| Print / send Section 13 quick reference card to support team | Support Lead | Launch day |
| Measure baseline success metrics (Section 14) | Analytics / Product | Before launch |
| Measure post-launch success metrics | Analytics / Product | 4 weeks after launch |

---

*SynTask v3.0 Navigation Implementation Plan · Prepared for Non-Technical Teams · Version 1.0*# SynTask v3.0 — Navigation Redesign Implementation Plan
### Codex-Ready · Written for Non-Technical Teams · Direct Developer Handoff

---

## The One Rule That Governs Everything

> **We are NOT changing any feature, page, or functionality. We are ONLY changing where things appear in the left sidebar menu — organised around how agency teams actually work, not around internal software department names.**

If a developer asks "does this break anything?" — the answer is **NO**, because:

- All existing routes (URLs) stay exactly the same
- All existing permissions and roles stay exactly the same
- All existing data, forms, and logic stay exactly the same
- Only the sidebar labels and groupings change

---

## Table of Contents

1. [Problem Analysis — What the Screenshots Reveal](#1-problem-analysis)
2. [New Sidebar Structure — Exact Specification](#2-new-sidebar-structure)
3. [Critical Naming Decision](#3-critical-naming-decision)
4. [Complete Before → After Mapping](#4-complete-before--after-mapping)
5. [Screen-by-Screen Analysis](#5-screen-by-screen-analysis)
6. [Duplicate Removal — Exact Instructions](#6-duplicate-removal)
7. [Codex Implementation Prompt](#7-codex-implementation-prompt)
8. [Sub-Menu Structure for Each Section](#8-sub-menu-structure)
9. [Role-Based Visibility Rules](#9-role-based-visibility-rules)
10. [Sidebar UI Behaviour Specifications](#10-sidebar-ui-behaviour)
11. [Testing Checklist for QA](#11-testing-checklist)
12. [User Communication — Launch Day](#12-user-communication)
13. [Quick Reference Card](#13-quick-reference-card)
14. [Success Metrics](#14-success-metrics)
15. [Document Ownership and Next Steps](#15-next-steps)

---

## 1. Problem Analysis

The uploaded screenshots show 5 working screens. Comparing these against the current sidebar reveals the following confirmed issues that must be fixed before anything else.

### Issue 1 — "Team" Appears Twice

In the current sidebar, "Team" appears as:

- **"Team"** — under the main navigation (People & Activity group)
- **"Your Departments"** — also people-related, listed separately below

This confuses non-technical users because both sections manage people. Under the new structure, all people-related items must be unified under ONE section called **"People"** — not "Team". The word "Team" is used colloquially to mean both the whole company and a sub-group, causing ambiguity. "People" is unambiguous.

### Issue 2 — Finance Data Hidden in Administration

Invoices and Ledger are currently buried inside the "Administration" group. Non-technical users — especially agency finance staff — look for invoices under billing or finance, not admin. This must be resolved by moving all financial items to the Finance section.

### Issue 3 — "Departments" Appears Twice

The word "Departments" currently appears in both "People & Activity" AND "Administration" — pointing to the same `/departments` route. A non-technical user clicking both finds identical screens and is confused. This must be deduplicated to one entry only.

### Issue 4 — Technical Label Names in the Sidebar

The current sidebar shows labels like "Core Operations", "Meta Omnichannel", "CRM Tools", "Project Delivery". These are developer-invented category names. A social media manager or account manager does not know what "Core Operations" means. Every label must use plain business English.

### Issue 5 — Communication is Fragmented

WhatsApp, Instagram, Messenger, and Email notifications currently live in separate locations. The Inbox screenshot confirms these should be unified. All communication channels must be merged into one Inbox section.

---

## 2. New Sidebar Structure

> **This is the EXACT structure to implement. Every item listed here must appear in the sidebar in this order. Nothing else. No additional items. No rearrangement.**

| # | Icon | Sidebar Label | What It Contains | Who Uses It Daily |
|---|------|---------------|-----------------|-------------------|
| 1 | 🏠 | **Home** | Dashboard, today's tasks, calendar, AI briefing, recent activity, notifications | Everyone — first screen on login |
| 2 | 💼 | **Sales** | Leads, pipeline, deals, proposals, quotations, contracts, follow-ups, won/lost | Sales team, account managers |
| 3 | 👥 | **Clients** | Client list, company profiles, contacts, documents, notes, client calendar, client chat history | Account managers, client-facing staff |
| 4 | 📂 | **Work** | Projects, tasks, service requests, scheduled work, time tracking | Project managers, operations team |
| 5 | 🎨 | **Content** | Campaigns, content calendar, scripts, graphics, videos, brand kit, media library, content approvals | Content creators, designers, social media managers |
| 6 | 📢 | **Publishing** | Publishing queue, scheduled posts, connected social accounts, publishing analytics, platform integrations | Social media managers, publishing team |
| 7 | 💬 | **Inbox** | WhatsApp (45), Instagram (32), Messenger (18), Email (20), Notifications, AI Replies, Approval Queue | Everyone who communicates externally |
| 8 | 🤖 | **AI Workspace** | AI assistant, AI writer, AI marketing assistant, AI reply generator | Content team, anyone using AI tools |
| 9 | 👨‍💼 | **People** | Employees, attendance, leave management, recruitment/hiring, candidates, interviews, departments | HR staff, managers — **NOT called "Team"** |
| 10 | 💰 | **Finance** | Invoices, transactions, subscriptions, payments, expenses, ledger | Finance staff, directors |
| 11 | 📊 | **Insights** | Business overview, sales reports, marketing reports, project reports, finance reports, team reports | Executives, team leads |
| 12 | ⚙️ | **Settings** | Organisation profile, roles, permissions, automation rules, integrations, audit logs, system config | Admin only — no operational features here |

---

## 3. Critical Naming Decision

> ⚠️ **The 9th section is named "People" — NOT "Team".**

**Reason:** In the current screenshots, "Team" already appears as a navigation label. If the people management section is also called "Team", non-technical users cannot tell which "Team" menu they need. "People" is unambiguous — it clearly means "manage the humans in our organisation."

The word "Team" can be used **inside** this section for sub-groups (e.g. "Marketing Team", "Design Team"), but the **sidebar label must say "People"**.

---

## 4. Complete Before → After Mapping

> Give this table to Codex as the authoritative source of truth. Every single current menu item is mapped to its new location.

| Current Group | Current Item Name | Current Route | New Section | New Display Name |
|---------------|------------------|---------------|-------------|-----------------|
| Core Operations | Service Requests | `/tickets` | Work | Requests |
| Core Operations | Workspace Calendar | `/calendar` | Home | Calendar (in Home) |
| Core Operations | Scheduled Jobs | `/scheduled-jobs` | Work | Scheduled Work |
| Core Operations | Timesheet | `/timesheet` | Work | Time Tracking |
| Project Delivery | Projects | `/projects` | Work | Projects |
| Project Delivery | Tasks | `/tasks` | Work | Tasks |
| Client Management | Clients | `/clients` | Clients | Clients |
| Client Management | Client Workspace | `/clients/:id/workspace` | Clients | Client Workspace |
| People & Activity | My Team | `/team` | People | My People |
| People & Activity | Users | `/users` | People | Employees |
| People & Activity | Departments | `/departments` | People | Departments ← ONE ENTRY ONLY |
| People & Activity | Attendance | `/attendance` | People | Attendance |
| People & Activity | Live Attendance | `/attendance/live` | People | Live Attendance |
| People & Activity | Attendance Reports | `/attendance/reports` | People | Attendance Reports |
| Communication | Notifications | `/notifications` | Inbox | Notifications |
| Communication | Timeline | `/timeline` | Inbox | Activity Feed |
| Communication | Leaves | `/leaves` | People | Leave Management |
| Communication | Daily EOD | `/eod` | Inbox | Daily Updates |
| Communication | Google Workspace | `/google-workspace` | Settings | Google Workspace |
| CRM Tools | CRM Pipeline | `/crm/pipeline` | Sales | Pipeline |
| CRM Tools | Leads | `/crm/leads` | Sales | Leads |
| CRM Tools | CRM Companies | `/crm/companies` | Clients | Companies |
| CRM Tools | CRM Contacts | `/crm/contacts` | Clients | Contacts |
| CRM Tools | Meta Inbox | `/crm/meta-inbox` | Inbox | Meta Messages |
| CRM Tools | CRM Calendar | `/crm/calendar` | Clients | Client Calendar |
| CRM Tools | CRM Reports | `/crm/reports` | Clients | Client Insights |
| CRM Tools | CRM Configuration | `/crm/settings` | Settings | Client Settings |
| Meta Omnichannel | Meta Command Center | `/meta/command` | Publishing | Publishing Centre |
| Meta Omnichannel | WhatsApp | `/meta/whatsapp` | Inbox | WhatsApp |
| Meta Omnichannel | Instagram | `/meta/instagram` | Inbox | Instagram |
| Meta Omnichannel | Messenger | `/meta/messenger` | Inbox | Messenger |
| Meta Omnichannel | AI Reply Drafts | `/meta/ai-replies` | Inbox | AI Replies |
| Meta Omnichannel | Human Approval Queue | `/meta/approvals` | Inbox | Approval Queue |
| Meta Omnichannel | Identity Linking | `/meta/identity` | Settings | Connected Accounts |
| Meta Omnichannel | Omnichannel Analytics | `/meta/analytics` | Publishing | Publishing Analytics |
| Meta Omnichannel | Partner Readiness | `/meta/partner` | Publishing | Integrations |
| Meta Omnichannel | Customer Meta Connect | `/meta/connect` | Publishing | Social Accounts |
| HR Department | Recruitment Dashboard | `/hr/recruitment` | People | Hiring Dashboard |
| HR Department | Jobs | `/hr/jobs` | People | Job Openings |
| HR Department | Inbox (HR) | `/hr/inbox` | People | Applications |
| HR Department | Candidates | `/hr/candidates` | People | Candidates |
| HR Department | Employees (HR) | `/hr/employees` | People | Employees (merged) |
| HR Department | Resume Pool | `/hr/resume-pool` | People | Talent Pool |
| HR Department | Interviews | `/hr/interviews` | People | Interviews |
| HR Department | Reports (HR) | `/hr/reports` | People | Hiring Reports |
| AI & Marketing | AI Command Center | `/ai` | AI Workspace | AI Assistant |
| AI & Marketing | Creative Studio | `/creative` | Content | Content Studio |
| AI & Marketing | Marketing Assistant | `/ai/marketing` | AI Workspace | AI Content Assistant |
| AI & Marketing | Content Calendar | `/content/calendar` | Content | Content Calendar |
| Finance Tools | Subscriptions | `/subscriptions` | Finance | Subscriptions ← ONE ENTRY ONLY |
| Administration | Users | `/admin/users` | People | Employees (merged — remove duplicate) |
| Administration | Departments | `/departments` | **REMOVE** | Duplicate — already in People |
| Administration | Admin Permissions | `/admin/permissions` | Settings | Roles & Permissions |
| Administration | Workflows | `/admin/workflows` | Settings | Automation Rules |
| Administration | Company Directory | `/admin/directory` | People | Company Directory |
| Administration | Bulk Lead Import | `/admin/import` | Sales | Import Leads |
| Administration | Audit Log | `/admin/audit` | Settings | Activity Logs |
| Administration | Settings | `/admin/settings` | Settings | System Settings |
| Administration | Subscriptions | `/subscriptions` | **REMOVE** | Duplicate — already in Finance |
| Administration | Ledger | `/ledger` | Finance | Transactions |
| Administration | Invoices | `/invoices` | Finance | Invoices |
| Your Departments | (Dynamic org departments) | (dynamic) | People | Under Departments sub-menu |

---

## 5. Screen-by-Screen Analysis

The uploaded image shows 5 real SynTask screens. Below is the analysis of each and what must be preserved or adjusted.

### Screen 1 — Home Dashboard

**What is shown:**
- Stat cards: Projects in Progress (18), Tasks Due Today (24), Pending Approvals (07), Revenue This Month (₹8,45,230)
- Today's Schedule: 4 meetings with Join/View buttons
- Tasks Due Today: list with priority tags (High, Medium, Low)
- Recent Activity feed
- AI Briefing card with 3 AI-generated insights and "Ask AI Assistant" CTA

**Implementation instruction for Codex:**
- Keep this screen 100% as-is — layout, data, and components are correct
- Only change: sidebar must show "Home" as selected, with the 12-item structure defined in Section 2
- The stat cards, schedule, and AI briefing are the correct design pattern — replicate this card-based layout across all main section landing pages

---

### Screen 2 — Clients Page

**What is shown:**
- Breadcrumb: Dashboard → Clients
- Tab bar: All Clients | Active | Inactive | Prospects
- Table columns: Client/Company, Primary Contact, Projects (count), Status badge, Last Activity
- "+ Add Client" button top right
- Status badges: Active (green), Prospect (blue/outline), Inactive (red)

**Implementation instruction for Codex:**
- Keep this screen 100% as-is
- Breadcrumb should update to: **Home → Clients** (not Dashboard → Clients)
- The "Contacts" and "Companies" items from CRM Tools must now appear as sub-items within this Clients section:
  - Clients → Companies (was CRM Companies)
  - Clients → Contacts (was CRM Contacts)
  - Clients → Client Calendar (was CRM Calendar)
  - Clients → Client Insights (was CRM Reports)

---

### Screen 3 — Work → Projects (Kanban Board)

**What is shown:**
- Breadcrumb: Dashboard → Work → Projects
- View toggle: Board | List | Timeline | Calendar
- 4 kanban columns: Planning (3), In Progress (3), Review (2), Completed (4)
- "+ New Project" button with Filter and Group by controls
- Project cards show: client name tag, progress bar, team avatar stack

**Implementation instruction for Codex:**
- Breadcrumb updates to: **Home → Work → Projects**
- "Work" section in sidebar must contain these sub-items in this order:
  - Projects (this screen)
  - Tasks
  - Requests (was Service Requests)
  - Scheduled Work (was Scheduled Jobs)
  - Time Tracking (was Timesheet)
- The kanban layout, card design, and column structure shown is the correct target — keep exactly as shown

---

### Screen 4 — Content Calendar

**What is shown:**
- Breadcrumb: Dashboard → Content → Content Calendar
- Month/Week/Today toggle, month navigation arrows
- Calendar grid: July 2024, showing scheduled posts per day
- Each post card shows: time, platform icon (IG, FB, YouTube, Twitter), post type label
- Left panel: Filters for Campaign, Platform, Status
- Legend at bottom: Draft | Scheduled | In Review | Approved | Published
- "+ Create Content" button top right

**Implementation instruction for Codex:**
- Breadcrumb updates to: **Home → Content → Content Calendar**
- "Content" section in sidebar must contain these sub-items:
  - Campaigns
  - Content Calendar (this screen)
  - Content Studio (was Creative Studio)
  - Media Library
  - Brand Kit
  - Content Approvals

---

### Screen 5 — Inbox

**What is shown:**
- Left panel: Channels list — All Messages (129), WhatsApp (45), Instagram (32), Messenger (18), Email (20), Notifications (13), AI Replies (9), Approval Queue (5)
- Centre: Conversation list with contact names, previews, timestamps
- Right panel: Full chat thread with message bubbles, link previews, timestamps
- Tabs: All | Unread | Assigned | Mentions | Sort

**Implementation instruction for Codex:**
- This screen is the correct target implementation for the Inbox section
- The channel list in the left panel maps directly to Inbox sub-items:
  - All Messages → default Inbox landing
  - WhatsApp → `/meta/whatsapp`
  - Instagram → `/meta/instagram`
  - Messenger → `/meta/messenger`
  - Email → `/email`
  - Notifications → `/notifications`
  - AI Replies → `/meta/ai-replies`
  - Approval Queue → `/meta/approvals`
- The badge numbers (45, 32, 18 etc.) are real unread counts — keep this pattern

---

## 6. Duplicate Removal

> ⚠️ **These 3 duplicates must be resolved before any other changes. They are the highest-priority fixes.**

### Duplicate 1 — "Departments"

Currently appears in: People & Activity group AND Administration group (same `/departments` route)

- **Action:** Remove the Departments entry from Administration completely
- **Keep:** One single "Departments" entry under People → sub-items
- **Route stays:** `/departments` (unchanged)

### Duplicate 2 — "Subscriptions"

Currently appears in: Finance Tools group AND Administration group

- **Action:** Remove the Subscriptions entry from Administration completely
- **Keep:** One single "Subscriptions" entry under Finance section
- **Route stays:** `/subscriptions` (unchanged)

### Duplicate 3 — "Users / Employees"

Currently appears as "Users" in People & Activity AND "Users" in Administration — both pointing to user management

- **Action:** Remove the Users entry from Administration completely
- **Keep:** Under People section, rename to "Employees"
- **Consolidate** with HR Employees (`/hr/employees`) so there is ONE employees list, not two

---

## 7. Codex Implementation Prompt

> Copy the text below and paste it directly into Codex, Cursor, or any AI coding assistant. It contains everything the developer needs.

---

```
Task: Restructure the sidebar navigation in SynTask (frontend/src/components/Sidebar.jsx)

RULES:
1. Do NOT change any route (URL path). All existing routes stay exactly the same.
2. Do NOT change any permissions, roles, or access control logic.
3. Do NOT change any page component, form, data, or business logic.
4. Only change: the navigationGroups array in Sidebar.jsx — labels, grouping, order, and icons.
5. Remove ALL duplicate entries:
   - Departments must appear once (in People)
   - Subscriptions must appear once (in Finance)
   - Users/Employees must appear once (in People)

NEW SIDEBAR STRUCTURE (implement in this exact order):
1. Home
2. Sales
3. Clients
4. Work
5. Content
6. Publishing
7. Inbox
8. AI Workspace
9. People  ← NOT "Team"
10. Finance
11. Insights
12. Settings

For every item's new home and new display name, refer to the mapping table in Section 4 of the implementation plan. The mapping table is the ground truth.

Items to REMOVE entirely (duplicates):
- Departments entry under Administration (keep only in People)
- Subscriptions entry under Administration (keep only in Finance)
- Users entry under Administration (merged into Employees under People)

Breadcrumbs: Update all breadcrumbs to start with "Home" not "Dashboard".
Format: Home → [Section] → [Page Name]
```

---

## 8. Sub-Menu Structure

Every top-level section must expand to show these exact sub-items when clicked.

### 🏠 Home
Opens directly — no sub-menu. This is the default landing page.

### 💼 Sales
- Leads
- Pipeline
- Deals
- Meetings
- Proposals
- Quotations
- Contracts
- Follow Ups
- Won / Lost
- Import Leads *(was Bulk Lead Import under Administration)*

### 👥 Clients
- All Clients
- Companies *(was CRM Companies)*
- Contacts *(was CRM Contacts)*
- Documents
- Notes
- Client Calendar *(was CRM Calendar)*
- Client Communication
- Client Insights *(was CRM Reports)*
- Client Settings *(was CRM Configuration)*

### 📂 Work
- Projects
- Tasks
- Requests *(was Service Requests)*
- Scheduled Work *(was Scheduled Jobs)*
- Time Tracking *(was Timesheet)*

### 🎨 Content
- Campaigns
- Content Calendar
- Content Studio *(was Creative Studio)*
- Scripts
- Graphics
- Videos
- Brand Kit
- Media Library
- Content Approvals

### 📢 Publishing
- Publishing Centre *(was Meta Command Center)*
- Social Accounts *(was Customer Meta Connect)*
- Publishing Queue
- Scheduled Posts
- Publishing Analytics *(was Omnichannel Analytics)*
- Integrations *(was Partner Readiness)*

### 💬 Inbox
- All Messages *(with total unread badge)*
- WhatsApp *(badge: 45)*
- Instagram *(badge: 32)*
- Messenger *(badge: 18)*
- Email *(badge: 20)*
- Notifications *(badge: 13)*
- Activity Feed *(was Timeline)*
- Daily Updates *(was Daily EOD)*
- AI Replies *(badge: 9)*
- Approval Queue *(badge: 5)*

### 🤖 AI Workspace
- AI Assistant
- AI Writer
- AI Content Assistant *(was Marketing Assistant)*
- AI Reply Generator

### 👨‍💼 People *(NOT "Team")*
- Employees *(merged: was Users in People & Activity + Employees in HR)*
- Attendance
- Live Attendance
- Leave Management *(was Leaves under Communication)*
- Departments *(one entry only — remove from Settings/Admin)*
- Company Directory
- Hiring Dashboard *(was Recruitment Dashboard)*
- Job Openings *(was Jobs)*
- Applications *(was Inbox under HR)*
- Candidates
- Talent Pool *(was Resume Pool)*
- Interviews
- Hiring Reports

### 💰 Finance
- Invoices *(moved from Administration)*
- Transactions *(was Ledger under Administration)*
- Subscriptions *(one entry only — remove from Administration)*
- Payments
- Expenses

### 📊 Insights
- Business Overview
- Sales Reports
- Marketing Reports
- Project Reports
- Finance Reports
- People Reports *(was Team Reports)*

### ⚙️ Settings
- Organisation
- Roles & Permissions *(was Admin Permissions)*
- Automation Rules *(was Workflows)*
- Connected Accounts *(was Identity Linking)*
- Google Workspace
- Activity Logs *(was Audit Log)*
- System Settings
- Client Settings *(was CRM Configuration)*

> **Settings must contain ZERO financial or operational features. No invoices, no subscriptions, no employee lists here.**

---

## 9. Role-Based Visibility Rules

The sidebar must show different items based on the logged-in user's role. No logic changes — only what appears in the new sidebar groups.

| Role | Sections Visible | Sections Hidden |
|------|-----------------|-----------------|
| Super Admin | All 12 sections | Nothing hidden |
| Admin | All 12 sections | Nothing hidden |
| Manager / Team Lead | Home, Sales, Clients, Work, Content, Publishing, Inbox, AI Workspace, People (limited), Finance (limited), Insights | Settings hidden |
| Sales Executive | Home, Sales, Clients, Inbox, AI Workspace, Insights (sales only) | Work, Content, Publishing, People, Finance, Settings |
| Social Media Manager | Home, Clients (view only), Work (tasks only), Content, Publishing, Inbox, AI Workspace | Sales, People, Finance, Settings |
| Content Creator | Home, Work (tasks only), Content, Inbox, AI Workspace | Sales, Clients, Publishing, People, Finance, Insights, Settings |
| HR Executive | Home, People, Inbox, Insights (team only) | Sales, Clients, Work, Content, Publishing, AI Workspace, Finance, Settings |
| Finance Executive | Home, Finance, Insights (finance only) | Sales, Clients, Work, Content, Publishing, Inbox, AI Workspace, People, Settings |
| Employee | Home, Work (own tasks only), Inbox (own messages only) | All other sections |

---

## 10. Sidebar UI Behaviour

### 10.1 — Default Expanded / Collapsed State

- On first load after the update: all sections are collapsed except Home (which opens directly)
- When a user navigates to a page: the parent section auto-expands to show the current page highlighted
- User's collapsed/expanded preferences are saved in localStorage per user session
- **CRITICAL:** Reset sidebar stored state on deploy — old collapsed states from the previous navigation will cause the wrong sections to open on first load

### 10.2 — Active State Highlighting

- Current page: purple background `#5B4FE8`, white text
- Parent section when a child is active: section label stays visible with a light highlight (not full purple)
- Hover state: light purple background `#EEF0FF` on any item

### 10.3 — Badge Counts (Inbox Only)

- Inbox top-level item: shows total unread count as a badge (e.g. "129" as seen in screenshots)
- Each Inbox sub-item: shows its own channel count (WhatsApp: 45, Instagram: 32, etc.)
- Badge style: small rounded rectangle, purple background, white text, right-aligned in the menu item
- Counts update in real-time without page refresh

### 10.4 — Icons

Use these icons for each top-level section (from the existing icon library already in the project):

| Section | Icon |
|---------|------|
| Home | `HomeIcon` |
| Sales | `BriefcaseIcon` |
| Clients | `UsersIcon` |
| Work | `FolderIcon` |
| Content | `PaintBrushIcon` |
| Publishing | `MegaphoneIcon` |
| Inbox | `ChatBubbleIcon` |
| AI Workspace | `SparklesIcon` |
| People | `UserGroupIcon` |
| Finance | `CurrencyRupeeIcon` |
| Insights | `ChartBarIcon` |
| Settings | `CogIcon` |

### 10.5 — Breadcrumb Update

- All breadcrumbs must start with "Home" not "Dashboard"
- Format: `Home → [Section] → [Page Name]`
- Examples:
  - `Home → Work → Projects`
  - `Home → Clients → Client Insights`
  - `Home → Finance → Invoices`

---

## 11. Testing Checklist

> A non-technical team member must personally complete every item on this checklist before releasing to users.

| # | Test | Expected Result | Pass / Fail |
|---|------|----------------|-------------|
| 1 | Click "Home" in the sidebar | Dashboard loads. Today's tasks, calendar, AI briefing all visible | |
| 2 | Click "Sales" → "Leads" | Lead list page loads. No "CRM" label visible anywhere | |
| 3 | Click "Clients" → "Companies" | Companies list loads. Was previously under "CRM Tools → CRM Companies" | |
| 4 | Click "Work" → "Projects" | Kanban board loads. Planning / In Progress / Review / Completed columns visible | |
| 5 | Click "Content" → "Content Calendar" | Content calendar loads showing scheduled posts by day | |
| 6 | Click "Publishing" → "Publishing Centre" | Publishing management loads. Was previously "Meta Command Center" | |
| 7 | Click "Inbox" → "WhatsApp" | WhatsApp messages load. Unread count matches badge number | |
| 8 | Click "AI Workspace" | AI tools section loads. Not buried under another section | |
| 9 | Click "People" | People section expands. Label says "People" NOT "Team" | |
| 10 | Click "People" → "Departments" | Departments page loads. Confirm "Departments" does NOT appear anywhere else in the sidebar | |
| 11 | Click "Finance" → "Invoices" | Invoices page loads. Was previously under "Administration" | |
| 12 | Click "Finance" → "Subscriptions" | Subscriptions page loads. Confirm "Subscriptions" does NOT appear anywhere else | |
| 13 | Click "Finance" → "Transactions" | Transactions page loads. Was previously "Ledger" under "Administration" | |
| 14 | Click "Settings" | Settings expands. Confirm: NO invoices, NO subscriptions, NO employee list here | |
| 15 | Count total sidebar items | Exactly 12 top-level sections. No more. No less. | |
| 16 | Log in as a Social Media Manager role | Settings, Finance, Sales sections are NOT visible | |
| 17 | Log in as an Employee role | Only Home, Work (own tasks), and Inbox visible | |
| 18 | Time: navigate to Leads | Takes 2 clicks: Sales → Leads. Maximum 3 clicks from Home. | |
| 19 | Time: find an invoice | Takes 2 clicks: Finance → Invoices. Maximum 3 clicks from Home. | |
| 20 | Refresh the page mid-navigation | Page reloads on the same page. Sidebar shows the correct section expanded. | |

---

## 12. User Communication

> Send this message to all SynTask users on launch day. Use exactly this language — no technical terms.

---

**Subject: SynTask has a new menu — everything is still here, just easier to find**

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

Questions? Reply to this message.

---

## 13. Quick Reference Card

> Print or pin this for the support / help desk team. This is the most frequently needed document on launch day.

| If someone asks where to find... | Tell them to go to... | Previous location |
|----------------------------------|----------------------|-------------------|
| Invoices | Finance → Invoices | Was under Administration |
| Ledger / Transactions | Finance → Transactions | Was "Ledger" under Administration |
| Subscriptions | Finance → Subscriptions | Was duplicated in Administration AND Finance Tools |
| Leads | Sales → Leads | Was under CRM Tools |
| CRM Pipeline | Sales → Pipeline | Was under CRM Tools |
| Proposals / Quotations | Sales → Proposals or Quotations | Was under CRM Tools |
| Company / Client list | Clients → Companies | Was "CRM Companies" under CRM Tools |
| Contacts | Clients → Contacts | Was "CRM Contacts" under CRM Tools |
| Projects | Work → Projects | Was under Project Delivery |
| Tasks | Work → Tasks | Was under Project Delivery |
| Service Requests / Tickets | Work → Requests | Was "Service Requests" under Core Operations |
| Timesheet | Work → Time Tracking | Was "Timesheet" under Core Operations |
| Scheduled Jobs | Work → Scheduled Work | Was "Scheduled Jobs" under Core Operations |
| Creative / Content Studio | Content → Content Studio | Was "Creative Studio" under AI & Marketing |
| Content Calendar | Content → Content Calendar | Was under AI & Marketing |
| WhatsApp / Instagram / Messenger | Inbox → WhatsApp / Instagram / Messenger | Was under Meta Omnichannel |
| Email messages | Inbox → Email | Was scattered across Communication |
| Approval Queue | Inbox → Approval Queue | Was "Human Approval Queue" under Meta Omnichannel |
| AI tools / AI writer | AI Workspace | Was under AI & Marketing |
| Employees / Staff list | People → Employees | Was "Users" under People & Activity |
| Departments | People → Departments | Was duplicated in People & Activity AND Administration |
| Attendance / Leave | People → Attendance / Leave Management | Was under People & Activity / Communication |
| Recruitment / Hiring | People → Hiring Dashboard | Was under HR Department |
| Candidates / Interviews | People → Candidates or Interviews | Was under HR Department |
| User permissions / Roles | Settings → Roles & Permissions | Was "Admin Permissions" under Administration |
| Automation / Workflows | Settings → Automation Rules | Was "Workflows" under Administration |
| Audit Log | Settings → Activity Logs | Was "Audit Log" under Administration |
| Connected social accounts | Settings → Connected Accounts | Was "Identity Linking" under Meta Omnichannel |
| Sales reports | Insights → Sales Reports | Was scattered across CRM Reports |
| Business overview / Dashboard | Insights → Business Overview | Was on Dashboard / not clearly accessible |

---

## 14. Success Metrics

Measure these numbers **before launch** (as baseline) and again at **4 weeks** and **8 weeks** after launch.

| Metric | How to Measure | Target Improvement |
|--------|---------------|-------------------|
| Clicks to find an invoice | Time a real user: Finance → Invoices | Max 2 clicks (was 4+ via Administration) |
| Clicks to find leads | Time a real user: Sales → Leads | Max 2 clicks (was 3 via CRM Tools) |
| Onboarding time for new staff | Time from first login to completing first task | Reduce by 30% |
| Support tickets about "can't find X" | Count navigation-related help requests | Reduce by 50% within 4 weeks |
| Daily Active Users | Count from analytics dashboard | Increase by 15% within 8 weeks |
| Feature adoption — Finance section | Count users accessing Finance vs Administration | All finance users shift to Finance section |
| Duplicate confusion tickets | Count tickets about Departments or Subscriptions appearing twice | Zero after launch |

---

## 15. Next Steps

| Action | Owner | Deadline |
|--------|-------|----------|
| Review Section 2 (new structure) and sign off | Product Lead | Before dev starts |
| Resolve any naming disagreements (especially "People" vs alternatives) | Product + Design | Day 1 |
| Resolve the 3 duplicates listed in Section 6 | Developer | Day 2 — before any other work |
| Hand Section 4 mapping table to Codex / developer | Product Lead | Day 2 |
| Developer implements Sidebar.jsx changes | Developer / Codex | Week 2–3 |
| Product Lead runs Section 11 QA checklist personally | Product Lead | End of Week 3 |
| Reset all users' stored sidebar state (localStorage) before deploy | Developer | Deploy day |
| Prepare launch day email using Section 12 template | Product / Comms | Week 3 |
| Print / send Section 13 quick reference card to support team | Support Lead | Launch day |
| Measure baseline success metrics (Section 14) | Analytics / Product | Before launch |
| Measure post-launch success metrics | Analytics / Product | 4 weeks after launch |

---

*SynTask v3.0 Navigation Implementation Plan · Prepared for Non-Technical Teams · Version 1.0*