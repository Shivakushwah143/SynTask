# Phase 3 — Employee + Manager Work Experience: Implementation Report

## 1. Executive Summary

Phase 3 transforms SynTask's Work section from a generic navigation landing into a **role-aware operational control center**. Employees see "My Work" with a deterministic Next Action engine, and managers see "Team Work" with a management attention queue, workload table, review queue, at-risk projects, and pending extensions.

**Key deliverables:**
- `GET /work/overview` — single role-aware endpoint, backend determines scope
- `WorkOverviewService` — centralized aggregation (no N+1, server-side counts)
- Next Action Engine — deterministic prioritization with explainable algorithm
- Workload Pressure classification (not utilization — workload pressure only)
- Management Attention Queue — severity-ordered exception surfacing
- Employee: summary cards, Next Action, needs attention, today, waiting/blocked, upcoming, reviews for you
- Manager: summary cards, attention queue, review queue, team workload, overdue/blocked, at-risk projects, pending extensions
- 43 new backend tests (all passing), 165 total tests passing, frontend builds clean

## 2. Architecture Reused

- **Task Health Service**: `sync_task_health()`, `calculate_task_health()`, `visible_employees()`
- **Task Workflow Service**: `blocking_dependencies()`, `effective_review_required()`
- **Project Health Service**: `calculate_project_health()` for at-risk project detection
- **Dashboard Service**: `build_manager_dashboard_metrics()` pattern for team aggregation
- **Task Extension Requests**: Existing `TaskExtensionRequest` model and status
- **User Hierarchy**: `current_user.get_all_subordinates()` for manager scope
- **Task Status/Workflow**: All Phase 2 statuses and transition rules
- **Overview Components**: `ModuleOverviewHeader`, `OverviewStats`, `OverviewCard` from design system
- **Navigation**: Added "Overview" to Work section items

## 3. Backend Changes

| File | Change |
|---|---|
| `backend/app/services/work_overview_service.py` | **NEW** — Centralized Work Overview aggregation service |
| `backend/app/api/v1/endpoints/work_overview.py` | **NEW** — `GET /work/overview` endpoint |
| `backend/app/api/v1/router.py` | Registered work_overview router at `/work` |
| `backend/tests/api/test_work_overview.py` | **NEW** — 43 tests for next action, workload, classification |

## 4. Work Overview API

### Endpoint
```
GET /api/v1/work/overview
```

### Employee Response (`view: "my_work"`)
```json
{
  "view": "my_work",
  "summary": {
    "overdue": 2,
    "critical": 1,
    "due_today": 3,
    "in_progress": 4,
    "revision_required": 1,
    "waiting_for_review": 2,
    "blocked": 1,
    "upcoming": 5,
    "reviews_for_me": 1
  },
  "next_action": {
    "task_id": "...",
    "title": "Zeva — Instagram Reel #4",
    "status": "in_progress",
    "priority": "high",
    "due_date": "...",
    "action": "continue_work",
    "action_label": "Continue Work",
    "reason": "Due today"
  },
  "needs_attention": [...],
  "today": [...],
  "waiting_for_review": [...],
  "upcoming": [...],
  "reviews_for_me": [...]
}
```

### Manager Response (`view: "team_work"`)
```json
{
  "view": "team_work",
  "summary": {
    "active": 45,
    "overdue": 8,
    "critical": 3,
    "due_today": 12,
    "blocked": 4,
    "awaiting_review": 6,
    "revision_required": 2,
    "at_risk_projects": 3,
    "pending_extensions": 2
  },
  "my_reviews": [...],
  "management_attention": [...],
  "team_workload": [...],
  "overdue_tasks": [...],
  "blocked_tasks": [...],
  "at_risk_projects": [...],
  "pending_extensions": [...]
}
```

## 5. Employee My Work — Classification Rules

### Summary Counts (overlapping dimensions for cards)
- **overdue**: tasks with `due_date < now` and not completed/cancelled
- **critical**: tasks with `priority == critical`
- **due_today**: tasks with `due_date` in today's date range
- **in_progress**: tasks with `status == in_progress`
- **revision_required**: tasks with `status == revision_required`
- **waiting_for_review**: tasks with `status == in_review` (assigned to user)
- **blocked**: tasks with unresolved dependencies
- **upcoming**: tasks with `due_date` in next 7 days (not today)

### Dominant Attention Classification (for task lists — deduped)
Each task appears in exactly one dominant bucket:
1. `revision_required` — highest execution urgency
2. `overdue` — past deadline
3. `critical` — critical priority
4. `due_today` — due today
5. `in_progress` — actively being worked on
6. `upcoming` — due in next 7 days
7. `other` — everything else

