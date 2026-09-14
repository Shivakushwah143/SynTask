# Projects and Tasks User Flows

## Main Flow

```mermaid
flowchart TD
  A[Authenticated user] --> B[/projects]
  A --> C[/tasks]
  B --> D[/projects/:projectId/board]
  D --> E[/projects/:projectId/tasks/:taskId]
  C --> E
  C --> F[/tasks/:taskId]
  E --> G[Comments / Attachments / Time / Watchers]
```

## Tasks List
- How the user reaches it: main navigation `/tasks` (list or kanban toggle).
- What they can do: browse tasks, search, filter by status/priority/assignee/department/due date, create tasks (now or scheduled), edit, and delete.
- Lifecycle navigation: the page shows a horizontally scrollable lifecycle stage pipeline (All Tasks, To Do, Assigned, In Progress, In Review, Revision Required, Approved, Completed, Cancelled) backed by the backend `/api/v1/tasks/status-summary` counts. Each lifecycle stage renders as its own isolated transparent node chip (status-colored dot, filled with its stage color when active) with arrows flowing between consecutive stages (`To Do → Assigned → … → Completed`), rather than a single shared colored tab band; All Tasks and Cancelled stay as separate quick chips. Selecting a stage filters the list through `status_filter` and is reflected in the URL (`?status=in_review`), so refresh and Back/Forward preserve the selection; deep links can land directly on a status. `Scheduled` is NOT a lifecycle tab: pending scheduled work lives in Work → Scheduled Work (`/scheduled-jobs`), which generates normal Tasks later.
- Attention conditions: a separate "Needs Attention" area under the tabs offers quick filters for Blocked, Overdue, Due Today, and Critical. These are NOT TaskStatus values (a task can be `status=in_progress` AND `blocked=true` AND `health=overdue` at the same time). They map to backend `blocked`/`overdue`/`due_today`/`critical` list parameters and to the `?attention=` URL parameter (e.g. `/tasks?attention=blocked`). Attention counts and lifecycle counts come from the same backend summary endpoint and are global-scope, never current-page totals.
- Filtering: lifecycle tab, attention condition, search, project, assignee, reviewer, priority, department, and due-date range all combine server-side; filtering happens on the backend, not in React. The Tasks page requests `exclude_follow_up=true` so list totals match the tab counts. Board columns represent the active lifecycle states (To Do → Completed); Cancelled is reachable from its own tab.
- Follow-up behavior: Sales follow-up items (source_type `sales_follow_up`), including scheduled follow-up placeholders, are excluded from the Tasks page because they are not standalone tasks; they surface in the Calendar and CRM follow-up views instead.

