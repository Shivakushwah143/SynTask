"""Automatic carry forward of passed task due dates.

`Task.due_date` is never rewritten. It stays the original commitment that task
health, the Tasks workspace Overdue attention filter, overdue reports, and
at-risk project analysis read, so lateness stays observable no matter how long
a task slips. Carry forward moves only the *effective* deadline
(`carry_forward_due_date`) to the current day, and accumulates how far and how
often that happened so the slip is visible rather than silent.

Two paths apply it and both call the same idempotent check, so they can never
double count:

* :func:`run_task_carry_forward_loop` — the authoritative daily background job
  (leader-gated across API workers, same pattern as the deadline checker).
* :func:`carry_forward_tasks` — a lazy catch-up on task reads, so a list or
  detail request cannot show a stale effective deadline if the job has not run
  yet, or if a task became due between two job runs.

This runs for every open task with no approval step, which is a deliberate
contrast to :mod:`app.services.task_health_service`'s explicit extension
request/approval flow. Extension approval still moves the real commitment and
bumps `extension_count`; carry forward never touches either.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, time
from typing import Any, Dict, Iterable, Optional

from app.core.clock import utc_now
from app.models.task import Task, TaskStatus
from app.models.timeline import TimelineEventType, TimelineModule
from app.services.timeline_service import create_timeline_event

logger = logging.getLogger(__name__)

# Every status except the two terminal ones. A completed or cancelled task has
# no live deadline to carry, and its due date is history.
CLOSED_TASK_STATUSES = {TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value}

BATCH_SIZE = 500


def _status_value(task: Task) -> str:
    return str(getattr(getattr(task, "status", ""), "value", getattr(task, "status", "")))


def _as_day(value: Optional[datetime]) -> Optional[date]:
    return value.date() if isinstance(value, datetime) else None


def carry_forward_state(task: Task, now: Optional[datetime] = None) -> Optional[Dict[str, Any]]:
    """Describe the carry forward this task needs right now, or ``None``.

    Returns ``None`` when the task is closed, has no deadline, is not yet past
    its deadline, or has already been carried forward today. That last case is
    what makes the daily job and the lazy read path idempotent: running both, or
    running either twice in one day, applies at most one carry per task per day.
    """
    now = now or utc_now()
    if _status_value(task) in CLOSED_TASK_STATUSES:
        return None
    due_day = _as_day(getattr(task, "due_date", None))
    if due_day is None:
        return None
    today = now.date()
    if due_day >= today:
        return None
    current_due_day = _as_day(getattr(task, "carry_forward_due_date", None)) or due_day
    if current_due_day >= today:
        return None
    return {
        "original_due_date": due_day,
        "previous_effective_due_date": current_due_day,
        "effective_due_date": today,
        "days": (today - current_due_day).days,
        "total_days_late": (today - due_day).days,
    }


async def carry_forward_task(task: Task, now: Optional[datetime] = None) -> Optional[Dict[str, Any]]:
    """Apply one carry forward step to a task. Returns the step, or ``None``.

    Only the effective deadline and the carry forward counters change; the task
    keeps its status, health, assignee, and original due date.
    """
    now = now or utc_now()
    step = carry_forward_state(task, now)
    if not step:
        return None

    effective = datetime.combine(step["effective_due_date"], time.min)
    task.carry_forward_due_date = effective
    task.carry_forward_days = int(getattr(task, "carry_forward_days", 0) or 0) + int(step["days"])
    task.carry_forward_count = int(getattr(task, "carry_forward_count", 0) or 0) + 1
    task.carry_forward_last_at = now
    task.updated_at = now
    await task.save()

    try:
        await create_timeline_event(
            user_id=task.assigned_to or task.created_by,
            company_id=task.company_id,
            event_type=TimelineEventType.TASK_CARRIED_FORWARD,
            title="Task Carried Forward",
            description=task.title,
            related_module=TimelineModule.TASK,
            related_record_id=str(task.id),
            timestamp=now,
            metadata={
                "task_title": task.title,
                "project_id": getattr(task, "project_id", None),
                "original_due_date": step["original_due_date"].isoformat(),
                "previous_effective_due_date": step["previous_effective_due_date"].isoformat(),
                "effective_due_date": step["effective_due_date"].isoformat(),
                "carry_forward_days": task.carry_forward_days,
                "carry_forward_count": task.carry_forward_count,
            },
            # One event per task per day, however many times the paths overlap.
            idempotency_key=f"task:{task.id}:carried_forward:{step['effective_due_date'].isoformat()}",
        )
    except Exception as exc:  # pragma: no cover - timeline is best effort
        logger.warning("Carry forward timeline event failed for task %s: %s", task.id, exc)

    return {**step, "carry_forward_days": task.carry_forward_days, "carry_forward_count": task.carry_forward_count}


async def carry_forward_tasks(tasks: Iterable[Task], now: Optional[datetime] = None) -> int:
    """Lazy catch-up for an already-loaded page of tasks.

    A no-op for tasks that need nothing, so a read stays write-free unless a
    deadline genuinely passed since the last run.
    """
    applied = 0
    for task in tasks:
        try:
            if await carry_forward_task(task, now):
                applied += 1
        except Exception as exc:  # pragma: no cover - one bad task must not fail a read
            logger.error("Carry forward failed for task %s: %s", getattr(task, "id", None), exc)
    return applied


async def carry_forward_all(now: Optional[datetime] = None, batch_size: int = BATCH_SIZE) -> int:
    """Carry forward every open, past-due task. Returns how many were carried.

    Iterates by `_id` rather than by the deadline filter, because a carried task
    keeps its original `due_date` and would otherwise match forever.
    """
    now = now or utc_now()
    today = now.date()
    cutoff = datetime.combine(today, time.min)
    query: Dict[str, Any] = {
        "due_date": {"$lt": cutoff},
        "status": {"$nin": list(CLOSED_TASK_STATUSES)},
    }
    processed = 0
    last_id = None
    while True:
        page_query = dict(query)
        if last_id is not None:
            page_query["_id"] = {"$gt": last_id}
        batch = await Task.find(page_query).sort("_id").limit(batch_size).to_list()
        if not batch:
            break
        processed += await carry_forward_tasks(batch, now)
        last_id = batch[-1].id
        if len(batch) < batch_size:
            break
    return processed


async def run_task_carry_forward_loop() -> None:
    """Periodic background loop (daily), leader-gated across API workers."""
    from app.core.leader import try_acquire_leader

    while True:
        if not await try_acquire_leader("task_carry_forward", ttl_seconds=60 * 60):
            await asyncio.sleep(60 * 60)
            continue
        try:
            processed = await carry_forward_all()
            if processed:
                logger.info("Task carry forward processed %d tasks", processed)
            # Daily sweep; lazy read-time catch-up covers the gaps.
            await asyncio.sleep(24 * 60 * 60)
        except Exception as exc:
            logger.error("Task carry forward failed and will retry: %s", exc)
            await asyncio.sleep(60 * 60)
