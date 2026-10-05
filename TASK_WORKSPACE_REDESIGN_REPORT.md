# Task Workspace Redesign Report

Work → Tasks lifecycle-tab redesign built on the existing SynTask Task architecture.
No new Task model, no change to the Task state machine, no second status system.

## Files Changed

### Backend
- `backend/app/api/v1/endpoints/tasks.py` — added `GET /tasks/status-summary`; extended the Task list endpoint with `status_filter`, `blocked`, `overdue`, `due_today`, `critical`, `search`, and `due_from`/`due_to`; shared query builder + summary counter helpers; dependency-blocked detection shared by list and summary.
- `backend/tests/api/test_task_status_summary.py` — NEW: 22 tests covering status counts, every `status_filter`, blocked/overdue/due-today/critical filters, combined filters, pagination, search, company isolation, Employee scope, Lead/Manager scope, and count↔list logical consistency.
- `backend/API_DOCUMENTATION.md` — documented `status-summary` and the new list query parameters.

### Frontend
- `frontend/src/pages/Tasks.jsx` — replaced the old Tasks-by-Stage card navigation with lifecycle tabs (All Tasks, To Do, Assigned, In Progress, In Review, Revision Required, Approved, Completed, Cancelled) + "Needs Attention" quick filters (Blocked, Overdue, Due Today, Critical); added project dropdown; removed the `Scheduled` lifecycle tab; list rows and board cards now show blocked/overdue/critical indicators and "Needs Your Review" for the current reviewer; status changes still go through the existing TaskWorkflow API calls.
- `frontend/src/pages/tasksLifecycle.js` — NEW: lifecycle tab/attention filter configuration, status colors, board column order (`BOARD_STATUSES`), and summary-count shape.
- `frontend/src/pages/tasksRouteState.js` — URL state now maps `?status=` and `?attention=`; legacy `?stage=` still supported.
- `frontend/src/api/tasks.js` — list API accepts `status`, `blocked`, `overdue`, `due_today`, `critical`, `search`, `due_from`, `due_to`; added `getTasksSummary()`.
- `frontend/src/pages/WorkOverview.jsx` — deep links now point at `/work/tasks?status=...` / `?attention=...`.
- `frontend/src/pages/tasksLifecycle.test.js` — NEW: 13 tests.
- `frontend/src/pages/tasksRouteState.test.js` — rewritten for the new URL scheme (6 tests).
- `frontend/src/api/tasks.test.js` — extended for new params + summary endpoint (5 tests).

### Documentation
- `docs/product/PRD.md` — added Work Module Phase 6 Task Workspace Redesign (implemented behavior, access rules, acceptance criteria).
- `docs/user-flows/projects-tasks.md` — replaced the stale Tasks-by-Stage paragraph with the lifecycle-tab + attention-filter behavior and URL scheme.

## Old Task Page Behavior

The Tasks page listed all tasks with a set of large "Tasks by Stage" stat cards at the top that double-clicked into statuses but were not URL-backed, gave no global counts, and did not combine with the advanced filters. `Scheduled` appeared among those stage cards even though scheduled work is a separate Work area. Attention conditions (blocked/overdue/critical) were not filterable from the Tasks page.

## New Lifecycle-Tab Architecture

- Horizontal, horizontally-scrollable tab strip directly under the header: `All Tasks 126 | To Do 18 | Assigned 22 | In Progress 31 | In Review 9 | Revision Required 4 | Approved 6 | Completed 34 | Cancelled 2`.
- Tabs map exactly to backend statuses: `All` → no filter; each other tab → `status_filter=<status>`.
- `Scheduled` is gone from lifecycle navigation. Scheduled Work remains intact under `Work → Scheduled Work` (pending scheduled placeholders generate normal Tasks later; the create-task "scheduled" toast now links there).
- The old Tasks-by-Stage cards were removed — there is exactly one canonical lifecycle navigation now.
- List and Board views share the same tab/attention/advanced filter state. Board columns are the lifecycle states To Do → Completed; Cancelled stays on its own tab.
- `In Review` cards show "Needs Your Review" when the current user is the task reviewer. Revision Required cards surface the revision reason/feedback summary where the existing data model provides it. Completed remains searchable/history-friendly; Cancelled stays accessible last for audit.
- Status, health, and blocked stay separate fields end-to-end: `status=in_progress` + `blocked=true` + `health=overdue` is a valid single task; `blocked` is never a TaskStatus.

## Backend Summary / Count Implementation

`GET /tasks/status-summary` returns:

