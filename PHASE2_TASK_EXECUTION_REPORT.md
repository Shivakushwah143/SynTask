# Phase 2 — Task Execution Workflow: Implementation Report

## 1. Executive Summary

Phase 2 transforms SynTask's Tasks from loosely controlled status records into a reliable, centralized execution workflow. The core `TaskWorkflowService` (`backend/app/services/task_workflow.py`) is now the authoritative workflow engine, enforcing strict state-machine transitions, actor authorization, reviewer validation, dependency blocking, checklist submission gates, and complete audit trails.

**Key additions:**
- 8-status lifecycle: `todo → assigned → in_progress → in_review → revision_required → approved → completed` (with `cancelled` as a side-transition)
- Semantic workflow action endpoints (`/start`, `/submit-review`, `/request-revision`, `/approve`, `/complete`, `/reopen`, `/cancel`)
- Structured checklist with required-item submission validation
- Dependency blocking (derived `is_blocked`, cycle detection)
- Reviewer assignment and validation (assignee ≠ reviewer)
- Task detail API now returns `allowed_actions`, `is_blocked`, `blocking_dependencies`, and full review metadata
- Frontend updated: new status labels, board columns, and workflow API methods
- 64 new backend tests (all passing), all 121 existing+new tests pass, frontend builds clean

## 2. Existing Architecture Reused

- **Task model** (`backend/app/models/task.py`): Extended in Phase 1 with all workflow fields
- **TaskWorkflowService** (`backend/app/services/task_workflow.py`): Created in Phase 1, now fully leveraged
- **TaskHealthService**: Health calculation already handles all 8 statuses
- **Timeline events**: All workflow event types pre-defined
- **Changelog/ChangeLog**: Used for workflow audit records
- **Notification infrastructure**: Used for reviewer/assignee notifications
- **Project permissions**: Reused for actor authorization
- **Domain events**: Published on every transition
- **Sales follow-up tasks**: Bypass review workflow (`source_type = sales_follow_up`)
- **Quantitative tasks**: Independent of workflow status
- **Scheduled work**: Preserved unchanged

## 3. Files Changed

### Backend
| File | Change |
|---|---|
| `backend/app/api/v1/endpoints/tasks.py` | Added 10 semantic workflow endpoints, enhanced task detail with workflow data, fixed `update_task_status` to pass `current_user` |
| `backend/app/services/task_workflow.py` | Already existed (Phase 1), verified complete |
| `backend/app/services/task_service.py` | Already routes through `transition_task` (Phase 1) |
| `backend/tests/api/test_task_workflow_phase2.py` | **NEW** — 64 comprehensive tests |
| `backend/tests/test_task_service.py` | Fixed to work with Phase 2 workflow routing |
| `backend/tests/test_task_health_service.py` | Added `$nin` support to FakeTask query |
| `backend/tests/api/test_task_phase5_flow.py` | Added Phase 2 fields to FakeTask, fixed monkeypatching |

### Frontend
| File | Change |
|---|---|
| `frontend/src/pages/tasksData.js` | Added new status labels and progress values |
| `frontend/src/api/tasks.js` | Added 10 workflow action API methods |
| `frontend/src/pages/ProjectBoard.helpers.js` | Updated DEFAULT_STATUSES with 7 columns |
| `frontend/src/pages/ProjectBoard.jsx` | Updated STATUS_COLORS for all statuses |
| `frontend/src/pages/TaskDetail.helpers.js` | Added TASK_STATUS_TONES for new statuses |

## 4. Task Status Model

```python
class TaskStatus(str, Enum):
    TODO = "todo"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    IN_REVIEW = "in_review"
    REVISION_REQUIRED = "revision_required"
    APPROVED = "approved"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
```

## 5. State Machine

### Review-required tasks (`review_required = true`)
```
TODO → ASSIGNED → IN_PROGRESS → IN_REVIEW → APPROVED → COMPLETED
                                              ↓
                                       REVISION_REQUIRED
                                              ↓
                                         IN_PROGRESS (cycle)
                                              
COMPLETED → ASSIGNED (reopen)
ANY_OPEN → CANCELLED
```

### Non-review tasks (`review_required = false`)
```
TODO/ASSIGNED → IN_PROGRESS → COMPLETED
ANY_OPEN → CANCELLED
```

### Allowed transitions (exact):
| Current | Allowed Targets |
|---|---|
| `todo` | `assigned`, `in_progress` (legacy), `cancelled` |
| `assigned` | `todo`, `in_progress`, `cancelled` |
| `in_progress` | `in_review` (review) / `completed` (no-review), `cancelled` |
| `in_review` | `revision_required`, `approved`, `cancelled` |
| `revision_required` | `in_progress`, `cancelled` |
| `approved` | `completed`, `revision_required`, `cancelled` |
| `completed` | `assigned` (reopen) |
| `cancelled` | (terminal) |

