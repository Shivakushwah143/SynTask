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
- Stage overview: the page shows a "Tasks by Stage" card that breaks down the current result set by workflow stage (Scheduled, To Do, Assigned, In Progress, Review, Revision Required, Approved, Completed, Cancelled) with per-stage counts, share-of-total percentages, and progress bars. Clicking a stage applies that status filter to the list (clicking again clears it). The breakdown excludes Sales follow-up items, matching the Task Overview graph.
- Follow-up behavior: Sales follow-up items (source_type `sales_follow_up`), including scheduled follow-up placeholders, are excluded from the Tasks page because they are not standalone tasks; they surface in the Calendar and CRM follow-up views instead.

## Projects List and Board
- How the user reaches it: main navigation or workspace links.
- What they can do: browse projects, open a board, inspect board summaries, create tasks, assign tasks to active employees in the company, and quick-create an employee from the task assignment flow.
- Create project form: the New project modal includes a Client selector listing all registered clients in the company, with a built-in search bar inside the dropdown and a Clear button to reset the selection. If the client is not in the list, a "Create client" option opens the shared quick-create client form (the same one used on the Clients dashboard / Invoices); the newly created client is then selected automatically. The chosen `client_id` is stored on the project and returned by the project list/detail APIs.
- What happens after every action: selecting a project opens board/detail routes and refetches project data.
- Backend APIs called: project list/detail/board APIs, task create/update APIs, and tenant-scoped active staff lookup through `/api/v1/users/assignable`.
- Timeline events created: project changes should appear in timeline/activity where the backend emits events.
- Notifications sent: none explicitly in the frontend.
- Related modules updated: Tasks, Time Tracking, CRM handoff in future flows.
- Tenant and access rule: task assignee choices come only from the authenticated user's company and are limited to active employee-role records; managers can see employees even when those employees report to a different manager. Negative tests should verify another company's employee never appears in the dropdown.
- Module gate: the Work route group treats `task` and `tasks_projects` as aliases and permits standard Work roles (Admin, Sub Admin, Manager, Lead, Employee) to reach the APIs shown by sidebar navigation; endpoint rules still enforce company, hierarchy, project membership, assignment, and project-scoped Lead authorization.
- Quick-create behavior: the nested Create user modal opens above the Create task modal, and the employee designation field uses the shared designation dropdown with search and an inline create-new option.

## Task Detail
- How the user reaches it: from project board, task list, or direct task route.
- What they can do: edit the task, comment, attach files, assign watchers, log time, manage checklist items, add dependencies, and move the task through allowed workflow actions.
- Phase 2 workflow: tasks use strict statuses `todo`, `assigned`, `in_progress`, `in_review`, `revision_required`, `approved`, `completed`, and `cancelled`. Assigned tasks start as `assigned`; unassigned tasks start as `todo`. Review-required project tasks must move `assigned -> in_progress -> in_review -> approved -> completed`; revision loops use `revision_required -> in_progress`. Non-review tasks can complete from `in_progress`. `completed` can reopen to `assigned`; `cancelled` is terminal.
- Review and blocker rules: submitting a review-required task requires a reviewer and all required checklist items complete. Starting, submitting, or completing a task is blocked while any dependency task in the same tenant remains incomplete. Sales follow-up tasks keep `review_required=false`.
- What happens after every action:
  - Mutation updates task state and refetches the detail.
  - Comments/attachments/time logs refresh their corresponding sections.
- Backend APIs called: task detail, comments, subtasks, attachments, watchers, changelog, time log APIs.
- Timeline events created: task activity should be captured in the activity/timeline systems where wired.
- Notifications sent: watchers/assignees may receive existing task notifications where configured.
- Related modules updated: Timesheet, Time Tracking, CRM Activities if task is linked.
- Tenant and access rule: every task workflow, checklist, dependency, and changelog request verifies `company_id` and then applies task view/manage rules. Reviewers must be active same-company users authorized as Admin/Sub Admin/Manager/Lead/Super Admin or through project task-management permission. Negative tests cover cross-company dependency rejection and task visibility boundaries.

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

Work Requests live at `/work-requests` in the Work route group. Users can submit operational requests for new work, changes, approvals, deadline extensions, resource needs, blockers, leave/availability, client requests, and other work coordination. Reviewers can start review, approve, reject with reason, cancel open requests, and convert approved or under-review requests into Tasks or Projects.

Scheduled Work still lives at `/scheduled-jobs`. Users with existing scheduled-work permissions can create one-time jobs or recurring jobs. Recurring jobs store recurrence settings, timezone, next run, last run, enabled state, and occurrence history. Pause disables future runs without deleting the rule; resume advances missed schedules to the next future run without catch-up creation.

Tenant and access rule: Work Requests and Scheduled Work are company-scoped by `company_id`. Project, task, client, reviewer, assignee, and converted records must all resolve inside the same company before write actions proceed. Negative tests should verify cross-company context ids, cross-company reviewers, and cross-company request/detail lookups are denied.