## Project Workspace Tasks (Project > Tasks tab)
- How the user reaches it: open a project workspace (`/projects/:projectId/board`) and select the Tasks workspace tab (`?tab=tasks`); the default workspace tab is Tasks.
- What they see: the same lifecycle architecture as Work > Tasks, scoped to the current Project: `All Tasks | To Do | Assigned | In Progress | In Review | Revision Required | Approved | Completed | Cancelled` with project-scoped counts (from `/api/v1/tasks/status-summary?project_id=...`), plus a Needs Attention row (Blocked/Overdue/Due Today/Critical) with project-scoped counts. Counts cover the full accessible project task set, never the visible page. `Scheduled` is not a lifecycle tab and pending scheduled work stays in Work > Scheduled Work. The lifecycle stages render as a color-coded stage pipeline — each stage is its own isolated transparent node chip (status-colored dot, filled solid with its stage color when active) with arrows flowing between consecutive stages (`To Do → Assigned → In Progress → In Review → Revision Required → Approved → Completed`) — while All Tasks and Cancelled stay as separate plain quick chips.
- Filtering: lifecycle tab, attention condition, search, assignee, priority, and due-date range combine server-side through the existing `/api/v1/tasks` list with `project_id` fixed to the workspace project (resolved by Mongo `_id`, logical `project_id`, or `project_object_id`, so counts and list totals match the Project board). There is deliberately no Project filter because the project is the workspace context.
- List and Board: a List | Board toggle switches between a table and the drag/drop kanban, both fed by the same backend-filtered dataset. Drag/drop and status selects always call the existing TaskWorkflow status route; validation errors (e.g. review-required tasks cannot jump straight to completed) surface from the backend. Board columns are the active lifecycle states To Do → Completed; Cancelled stays reachable from its own tab.
- Stage advance from List rows: each row shows the next-stage action(s) the current user may take on that task, derived from the same role/transition rules the backend enforces. The assignee can Start work / Submit for review / resume from Revision Required / complete non-review tasks; the named reviewer and task managers (company admins, project task managers, and the task creator) can Approve or Request revision on In Review tasks; task managers can also Assign an unassigned To Do task, complete an approved task, and reopen a Completed task. If the actor's option is valid but the task has not reached the stage where they may act (for example Approve / Request revision while the assignee has not yet submitted an in_progress review-required task), the option still appears but disabled with a warning tooltip/reason instead of being hidden. In Review rows always present a generic Next stage control whose modal lists Approve and Request revision together; both are selectable for the assigned reviewer and for workflow managers (e.g. an admin can approve a task reviewed by someone else), and the assignee is the only actor who never gets the option to approve their own task. Options that need input (choose an assignee for Assign, a reason for Request revision) open a requirement modal first. Enabled actions call the existing semantic endpoints (`start`, `submit-review`, `approve`, `request-revision`, `complete`, `reopen`, and the task update route for assignment); blocked, checklist-incomplete, and not-yet-approvable transitions surface as disabled reasons and the backend remains authoritative.
- URL state: the workspace tab, lifecycle status, attention condition, search, filters, and List/Board view live in the URL (`/projects/PROJ-123/board?tab=tasks&status=in_review&attention=blocked&view=list`), so refresh and Back/Forward preserve state and other modules can deep-link.
- Task creation: + New Task (and per-column add) opens the existing create modal with `project_id` already bound to the workspace project; Apply Template regenerates template tasks that immediately appear in the tabs. After any create/transition, project task counts, Project board/overview, and Work Overview all refresh from the one Task source of truth.
- Tenant and access rule: every list/count request stays company-scoped and applies existing Project/Task RBAC (Admin/Sub Admin/Manager company scope, Lead scoped rules, Employee only their own accessible tasks); an unknown or cross-company project id resolves to zero rows rather than leaking data.

## Projects List and Board
- How the user reaches it: main navigation or workspace links.
- What they can do: browse projects, open a board, inspect board summaries, create tasks, assign tasks to active employees in the company, and quick-create an employee from the task assignment flow.
- Create project form: the New project modal includes a Client selector listing all registered clients in the company, with a built-in search bar inside the dropdown and a Clear button to reset the selection. If the client is not in the list, a "Create client" option opens the shared quick-create client form (the same one used on the Clients dashboard / Invoices); the newly created client is then selected automatically. The chosen `client_id` is stored on the project and returned by the project list/detail APIs.
- What happens after every action: selecting a project opens board/detail routes and refetches project data.
- Backend APIs called: project list/detail/board APIs, task create/update APIs, and tenant-scoped active staff lookup through `/api/v1/users/assignable`.
- Timeline events created: project changes should appear in timeline/activity where the backend emits events.
- Notifications sent: none explicitly in the frontend.
- Related modules updated: Tasks, Time Tracking, CRM handoff in future flows.
- Tenant and access rule: task assignee choices come only from the authenticated user's company and are limited to active employee-role records; managers can assign to any active employee in the company regardless of department, and the current assignee still renders for display. Negative tests should verify another company's employee never appears in the dropdown.
- Module gate: the Work route group treats `task` and `tasks_projects` as aliases and permits standard Work roles (Admin, Sub Admin, Manager, Lead, Employee) to reach the APIs shown by sidebar navigation; endpoint rules still enforce company, hierarchy, project membership, assignment, and project-scoped Lead authorization.
- Quick-create behavior: the nested Create user modal opens above the Create task modal, and the employee designation field uses the shared designation dropdown with search and an inline create-new option.