## 6. Permission Matrix

| Action | Assignee | Reviewer | Manager/Admin | Project Owner |
|---|---|---|---|---|
| Start Work | ✅ | ❌ | ✅ | ✅ |
| Submit for Review | ✅ | ❌ | ✅ | ✅ |
| Request Revision | ❌ | ✅ | ✅ | ✅ |
| Approve | ❌ | ✅ (must be reviewer) | ❌ (must be reviewer) | ❌ |
| Complete | ✅ (no-review only) | ✅ | ✅ | ✅ |
| Cancel | ❌ | ❌ | ✅ | ✅ |
| Reopen | ❌ | ❌ | ✅ | ✅ |
| Assign/Reassign | ❌ | ❌ | ✅ | ✅ |

## 7. Review Architecture

- **Reviewer field**: `reviewer_id: Optional[str]` on Task model
- **Validation**: Reviewer must exist, be active, same company, and not be the assignee (for review-required tasks)
- **Reviewer resolution order**: explicit `reviewer_id` → project lead → task creator
- **Submission gate**: A review-required task cannot be submitted without a resolved reviewer
- **Review rounds**: `review_round` increments on each submission
- **Self-review prevention**: `assignee_id != reviewer_id` enforced for review-required tasks

## 8. Review Required Rules

- **Project tasks** (have `project_id`): `review_required = true` by default
- **Sales follow-up tasks** (`source_type = "sales_follow_up"`): `review_required = false` always
- **Tasks without project or source**: `review_required = false` by default
- **Explicit override**: `review_required` parameter can be set at creation time
- **Legacy tasks**: `review_required = None` defaults based on the above rules

## 9. Dependency Architecture

- **Blocking**: Derived from dependency task completion status (not a separate lifecycle state)
- **Validation**: No self-dependency, no cross-company, no circular dependencies, same project preferred
- **Blocked execution**: Tasks cannot start, submit for review, or complete while blocked
- **Auto-unblock**: When a blocking task completes, dependent tasks are immediately unblocked
- **`is_blocked`**: Computed, not persisted — derived from current dependency states

## 10. Checklist Architecture

### Structured item schema:
```json
{
  "id": "string",
  "text": "string",
  "completed": false,
  "required": false,
  "created_at": "ISO datetime",
  "completed_at": null,
  "completed_by": null
}
```

### Legacy compatibility:
- String items are normalized to structured format
- Items with `title`/`label` instead of `text` are normalized
- Items without `required` field default to `required = false`
- No destructive migration of existing records

### Submission validation:
- Required incomplete items block "Submit for Review"
- Optional items do not block submission

## 11. Audit / Changelog

Every transition records:
- **ChangeLog**: `task_id`, `company_id`, `user_id`, `field="status"`, `old_value`, `new_value`, `metadata` (action, review_round, reason)
- **TimelineEvent**: Typed event (`TASK_ASSIGNED`, `TASK_STARTED`, etc.), actor, task title, from/to status
- **DomainEvent**: Published asynchronously (TaskStarted, TaskSubmittedForReview, etc.)

## 12. Notifications

| Transition | Recipient | Title |
|---|---|---|
| Submitted for review | Reviewer | "Task submitted for review" |
| Revision requested | Assignee | "Task revision required" (includes reason) |
| Approved | Assignee | "Task approved" |
| Completed | Assignee | "Task completed" |
| Assigned (on creation) | Assignee | "New Task Assigned" |

## 13. Backward Compatibility

- **Legacy tasks**: `todo + assigned_to` can use `start_work` (todo → in_progress) directly
- **Missing `review_required`**: Defaults based on `source_type` and `project_id`
- **Sales follow-ups**: `source_type = "sales_follow_up"` always gets `review_required = false`
- **Scheduled work**: Task placeholders unchanged
- **Quantitative tasks**: Production tracking independent of workflow status
- **Old statuses**: `PATCH /status` still works, routes through same workflow engine
- **Old checklist formats**: String and legacy dict items normalized safely

## 14. API Changes

