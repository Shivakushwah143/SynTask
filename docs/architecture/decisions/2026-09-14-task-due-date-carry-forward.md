# Task due dates carry forward without losing overdue

## Status

Accepted — implemented 2026-09-14.

## Context

Open tasks that pass their deadline previously kept that deadline indefinitely, so the effective deadline for an unfinished task stayed in the past and every later period showed the same task as overdue forever. Supervisors asked for the deadline to move to the current day and to carry a visible "carry forwarded by N days" tag that grows with every further adjustment.

Moving `due_date` itself would silently destroy SynTask's lateness signal. `Task.due_date` is read by `TaskHealthStatus.OVERDUE` (`calculate_task_health`), the Tasks workspace `overdue`/`due_today` attention filters and `status-summary` counters, `?attention=overdue` deep links, `build_overdue_task_summary`, overdue timeline events and reminders, at-risk project analysis, and the Work Overview monitoring projection's period windows. Rewriting it would also rewrite history: past-period reports would change after the fact, and `TaskExtensionRequest` approval — the audited, approval-gated way to move a commitment — would become meaningless.

## Decision

Carry forward moves only an **effective** deadline. `Task.due_date` remains the original commitment and is never touched.

- `carry_forward_due_date` holds the effective deadline (midnight of the day carried), `carry_forward_days` accumulates every day moved, `carry_forward_count` counts adjustments, and `carry_forward_last_at` records the last one.
- A task is carried when it is open (not `completed`/`cancelled`), has a `due_date` in the past, and has not already been carried that day. `carry_forward_days` grows by one per further day an open task stays past its original deadline, so the carried value always increases.
- **Two idempotent paths, one check.** `run_task_carry_forward_loop` is the authoritative daily background job (leader-gated through `try_acquire_leader`, the pattern already used by the deadline checker and HR document expiry). `carry_forward_tasks` is a lazy catch-up on task list and detail reads, bounded to the returned page, so a view cannot show a stale deadline if the job has not run yet. The same per-task, per-day guard makes running both safe.
- **Monitoring stays read-only.** The Work Overview projection reads the carry-forward fields and never applies them, preserving its documented no-write invariant. Its period windows keep keying on `due_date`, so a carried task remains in the period it was originally due in.
- Each adjustment records a `task_carried_forward` timeline event keyed per task per day.

## Alternatives considered

- **Rewrite `due_date` and add `original_due_date`.** Matches the request most literally, but permanently zeroes the overdue signal and rewrites historical reporting.
- **Rewrite `due_date` and report overdue from counters.** Keeps an overdue signal, but requires redirecting every overdue query, health calculation, report, and reminder to a new source — a large, risky change across modules that were not part of this request.
- **Fold carry forward into the existing extension workflow.** Rejected for now: extensions are requested by the assignee and approved by a manager, whereas carry forward was requested as an automatic adjustment. The two coexist, and approval still moves the real commitment and bumps `extension_count`.
- **Lazy only, no job.** Cheaper operationally, but the data would only move when something reads it, so tenants that never open the page would drift.

## Consequences

- Lateness and the carried deadline are both visible, and the carried value grows with every adjustment as required.
- Every open past-due task is carried automatically with no approval step and no notification. Assignees are not told their deadline moved; the activity timeline records it. Notifying assignees and per-company opt-out are deliberate follow-ups, not current behavior.
- The daily job writes one document update and one timeline event per carried task per day. A long-overdue tenant produces one event per task per day, which the Work Overview Activity tab reflects.
- Because `due_date` is untouched, no overdue query, report, health value, reminder, or monitoring period window changes behavior.
- New fields default on read, so existing documents need no migration and no index is added; the job query reuses the existing `(company_id, due_date)` index.

## Migration and rollback

No backfill is required: fields are absent until a task's first carry forward, and `carry_forward_due_date` falls back to `due_date` when computing the next step. Rolling back is additive-safe — stop starting the loop in `app/main.py` and remove the read-time call; the stored fields become inert metadata and no task deadlines are affected, because `due_date` was never modified. To reverse an already-applied carry forward, clear the four carry-forward fields on the affected tasks and delete their `task_carried_forward` timeline events.

## Verification

- `backend/tests/test_task_carry_forward.py` covers the step calculation, that a task due today or later is never carried, that a second run on the same day is a no-op, day-over-day accumulation of `carry_forward_days`/`count`, skipped closed and undated tasks, the per-day timeline idempotency key, and batch counting.
- Verified against the development database: a task due 2026-08-02 produced `carry_forward_days=43`, `carry_forward_count=1`, effective deadline 2026-09-14, with `due_date` unchanged; a second same-day run changed nothing; the next day added one day.
- Verified that carried tasks still report `overdue` in the monitoring projection and still fall inside their original period window.