## Work > Projects Lifecycle Tabs
- How the user reaches it: `Work > Projects` (`/projects`).
- Lifecycle tabs: All Projects | Created | Execution | Review | Completed | Reporting | On Hold | Archived | Cancelled. Each stage renders as its own isolated transparent node chip (status-colored dot, filled with its stage color when active) with arrows flowing between consecutive stages (`Created → Execution → Review → Completed → Reporting`), matching the Task pipeline look. `Kickoff` is NOT a tab; legacy documents stored with the historical `active` status and documents in `kickoff` are browsed/counted under Execution (their stored values are never rewritten). Client Review is never added as a lifecycle tab.
- Health and Needs Setup stay separate dimensions: a secondary quick-filter row offers Healthy / Needs Attention / At Risk (health levels) and Needs Setup (a derived attention condition meaning “project exists but no execution plan/Tasks yet” - typical for CRM/Client auto-created Projects before execution Tasks exist). A project can be `execution` AND `at_risk`, and `needs_setup` maps to `?attention=needs_setup`, never to a status.
- Counts: each tab/chip shows real counts from `GET /api/v1/projects/status-summary`, computed across the user's full accessible Project scope (same company isolation, RBAC, owner/manager scope, and Project visibility as the list), never from the current page.
- Filtering is backend-driven: lifecycle status → health/needs-setup → client, owner, priority, type, delivery window → search → sort → pagination are all applied server-side on `GET /api/v1/projects` (params `status`, `health`, `attention`, `client_id`, `owner_id`, `priority`, `type`, `delivery`, `search`). Legacy `status_filter` is still accepted and legacy status values like `active` resolve to their lifecycle tab.
- URL state: `/projects?status=execution&health=at_risk`, `/projects?attention=needs_setup&view=board` etc. Browser refresh and Back/Forward preserve lifecycle, health, attention, search, advanced filters, page, and the List | Board view; dashboard/deep links can land on a filtered list.
- List | Board: both views consume the same backend-filtered dataset. The Board groups projects into lifecycle columns (Created, Execution, Review, Completed, Reporting) with On Hold as a side column; Archived/Cancelled remain reachable from their tabs. The board is read-only for lifecycle movement - full ProjectWorkflow transitions are a later phase, so no drag/drop or direct status mutation exists here. Status changes continue through the Edit modal, which validates transitions server-side via the existing ProjectWorkflow (`advance_project`).
- New Projects begin in `created`: the manual create path (`ProjectService.create_project_core`) and won-deal/Client auto-creation set the new Project's status to `created`, so a fresh Client auto-created Project appears under Created and under Needs Setup until an execution plan/Tasks exist. Sales Won → Client → Project keeps working; legacy `active` Project documents remain readable (mapped under Execution for browsing).
- Cards/rows show name, client, owner, lifecycle chip, health chip, priority, progress, delivery date, and open/overdue Task counts when available, and open the Project workspace on click.
- Empty/loading/error states: each lifecycle/health filter renders a status-specific empty message (e.g. “All Projects have an execution plan.” for Needs Setup), loading skeletons, and a retryable error state.
- Tenant and access rule: all list/count calls share `build_project_list_query`, so Company A never sees Company B Projects or counts and Employees only see their accessible Projects; negative tests cover company isolation and role scopes.

## Task Detail
- How the user reaches it: from project board, task list, or direct task route.
- What they can do: edit the task, comment, attach files, assign watchers, log time, manage checklist items, add dependencies, and move the task through allowed workflow actions.
- Phase 2 workflow: tasks use strict statuses `todo`, `assigned`, `in_progress`, `in_review`, `revision_required`, `approved`, `completed`, and `cancelled`. Assigned tasks start as `assigned`; unassigned tasks start as `todo`. Review-required project tasks must move `assigned -> in_progress -> in_review -> approved -> completed`; revision loops use `revision_required -> in_progress`. Non-review tasks can complete from `in_progress`. `completed` can reopen to `assigned`; `cancelled` is terminal.
- Review and blocker rules: submitting a review-required task requires a reviewer and all required checklist items complete. Starting, submitting, or completing a task is blocked while any dependency task in the same tenant remains incomplete. Sales follow-up tasks keep `review_required=false`.
- Revision reason panel: task details show a dedicated color-coded "Revision reason" section so requested changes are never missed. The panel is red while the task waits in Revision Required and amber while the assignee is reworking an earlier revision request; it displays the reviewer's written reason (with a fallback message when none was recorded), the requester, the request date, and the review round. The panel appears whenever the task is in Revision Required or a revision reason exists.
- Revision requirement from the status selector: choosing Revision Required from the task status dropdown opens a modal that collects the mandatory revision reason before calling the semantic request-revision endpoint, so the transition never fails with a missing-reason error and the captured reason appears in the Revision reason panel afterwards.
- What happens after every action:
  - Mutation updates task state and refetches the detail.
  - Comments/attachments/time logs refresh their corresponding sections.