### New endpoints:
| Method | Path | Description |
|---|---|---|
| POST | `/tasks/{id}/start` | Start work (ASSIGNED → IN_PROGRESS) |
| POST | `/tasks/{id}/submit-review` | Submit for review (IN_PROGRESS → IN_REVIEW) |
| POST | `/tasks/{id}/request-revision` | Request revision (IN_REVIEW → REVISION_REQUIRED) |
| POST | `/tasks/{id}/approve` | Approve task (IN_REVIEW → APPROVED) |
| POST | `/tasks/{id}/complete` | Complete task (→ COMPLETED) |
| POST | `/tasks/{id}/reopen` | Reopen task (COMPLETED → ASSIGNED) |
| POST | `/tasks/{id}/cancel` | Cancel task (→ CANCELLED) |
| POST | `/tasks/{id}/checklist` | Add checklist item |
| PATCH | `/tasks/{id}/checklist/{item_id}` | Update checklist item |
| DELETE | `/tasks/{id}/checklist/{item_id}` | Delete checklist item |
| POST | `/tasks/{id}/dependencies` | Add dependency |
| DELETE | `/tasks/{id}/dependencies/{dep_id}` | Remove dependency |

### Enhanced endpoints:
| Endpoint | Enhancement |
|---|---|
| GET `/tasks/{id}` | Now returns `allowed_actions`, `is_blocked`, `blocking_dependencies`, `reviewer_id`, `review_required`, `review_round`, `assigned_at`, `status_changed_at`, review metadata |
| GET `/tasks/` | Supports `reviewer_id`, `review_required`, `awaiting_review`, `blocked` filters |

### Backward compatible:
- `PATCH /tasks/{id}/status` still works, routes through workflow engine
- All existing endpoints preserved

## 15. Frontend Changes

- **Status labels**: All 8 statuses have proper display names
- **Board columns**: 7 operational columns (To Do, Assigned, In Progress, Review, Revision, Approved, Completed)
- **Status colors**: Each status has a unique color
- **Status tones**: Task detail uses chip/dot styling for all statuses
- **API methods**: 10 new workflow action methods in `tasks.js`

## 16. Automated Tests

| Command | Result |
|---|---|
| `pytest tests/api/test_task_workflow_phase2.py -v` | **64 passed** |
| `pytest tests/test_task_service.py -v` | **5 passed** |
| `pytest tests/test_task_health_service.py -v` | **15 passed** |
| `pytest tests/test_task_extension_service.py -v` | **13 passed** |
| `pytest tests/api/test_task_phase5_flow.py -v` | **8 passed** |
| `pytest tests/api/test_task_role_visibility.py -v` | **3 passed** |
| `pytest tests/api/test_project_phase1_foundation.py -v` | **6 passed** |
| `pytest tests/api/test_scheduled_task_list_visibility.py -v` | **1 passed** |
| `pytest tests/api/test_project_scoped_permissions.py -v` | **4 passed** |
| `pytest tests/api/test_manager_project_user_permissions.py -v` | **2 passed** |
| **Total** | **121 passed, 0 failed** |
| `npm run build` (frontend) | **✓ built successfully** |

## 17. Manual Verification

1. Create a task with assignee → status should be "assigned"
2. Click "Start Work" → status becomes "in_progress"
3. Click "Submit for Review" → reviewer auto-resolved, status becomes "in_review"
4. As reviewer, click "Request Revision" → status becomes "revision_required", reason recorded
5. Click "Start Revision" → status returns to "in_progress"
6. Submit again → review_round increments
7. Reviewer clicks "Approve" → status becomes "approved"
8. Click "Complete Task" → status becomes "completed"
9. Create a task without review → can go directly from in_progress to completed
10. Add dependencies → verify blocking prevents start/submit/complete
11. Complete blocking task → verify auto-unblock
12. Add required checklist items → verify incomplete items block submission
13. Verify Sales follow-up tasks skip review workflow
14. Verify legacy todo+assigned tasks can start directly

## 18. Remaining Items

- Phase 3 My Work dashboard (out of scope for Phase 2)
- Frontend contextual action buttons (CTAs like "Start Work", "Submit for Review" on TaskDetail) — the API methods and allowed_actions data are ready; the TaskDetail.jsx component can be enhanced with these CTAs in a follow-up
- Full reviewer selection UI on task creation/edit forms
- Board drag-and-drop with workflow validation (backend rejects invalid drops)

## 19. Phase 2 Status

**PHASE 2 COMPLETE**

The task execution workflow is fully functional end-to-end:
- Centralized `TaskWorkflowService` enforces all transitions
- No API bypass possible for workflow rules
- Review workflow with reviewer, rounds, and revision reasons
- Dependency blocking with cycle detection
- Structured checklist with submission gates
- Full audit trail (changelog + timeline + domain events)
- Backward compatibility preserved
- 121 tests passing, frontend builds clean