## 6. Next Action Algorithm

### Eligible Tasks
- Status must be: `assigned`, `in_progress`, `revision_required`, or legacy `todo` (with assignee)
- Must have `assigned_to` set
- Must NOT be blocked by incomplete dependencies
- Excludes: `completed`, `cancelled`, `in_review`, `approved`

### Priority Order (deterministic, no AI)
| Category | Priority | Tie-breakers |
|---|---|---|
| 0 | Overdue | status_urgency → due_date → priority → created_at → task_id |
| 1 | Critical | status_urgency → due_date → priority → created_at → task_id |
| 2 | Revision Required | status_urgency → due_date → priority → created_at → task_id |
| 3 | Due Today | status_urgency → due_date → priority → created_at → task_id |
| 4 | High Priority | status_urgency → due_date → priority → created_at → task_id |
| 5 | Remaining | status_urgency → due_date → priority → created_at → task_id |

### Status Urgency (within same category)
- `revision_required` = 0 (most urgent)
- `in_progress` = 1
- `assigned` = 2
- `todo` (legacy) = 3

### Action Labels
- `assigned` → "Start Work"
- `in_progress` → "Continue Work"
- `revision_required` → "Fix Revision"
- Other → "Open Task"

### Empty State
If no executable tasks remain: "You're clear for now."

## 7. Manager Team Work — Aggregation Logic

### Scope
- **Manager/Lead**: self + direct/recursive subordinates (existing hierarchy)
- **Admin/Sub-Admin**: all company employees
- **Super Admin**: existing architecture preserved

### Team Summary Counts
- **active**: non-completed, non-cancelled tasks across team
- **overdue**: tasks with `due_date < now`
- **critical**: tasks with `priority == critical`
- **due_today**: tasks due today
- **blocked**: tasks with unresolved dependencies
- **awaiting_review**: tasks in `in_review` status
- **revision_required**: tasks in `revision_required` status
- **at_risk_projects**: projects with `health == at_risk` or `needs_attention`
- **pending_extensions**: extension requests with `status == pending`

### Management Attention Queue (severity-ordered)
1. Critical overdue tasks
2. At-risk projects (from Phase 1 Project Health)
3. Overdue tasks (non-critical)
4. Blocked critical/high-priority tasks
5. Reviews waiting
6. Extension approvals needed
7. Overloaded employees

### Team Workload Table
For each team member:
- `active`, `in_progress`, `due_today`, `overdue`, `blocked`, `waiting_for_review`, `revision_required`, `critical`
- `workload_level`: normal / high / overloaded

## 8. Workload Pressure Thresholds

**Important**: This is WORKLOAD PRESSURE, not performance/utilization.

| Level | Conditions |
|---|---|
| `overloaded` | overdue ≥ 3 OR due_today ≥ 5 OR active ≥ 10 |
| `high` | overdue ≥ 1 OR due_today ≥ 3 OR active ≥ 7 |
| `normal` | Otherwise |

## 9. Permissions

- Backend determines scope based on authenticated user's role
- No arbitrary `user_id`, `manager_id`, or `company_id` query parameters accepted
- Employee sees only their own tasks
- Manager sees only their team (self + subordinates)
- Admin sees company-wide scope
- Cross-company access impossible (company_id enforced at query level)

## 10. Frontend Changes

| File | Change |
|---|---|
| `frontend/src/pages/WorkOverview.jsx` | **NEW** — Role-aware Work Overview page |
| `frontend/src/App.jsx` | Added `/work/overview` route + lazy import |
| `frontend/src/config/navigation.js` | Added "Overview" to Work section + flat nav item |

### Employee UX
- Greeting header ("Good Morning/Afternoon/Evening")
- 8 summary cards (overdue, critical, due today, in progress, revision required, waiting for review, blocked, upcoming)
- Next Action card with CTA
- Needs Attention section
- Today section
- Waiting / Blocked section
- Upcoming (Next 7 Days) section
- Reviews for You section
- Empty state: "You're clear for now."

### Manager UX
- "Team Work" header
- 8 summary cards (active, overdue, critical, due today, blocked, awaiting review, revision required, at-risk projects)
- Management Attention queue (severity-colored cards)
- My Review Queue
- Team Workload table (with workload level badges)
- Overdue Tasks
- Blocked Tasks
- At-Risk Projects (with health reasons)
- Pending Extensions
- Empty state: "No operational issues detected."