- Backend APIs called: task detail, comments, subtasks, attachments, watchers, changelog, time log APIs.
- Timeline events created: task activity should be captured in the activity/timeline systems where wired.
- Notifications sent: watchers/assignees may receive existing task notifications where configured.
- Related modules updated: Timesheet, Time Tracking, CRM Activities if task is linked.
- Tenant and access rule: every task workflow, checklist, dependency, and changelog request verifies `company_id` and then applies task view/manage rules. Catalogued `tasks.create` and `tasks.assign` overrides are evaluated with their configured project/team/department/company scope before legacy project and hierarchy fallback. A crafted assignment outside the configured reporting-team scope is denied. Managers can assign and reassign tasks to any active Lead or Employee in the company and can change the assignee of any task they can view, regardless of department. Reviewers must be active same-company users authorized through the workflow/project policy. Negative tests cover cross-company dependency rejection, out-of-scope assignment, and task visibility boundaries.

## Time Tracking / Timesheet
- How the user reaches it: task pages or main navigation.
- What they can do: log time, inspect time entries, review summaries.
- What happens after every action: time entry creation updates live timers and summary lists.
- Backend APIs called: time tracking and timesheet APIs.
- Timeline events created: time logs may be surfaced as activity events if the backend emits them.
- Notifications sent: none explicitly in the frontend.
- Related modules updated: Task Detail, Reports.
# Phase 1 Project Foundation

Project creation now requires name, client for client-facing work, project type, description, Project Owner, start date, delivery date, and business priority. Internal projects can be created without a client by selecting the internal project type.

Project list cards separate business priority from deadline urgency and show derived health/progress. Project workspace tabs map to Overview, Tasks, and Files while preserving the existing board, task creation, files/pages, components, versions, and AI briefing behaviors.

Negative access flow: a user outside the project/company must not see or manage the project through list filters, detail URLs, client workspace routes, or task/project identifiers.

# Phase 2 Task Execution, Review, and Approval

Task workflow authority lives in `backend/app/services/task_workflow.py`. Legacy status updates still call `/api/v1/tasks/{task_id}/status`, but the service maps them to semantic actions before applying the same transition rules as the explicit action endpoints.

Checklist items are normalized objects with `id`, `text`, `completed`, `required`, `created_at`, `completed_at`, and `completed_by`. Assignees may complete checklist items they can view; checklist text/required edits and deletion require task manage access.

Dependencies are stored as same-tenant task ids. A task cannot depend on itself, cannot depend across tenant boundaries, and cannot create a circular dependency chain.

# Phase 4 Work Requests and Scheduled Work

Work Requests live at `/work-requests` in the Work route group. Users can submit operational requests for new work, changes, approvals, deadline extensions, resource needs, blockers, leave/availability, client requests, and other work coordination. Reviewers can start review, approve, reject with reason, cancel open requests, and convert approved or under-review requests into Tasks or Projects. Deadline-extension approval uses the Task Extension workflow exactly once; concurrent conversion attempts use an atomic guard and share one target entity.

Scheduled Work still lives at `/scheduled-jobs`. Users with existing scheduled-work permissions can create one-time jobs or recurring jobs. Recurring jobs store recurrence settings, timezone, next run, last run, enabled state, and occurrence history. Daily, weekly, monthly, and custom intervals preserve local wall-clock time; multi-week schedules advance by whole week intervals. Pause disables future runs without deleting the rule; resume advances missed schedules to the next future run without catch-up creation, and retries reuse the task already linked to the same occurrence.

Tenant and access rule: Work Requests and Scheduled Work are company-scoped by `company_id`. Project, task, client, reviewer, assignee, and converted records must all resolve inside the same company before write actions proceed. Negative tests should verify cross-company context ids, cross-company reviewers, and cross-company request/detail lookups are denied.

# Phase 5 Time Tracking and Project Control

Time Tracking supports one backend-authoritative active timer per employee. The page loads the current timer from `/api/v1/time-tracking/active`, so refresh does not lose running or paused state. Start validates task access, assignment, blockers, and project lifecycle; assigned tasks move to `in_progress` through Phase 2 workflow before timer creation. Pause stores elapsed time in the active session, resume continues the same session, and stop creates the finalized `TimeLog` with `source=timer`.

Manual time entry remains available and creates `source=manual` TimeLogs. Manual entries require positive duration, reject excessive duration, and validate task/project/company scope. Deleting a time log now voids it for audit instead of hard-removing history.

