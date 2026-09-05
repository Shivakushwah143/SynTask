# SynTask Work Module Repair 2 Report

## Root Cause

- Project template generation instantiated and inserted `Task` documents directly, bypassing `TaskService`, and stored dependency objects instead of canonical task ID strings.
- Template generation had no stable task marker and relied on ProjectService pre-checks, so concurrent submissions could race into duplicate task sets.
- Deadline-extension Work Requests changed only the Work Request status and did not invoke the existing Task Extension workflow.
- Work Request conversion used a read-then-create sequence without an atomic claim.
- Request IDs were generated from a tenant/year count, which was vulnerable to concurrent duplicate allocation.
- Weekly recurrence searched for the next matching weekday inside a multi-week window, so `interval=2` could still fire after seven days. Retried occurrences had no occurrence-specific task marker.

## Files Changed

- `backend/app/models/task.py`
- `backend/app/models/work_request.py`
- `backend/app/services/task_service.py`
- `backend/app/services/project_template_service.py`
- `backend/app/services/work_request_service.py`
- `backend/app/services/scheduling_service.py`
- `backend/tests/test_work_repair_2.py`
- `backend/tests/api/test_work_requests_scheduled_phase4.py`
- `backend/API_DOCUMENTATION.md`
- `docs/user-flows/projects-tasks.md`

## Exact Fixes

- Added checklist, dependency, and project-completion fields to `TaskService.create_task_core`; templates now create every generated task through that service, preserving normal assignment, reviewer, permission, notification, health, and workflow setup.
- Preserved each template task's relative start and due dates through the shared TaskService parser.
- Template dependency references are topologically ordered and resolved to generated task ID strings. Cycles are rejected.
- Added a unique sparse source-marker index for generated template/scheduled tasks. Template generation recovers duplicate project/task unique-key races and returns the existing complete set on repeat submission.
- Approved deadline-extension requests create and approve a canonical `TaskExtensionRequest` through `review_extension_request`; the Work Request stores the extension link. Rejection does not touch the task deadline. Production approval uses an atomic deadline-extension claim.
- Added an atomic Mongo conversion claim with explicit in-progress state. Concurrent conversion creates one target; later callers return the existing target or receive an in-progress conflict before another target can be created.
- Replaced count-based request IDs with UUID-backed `REQ-YYYY-XXXXXXXXXXXX` identifiers.
- Fixed weekly recurrence intervals greater than one to advance by whole week cycles, preserving local timezone wall-clock calculation before UTC persistence.
- Added occurrence-specific recurring-task linkage and occurrence locking/reuse so worker retries do not create a second task for the same occurrence.

## Tests Executed

- `pytest -q tests/test_work_repair_2.py` — 8 passed.
- `pytest -q tests/test_work_repair_2.py tests/api/test_work_requests_scheduled_phase4.py tests/api/test_task_workflow_phase2.py tests/api/test_work_module_e2e.py` — 138 passed.
- Changed-file diagnostics — no errors reported.
- `git diff --check` — passed.

The test environment emitted two existing Pydantic deprecation warnings. No test failures occurred.

## Unresolved Blockers

No code blocker remains. The concurrency tests use deterministic persistence doubles; a live MongoDB deployment was not available in this test run, so production atomic claims and unique indexes should also be exercised in the deployment integration gate.

REPAIR 2 COMPLETE
