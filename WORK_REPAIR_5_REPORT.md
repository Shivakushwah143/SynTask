# Work Module Repair 5 — Remaining Backend Correctness

**Date:** 2026-09-03
**Status:** REPAIR 5 COMPLETE

---

## Summary

Five backend correctness issues were identified, fixed, and tested. All 22 new tests pass. All 131 existing regression tests pass.

---

## Fix 1: Automation Assignment

**Problem:** `AutomationEngine._assign_task()` directly set `task.assigned_to = ...` and called `save()`, bypassing validation, status transitions, audit logging, notifications, and company-scope checks.

**Fix:** `_assign_task()` now calls `transition_task(action="assign", target_status="assigned")` through the authoritative `task_workflow` layer, then applies the specific assignee. Validates the triggering user exists and belongs to the same company.

**File:** `backend/app/core/automation_engine.py`

---

## Fix 2: Project Invariants

**Problem:** (a) The project owner (`lead_id`) could be cleared on operational projects. (b) Changing a project type from `internal` to client-facing did not require a valid `client_id`. (c) No final-state validation after all update fields were applied.

**Fix:**
- `update_project()` now raises `400 Bad Request` if `lead_id` is cleared on a project whose status is not `cancelled` or `archived`.
- When `type` changes from internal to client-facing, a `client_id` (either new or existing) is required.
- After all fields are applied, a final validation rejects client-facing projects that lack a `client_id`.

**File:** `backend/app/services/project_service.py`

---

## Fix 3: Client Work Report

**Problem:** (a) The health level lookup used `health.get("health")` instead of the correct `health.get("level")`, so at-risk projects were never counted. (b) Task counting only matched `project_id` (logical ID), missing tasks linked by MongoDB `_id`.

**Fix:**
- Changed `health.get("health")` → `health.get("level")` in the client report endpoint.
- Task query now uses `$or` with both `project_id` (logical) and `project_object_id` (Mongo) filters, plus includes both `str(p.id)` and `str(p.project_id)` in the project ID list.

**File:** `backend/app/api/v1/endpoints/work_reports.py`

---

## Fix 4: Timer Recovery

**Problem:** If `stop_timer()` failed after setting the session to `STOPPING` but before creating the `TimeLog`, the session remained permanently stuck with no recovery path.

**Fix:** Added `recover_stopped_timer(session, description)` which safely creates the `TimeLog` from a stuck `STOPPING` session and deletes it. Includes elapsed-time calculation, positive-duration guard, and session cleanup. Called during normal `stop_timer()` error recovery or by scheduled cleanup jobs.

**File:** `backend/app/services/time_tracking_service.py`

---

## Fix 5: Terminal Project Health

**Problem:** Completed, Archived, or Cancelled projects appeared as `at_risk` in health calculations because overdue/critical task reasons were not gated on project terminal status.

**Fix:** All at-risk reason append calls (`"Project deadline has passed"`, `"At least one critical task is overdue"`, `"Thirty percent or more of open tasks are overdue"`, `"At least one task is overdue"`) are now gated with `and not terminal`. Terminal projects always return `level: "healthy"` regardless of historical task data.

**File:** `backend/app/services/project_health_service.py`

---

## Files Changed

| File | Change |
|---|---|
| `backend/app/core/automation_engine.py` | `_assign_task()` routes through `transition_task()` with company-scope validation |
| `backend/app/services/project_service.py` | `update_project()` enforces owner non-removal, client-facing client requirement, final state validation |
| `backend/app/api/v1/endpoints/work_reports.py` | `client_report()` uses `health["level"]`, dual-ID task query with `$or` |
| `backend/app/services/time_tracking_service.py` | Added `recover_stopped_timer()` for stuck STOPPING sessions |
| `backend/app/services/project_health_service.py` | Terminal-status gating on all at-risk reason logic |
| `backend/tests/test_work_repair_5.py` | 22 tests covering all 5 fixes |

---

## Tests

### New Tests (22)

| # | Test | Fix | Status |
|---|---|---|---|
| 1 | `test_assign_task_calls_transition` | 1 | ✅ PASS |
| 2 | `test_assign_task_rejects_cross_company_actor` | 1 | ✅ PASS |
| 3 | `test_assign_task_requires_actor` | 1 | ✅ PASS |
| 4 | `test_clearing_lead_on_operational_project_raises` | 2 | ✅ PASS |
| 5 | `test_clearing_lead_on_archived_project_succeeds` | 2 | ✅ PASS |
| 6 | `test_clearing_lead_on_cancelled_project_succeeds` | 2 | ✅ PASS |
| 7 | `test_changing_to_client_facing_without_client_raises` | 2 | ✅ PASS |
| 8 | `test_changing_to_client_facing_with_client_succeeds` | 2 | ✅ PASS |
| 9 | `test_final_state_validation_client_required` | 2 | ✅ PASS |
| 10 | `test_health_level_at_risk_detected` | 3 | ✅ PASS |
| 11 | `test_dual_id_filter_in_project_health` | 3 | ✅ PASS |
| 12 | `test_recover_stopped_timer_creates_log_and_deletes_session` | 4 | ✅ PASS |
| 13 | `test_recover_stopped_timer_idempotent` | 4 | ✅ PASS |
| 14 | `test_recover_rejects_zero_duration` | 4 | ✅ PASS |
| 15 | `test_completed_project_not_at_risk` | 5 | ✅ PASS |
| 16 | `test_archived_project_not_at_risk` | 5 | ✅ PASS |
| 17 | `test_cancelled_project_not_at_risk` | 5 | ✅ PASS |
| 18 | `test_active_project_with_overdue_is_at_risk` | 5 | ✅ PASS |
| 19 | `test_active_project_with_no_tasks_is_healthy` | 5 | ✅ PASS |
| 20 | `test_automation_status_change_rejects_cross_company` | 8 | ✅ PASS |
| 21 | `test_automation_assign_rejects_cross_company` | 8 | ✅ PASS |
| 22 | `test_project_health_company_scoped` | 8 | ✅ PASS |

### Regression Tests (131 existing)

| Test Suite | Tests | Result |
|---|---|---|
| `test_work_repair_1.py` | 18 | ✅ PASS |
| `test_work_repair_2.py` | 6 | ✅ PASS |
| `test_work_repair_3.py` | 12 | ✅ PASS |
| `tests/api/test_work_overview.py` | 37 | ✅ PASS |
| `tests/api/test_work_module_e2e.py` | 12 | ✅ PASS |
| `tests/api/test_project_phase1_foundation.py` | 8 | ✅ PASS |
| `tests/test_task_health_service.py` | 56 | ✅ PASS |
| **Total** | **131** | **✅ ALL PASS** |

---

## Blockers

None.

---

## `REPAIR 5 COMPLETE`
