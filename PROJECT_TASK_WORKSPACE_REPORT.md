# Project Task Workspace Report

Project Workspace Tasks now uses the same lifecycle-tab Task architecture as the
global Work → Tasks page, scoped to the current Project. One Task domain, two
scopes: `Task Workspace + current filters` (global) and
`Task Workspace + current filters + fixed project_id` (Project Workspace).

## Files Changed

### Backend
- `backend/app/api/v1/endpoints/tasks.py`
  - `GET /tasks/status-summary` now accepts optional `project_id` (kept as the
    second parameter after `current_user`, so existing direct calls are
    unaffected). Project scope is added to the SAME scoped query used globally.
  - New `_project_link_condition(project_id, current_user)`: resolves the
    Project (by Mongo `_id` or logical `project_id`) and matches tasks linked
    via logical `project_id`, Mongo `_id`, or normalized `project_object_id` —
    the same conventions the Project board and completion readiness use.
    Unknown/cross-company identifiers resolve to a match-nothing condition so
    no other company's rows can leak through a guessed project id.
  - The Task list endpoint's `project_id` filter now uses the same resolved
    condition (previously a plain equality on `task.project_id`, which returned
    nothing when the workspace URL carried the project's Mongo `_id` while
    tasks store the logical id — the "3 tasks exist but none appear" bug).
- `backend/tests/api/test_task_status_summary.py` — extended with 7 project tests.
- `backend/API_DOCUMENTATION.md` — documented `project_id` on `status-summary`.

### Frontend
- `frontend/src/pages/ProjectBoard.jsx` — the Project Workspace Tasks tab (the
  existing `board` workspace tab) is now a full Task workspace:
  - Lifecycle tab bar (All Tasks → Cancelled) with project-scoped counts and
    Needs Attention quick views (Blocked/Overdue/Due Today/Critical), styled
    identically to the global Tasks page (shared `tasksLifecycle.js` config).
  - Backend-driven search + assignee/priority/due-range filters (no Project
    filter — the project is the workspace context and cannot be changed).
  - List | Board toggle; List is a table, Board is the existing drag/drop
    kanban (DnD + column selects) — both fed from the SAME backend-filtered
    dataset, and status changes go through `tasksAPI.updateTaskStatus`
    (TaskWorkflow remains authoritative; backend validation errors surface).
  - URL state via search params on the existing route
    (`?tab=tasks&status=in_review&attention=blocked&view=list&q=...&assignee=...&priority=...&due_from=...&due_to=...`),
    with read/write convergence so refresh and Back/Forward preserve state.
  - `+ New Task` (and per-column add) opens the existing create modal with
    `project_id` bound; Apply Template and the existing QuickAssign panel
    refresh through one `refreshProjectTasks()` path (list + project summary +
    board/overview + Work Overview + calendar).
  - Zero-task state offers `+ New Task` / `Apply Template`; loading, empty,
    error states all render. Fixed a pre-existing `loadProject` ReferenceError
    in the template `onApplied` callback.
- `frontend/src/pages/ProjectBoard.helpers.js` — extracted pure helpers:
  `resolveWorkspaceTab` / `workspaceTabParam` (tab= URL mapping) and
  `groupTasksByStatus` (board buckets), so URL/grouping behavior is testable.
- `frontend/src/pages/tasksLifecycle.js` — added `projectEmptyStateMessage`
  for project-scoped empty copy (zero-task, per-status, per-attention).
- `frontend/src/api/tasks.js` — `getStatusSummary({ project_id })`.
- Frontend tests: `tasksLifecycle.test.js` (project empty states),
  `tasks.test.js` (project-scoped summary URL), `ProjectBoard.test.jsx`
  (workspace tab mapping + status grouping).

### Documentation
- `docs/product/PRD.md` — Work Module Phase 7 Project Workspace Task Workspace.
- `docs/user-flows/projects-tasks.md` — Project Workspace Tasks behavior.
- `README.md` — reviewed; no task-workspace changes needed (no stale references).

## Architecture

- Global Tasks = `GET /tasks` + `GET /tasks/status-summary` without `project_id`.
- Project Tasks = the same endpoints with `project_id`, resolved server-side to
  the real Project; counts, filters, and pagination all apply the company/RBAC
  scope first, then project linkage, then status → attention → filters →
  search → sort → pagination.
- No second Task model, no duplicated lifecycle logic, no TaskWorkflow bypass.

## Test Results

- Backend: `29 passed` in `test_task_status_summary.py` (7 new project tests:
  project-scoped all/status counts, summary↔list consistency, company
  isolation, employee scope, Mongo-id vs logical-id linkage, unknown project id
  matches nothing, status+attention+priority+search combination). Broader work
  suite: `89 passed` (summary + work e2e ×2 + role visibility + completion
  readiness). Full-suite failures elsewhere are pre-existing on pristine HEAD.
- Frontend: `46 passed` across the focused files (tasksLifecycle, tasksRouteState,
  tasks API contract, ProjectBoard helpers). Full-suite failures (7–8) are
  pre-existing on pristine HEAD (one CRM pipeline test is flaky on pristine
  too); none touch files changed here.
- `eslint` on every changed file: clean. Repo-wide lint errors (628) are
  pre-existing on pristine HEAD (629 — my changes net remove one).
- Production build: passes.

## Remaining Limitations

- Frontend coverage for the Project Workspace Tasks UI is at the helper/contract
  level (tab mapping, grouping, project empty-state copy, summary API contract)
  plus the existing ProjectBoard helper tests; this repo has no component-level
  rendering test infrastructure for ProjectBoard (its test file is helper-only),
  so tab-click → URL and List/Board rendering behaviors are verified through
  the shared route-state tests and manual/browser validation rather than a
  component test harness.
- The Tasks tab still uses the existing Project workspace chrome above it
  (delivery overview, metrics, Quick Assign panel); the lifecycle workspace is
  the Tasks tab content, keeping Project navigation intact.
- Pagination (20/page) applies to both views exactly like the global Tasks page.

---

# PROJECT TASK WORKSPACE COMPLETE