The main Project Workspace overview includes a compact Resources section with
up to four previews and a View All modal; it is visible inside the overview
hero before the workspace tabs rather than inside the Tasks/Overview tab.
The full modal filters resources by All, Links, Media, or Text. Project managers can add/edit/delete dynamic name/value pairs;
resource creation supports Link, Media file, and Text types with multiple
compact fields added in one form submission.
other authorized members can open safe HTTP(S) links. For quantitative tasks,
`+/-` changes an unsaved draft and Update opens an optional proof dialog. The
dialog shows one optional proof row per newly added item, with Media upload,
Link, or Text category choices. Existing completed items are not requested
again. Subtract-only updates require no proof fields. Empty rows are ignored, so partially filled proof
does not block saving. Skip saves quantity alone. Send for Review similarly
opens optional proof; Skip still sends the task. During either submission, both
modal actions are disabled and show an inline loading indicator until the
request completes. Reviewers can open View Proof without proof becoming a
separate approval workflow. Quantitative
employees submitting a task for review from Task Detail also receive this
optional proof dialog, which starts with one row and supports adding more rows.
Skip submits the task without proof; both Skip and Submit update the status.
After a task reaches In Review, Add Proof in Production Progress opens the same
optional proof form, and View Proofs lists all uploaded entries.
tasks cannot be moved to In Review until the target quantity is complete; the
status selector shows a clear message with the remaining quantity and leaves
the task in its current status. Same-company Managers and Leads can also move
an in-progress task to In Review, subject to the same checklist, dependency,
quantity, and backend workflow validations. Standalone tasks use this review
workflow by default as well; only tasks explicitly configured with
`review_required=false` (and Sales follow-ups) bypass review.

Project pages can request completion readiness from `/api/v1/projects/{project_id}/completion-readiness`. A project is not ready while required tasks are incomplete, review/revision/approved-not-completed tasks remain, dependency blockers exist, blocker Work Requests are open, active project timers exist, or the project lifecycle is not eligible. Direct status completion and semantic completion both use this backend readiness gate. Archiving is allowed only after the project reaches reporting and preserves historical tasks, time, requests, scheduled work, and activity.

# Phase 9 Supervisory Work Overview

An Admin/Sub Admin opens **Work → Overview** and receives only active employees in that company. A Manager or Lead receives only active reporting descendants through `ancestors`; an Employee retains the self-work view. The supervisor begins on Today, combines authorized department, employee, attendance, work-status, task-health, and text filters, and sees matching employees grouped by Department (or Unassigned Department). Summary counts recalculate from that same filtered population.

**Period filter.** The Period control offers Today, Yesterday, Last 7 days, Last 30 days, Last 1 year, and Custom range. The presets are trailing windows that include today, so Last 7 days covers today plus the previous six dates, Last 30 days covers today plus the previous twenty-nine, and Last 1 year covers 365 dates. Every range period shows From and To date inputs carrying the exact window, so a preset is always verifiable on screen; editing either bound makes the control a Custom range, and choosing a preset afterwards replaces the edited window instead of blending the two. Custom range is pre-filled with the last seven days; picking a bound that would invert the window moves the other bound with it, and clearing a bound falls back to its partner, so the range is always complete and ordered. The period applies to the whole page rather than only to attendance: summary counters, employee and department task badges, and the expanded employee's task evidence all describe the selected window. A task belongs to the period when its due date falls inside it, or when it is still open and was already overdue when the window opened, so late work stays visible in later ranges. Overdue is measured against today as well as against the window start, so looking at a future range never labels work that is merely due before it as already late. Open tasks without a due date sit outside every period and are counted in a short note above the task list instead of disappearing silently. Attendance status on an employee row is the status on the final day of the selected period, while worked time totals the period.

Selecting Expand lazy-loads one employee’s evidence panel. The panel opens on **Work** and no longer offers an Overview tab, so assigned tasks are the first evidence shown; Attendance, Time, and Daily Update read existing records, and Activity loads the existing employee timeline only when its tab is selected and paginates results. Attendance state, current work, active/overdue counts, and EOD status remain visible on the employee row and in the remaining tabs. Missing data is neutral and explicit. Task navigation stays in the Task workspace; monitoring has no task, attendance, timer, EOD, or stream writes.

In the expanded Work tab, each assigned task is color-coded by due date so a supervisor can scan for risk: **due date passed** (red row tint, red accent bar, red badge showing how many days late), **due date near** (amber, meaning due within 3 days including today), and **due date far** (neutral row with a green accent bar and the due date). Every row also states its category as text, so the code never relies on color alone. Completed and cancelled tasks keep the neutral treatment because their due date is historical rather than a risk, and tasks without a due date show `No due date`. Colors read consistently in light and dark mode.

Negative access flow: crafted employee ids outside the resolved descendant/company scope receive 403 for both detail and activity. Company A data never enters Company B aggregation, and filters never expose out-of-scope people, departments, managers, or projects.