```json
{
  "all": ..., "todo": ..., "assigned": ..., "in_progress": ..., "in_review": ...,
  "revision_required": ..., "approved": ..., "completed": ..., "cancelled": ...,
  "blocked": ..., "overdue": ..., "due_today": ..., "critical": ...
}
```

Counts are computed over the **full accessible set** (not the paginated page) using the same `build_task_list_query` scope pipeline as the list endpoint, so company isolation, RBAC, manager/team/project scope, and employee visibility are identical. Company A counts never include Company B tasks. Sales follow-up items are excluded from both list and summary to match the Tasks page. `blocked` counts tasks with at least one incomplete dependency (same detection shared with the list).

## URL / Query Design

- `/work/tasks` → All Tasks; `/work/tasks?status=todo|assigned|in_progress|in_review|revision_required|approved|completed|cancelled` → that tab.
- `/work/tasks?attention=blocked|overdue|due_today|critical` → attention quick filter.
- Advanced filters: `?project_id=`, `?assignee=`, `?priority=`, `?department=`, `?search=`, `?due_from=`, `?due_to=`, plus `view=list|board`.
- All state lives in one URL search params object; browser refresh and Back/Forward preserve filters; no separate React route per status was created.
- Work Overview blocked/revision/project cards deep-link into the right tab.

## Attention-Filter Design

"Needs Attention" sits below the lifecycle tabs as a separate row of chips (`Blocked 5 | Overdue 8 | Due Today 7 | Critical 3`). They are NOT statuses; each maps to a dedicated backend list parameter (`blocked=true`, `overdue=true`, `due_today=true`, `critical=true`) and combines additively with the active lifecycle tab and advanced filters. Counts come from `status-summary` and are global-scope.

## RBAC Behavior

No frontend datasets were hardcoded per role. Every list/summary request runs through the existing Task authorization: company isolation, role gates (Admin/Sub Admin/Manager/Lead/Employee), manager scopes, project-scoped Lead authorization, and employee visibility all live in `build_task_list_query`/access assertions. Status changes still go through the TaskWorkflow service only; the frontend never mutates `task.status` directly.

## Tests Added

### Backend (`backend/tests/api/test_task_status_summary.py`, 22 tests)
- Status counts for all lifecycle statuses + `all`.
- Each `status_filter` returns exactly the matching tasks.
- Blocked / overdue / due-today / critical filters.
- Combined filters (status + attention + priority + search).
- Pagination and search.
- Company isolation (Company B tasks never counted or listed).
- Employee scope (only accessible tasks counted) and Lead/Manager scope.
- Count ↔ list-total consistency.

### Frontend (29 tests across 3 files)
- `tasksLifecycle.test.js` (13): default All tab, tab mapping for every status, attention-filter config, board columns, count defaults.
- `tasksRouteState.test.js` (6): URL parse/build round-trips for `status`/`attention`/advanced params, legacy `stage=` support, reload-preservation semantics.
- `tasks.test.js` (5): list params and summary endpoint serialization.

## Test Commands

```bash
# Backend (MongoDB integration, matches repository convention)
cd backend && RUN_MONGO_INTEGRATION=1 python -m pytest tests/api/test_task_status_summary.py -q

# Frontend focused
cd frontend && npx vitest run src/pages/tasksLifecycle.test.js src/pages/tasksRouteState.test.js src/api/tasks.test.js

# Frontend lint + build
cd frontend && npm run lint && npm run build
```

## Test Results

- Backend: `77 passed` across `test_task_status_summary.py`, `test_task_role_visibility.py`, `test_work_module_e2e.py`, `test_work_module_real_e2e.py` (full-suite failures outside these files are pre-existing on pristine HEAD in unrelated CRM/sales/upload modules — verified by stash comparison; zero new failures).
- Frontend: `29 passed` in the three focused files; full-suite failures are pre-existing on pristine HEAD (verified by stash comparison); lint clean; production build succeeds.

## Remaining Limitations

- `status-summary` performs a full scoped read to compute attention counts; acceptable at current scale, and it guarantees count↔list consistency. If task volume grows, the per-task health sync could be batched/denormalized (see `task_health_service`).
- Overdue/due-today counts are computed at request time from the same health sync used by the list, so they reflect the current sync state; the existing background health sync remains the source for precomputed `health_status` values where present.
- Backend tests require a local MongoDB (`RUN_MONGO_INTEGRATION=1`), consistent with the existing task test conventions.

---

# TASK WORKSPACE REDESIGN COMPLETE