### Design
- Uses existing SynTask design system (`border-surface-border`, `bg-surface`, `text-text-primary`)
- `SummaryCard` component with icon, label, value
- `TaskRow` component with status badge, priority color, due date, action CTA
- `AttentionItem` with severity-colored left border
- `WorkloadRow` with workload level badge
- View All links route to existing Tasks/Projects pages with filters
- Responsive: grid cols adapt from 2 (mobile) to 4 (desktop)

## 11. Performance

- **Single bulk query** per user/team for tasks (no N+1)
- **Batch user resolution** for assignee names
- **Batch project resolution** for project names
- **Blocker computation** only for tasks that have dependencies
- **Limited sections** to 10 rows each (not full dataset in UI)
- **Server-side counts** against full authorized dataset
- **No frontend pagination corruption** of summary metrics

## 12. Automated Tests

| Command | Result |
|---|---|
| `pytest tests/api/test_work_overview.py -v` | **43 passed** |
| `pytest tests/api/test_task_workflow_phase2.py -v` | **64 passed** |
| `pytest tests/test_task_service.py -v` | **5 passed** |
| `pytest tests/test_task_health_service.py -v` | **15 passed** |
| `pytest tests/test_task_extension_service.py -v` | **13 passed** |
| `pytest tests/api/test_task_phase5_flow.py -v` | **8 passed** |
| `pytest tests/api/test_project_phase1_foundation.py -v` | **6 passed** |
| Other regression tests | **11 passed** |
| **Total backend** | **165 passed, 0 failed** |
| `npm run build` (frontend) | **✓ built successfully** |

### Test Coverage
- Next Action prioritization (overdue > critical > revision > due_today > high > upcoming)
- Tie-breakers (status_urgency, due_date, priority, created_at, task_id)
- Exclusions (completed, cancelled, in_review, approved, blocked, no assignee)
- Workload pressure thresholds (normal, high, overloaded)
- Date classification (overdue, due_today, upcoming, critical, high_priority)
- Dominant attention classification (dedup rules)
- Action labels (start_work, continue_work, fix_revision)
- Reason generation (overdue days, due today, critical, revision reason)

## 13. Manual Verification

1. Login as Employee → navigate to Work → Overview
2. Verify greeting appears
3. Verify summary cards show correct counts
4. Verify Next Action shows the most urgent executable task
5. Verify blocked tasks do NOT appear as Next Action
6. Verify "View All" links route to Tasks with correct filters
7. Login as Manager → navigate to Work → Overview
8. Verify "Team Work" header appears
9. Verify team workload shows correct per-employee counts
10. Verify management attention queue surfaces overdue/critical/blocked items
11. Verify at-risk projects show Phase 1 health reasons
12. Verify pending extensions show subordinate requests
13. Verify review queue shows tasks where manager is reviewer
14. Test with empty data → verify empty states render correctly

## 14. Regressions

### Phase 1 (Project Foundation)
- Project creation, owner, priority, client relationship, lifecycle, health, board, progress — all unchanged
- Project Health calculation reused for at-risk project detection

### Phase 2 (Task Execution)
- Task creation, assignment, start work, submit review, revision, approval, completion — all unchanged
- Dependencies, blocked enforcement, checklist, comments, attachments, changelog — all unchanged
- Sales follow-up compatibility — unchanged
- Scheduled task compatibility — unchanged
- Quantitative task compatibility — unchanged
- Task Workflow Service untouched

### Dashboard
- Home Dashboard calculations should use shared services (Work Overview centralizes its own counts)
- Dashboard module remains separate and independent

### Tasks / Projects
- Task list, board view, task detail — all unchanged
- Project list, board, detail — all unchanged

## 15. Remaining Issues

- **Frontend tests**: `TaskDetail.helpers.test.js::adds current lead when lead endpoint only returns employees` — pre-existing test failure unrelated to Phase 3
- **Work Overview page uses raw fetch** instead of axios instance — can be migrated to use a proper API client method
- **Project filter routing**: View All links use URL query params; may need adjustments if Tasks page route-state utilities don't fully support all filter params
- **Real-time updates**: Work Overview uses `refetchOnWindowFocus` but does not subscribe to WebSocket events — updates happen on page focus/refresh

## 16. Final Status

**PHASE 3 COMPLETE**

The Work Overview is a role-aware operational control center:
- Employee sees My Work with deterministic Next Action
- Manager sees Team Work with management attention queue
- All calculations server-side against full authorized dataset
- No N+1 query behavior
- Phase 1 and Phase 2 regressions verified
- 165 backend tests passing, frontend builds clean
- PHASE3_WORK_EXPERIENCE_REPORT.md produced
