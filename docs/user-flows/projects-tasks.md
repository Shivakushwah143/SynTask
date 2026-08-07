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
- Stage overview: the page shows a "Tasks by Stage" card that breaks down the current result set by workflow stage (Scheduled, To Do, In Progress, Review, Completed) with per-stage counts, share-of-total percentages, and progress bars. Clicking a stage applies that status filter to the list (clicking again clears it). The breakdown excludes Sales follow-up items, matching the Task Overview graph.
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
- What they can do: edit the task, comment, attach files, assign watchers, log time.
- What happens after every action:
  - Mutation updates task state and refetches the detail.
  - Comments/attachments/time logs refresh their corresponding sections.
- Backend APIs called: task detail, comments, subtasks, attachments, watchers, changelog, time log APIs.
- Timeline events created: task activity should be captured in the activity/timeline systems where wired.
- Notifications sent: watchers/assignees may receive existing task notifications where configured.
- Related modules updated: Timesheet, Time Tracking, CRM Activities if task is linked.

## Time Tracking / Timesheet
- How the user reaches it: task pages or main navigation.
- What they can do: log time, inspect time entries, review summaries.
- What happens after every action: time entry creation updates live timers and summary lists.
- Backend APIs called: time tracking and timesheet APIs.
- Timeline events created: time logs may be surfaced as activity events if the backend emits them.
- Notifications sent: none explicitly in the frontend.
- Related modules updated: Task Detail, Reports.
