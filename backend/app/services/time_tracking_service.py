from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import HTTPException, status
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.core.clock import parse_to_utc, utc_now
from app.models.project import Project, ProjectStatus
from app.models.task import Task, TaskStatus
from app.models.time_tracking import ActiveTimeSession, ActiveTimeSessionStatus, TimeLog, TimeLogSource, TimeTrackingSummary
from app.models.user import User, UserRole
from app.services.project_permissions import load_task_project
from app.services.task_workflow import assert_not_blocked, normalize_status, transition_task

MAX_MANUAL_HOURS_PER_ENTRY = 24


def elapsed_seconds(session: ActiveTimeSession, now: Optional[datetime] = None) -> int:
    now = now or utc_now()
    seconds = int(session.accumulated_seconds or 0)
    if session.status == ActiveTimeSessionStatus.RUNNING and session.last_resumed_at:
        seconds += max(0, int((now - parse_to_utc(session.last_resumed_at)).total_seconds()))
    return seconds


def serialize_session(session: ActiveTimeSession) -> dict[str, Any]:
    now = utc_now()
    return {
        "id": str(session.id),
        "company_id": session.company_id,
        "user_id": session.user_id,
        "task_id": session.task_id,
        "project_id": session.project_id,
        "client_id": session.client_id,
        "status": session.status.value if hasattr(session.status, "value") else session.status,
        "started_at": session.started_at,
        "last_resumed_at": session.last_resumed_at,
        "paused_at": session.paused_at,
        "accumulated_seconds": session.accumulated_seconds,
        "elapsed_seconds": elapsed_seconds(session, now),
        "server_time": now,
    }


async def _update_summary_and_task(time_log: TimeLog, delta_hours: float) -> None:
    summary = await TimeTrackingSummary.find_one({"task_id": time_log.task_id, "company_id": time_log.company_id})
    if not summary:
        summary = TimeTrackingSummary(task_id=time_log.task_id, company_id=time_log.company_id)
        await summary.insert()
    summary.total_hours = max(0, float(summary.total_hours or 0) + delta_hours)
    if time_log.is_billable:
        summary.total_billable_hours = max(0, float(summary.total_billable_hours or 0) + delta_hours)
    summary.total_entries = max(0, int(summary.total_entries or 0) + (1 if delta_hours >= 0 else -1))
    summary.last_logged_at = utc_now()
    summary.updated_at = utc_now()
    await summary.save()

    task = await Task.get(time_log.task_id)
    if task:
        task.actual_hours = max(0, float(task.actual_hours or 0) + delta_hours)
        await task.save()


async def _load_task_for_time(task_id: str, actor: User) -> tuple[Task, Optional[Project]]:
    task = await Task.get(task_id)
    if not task or str(task.company_id) != str(actor.company_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    project = await load_task_project(task, actor)
    if project and str(project.company_id) != str(actor.company_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task, project


def _assert_project_allows_work(project: Optional[Project]) -> None:
    if not project:
        return
    project_status = getattr(project.status, "value", project.status)
    if project_status in {ProjectStatus.ARCHIVED.value, ProjectStatus.CANCELLED.value, ProjectStatus.COMPLETED.value}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project does not allow new work")


async def start_timer(task_id: str, actor: User) -> ActiveTimeSession:
    task, project = await _load_task_for_time(task_id, actor)
    if str(task.assigned_to or "") != str(actor.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only track time on assigned tasks")
    if normalize_status(task.status) in {TaskStatus.COMPLETED, TaskStatus.CANCELLED}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Completed or cancelled tasks cannot start timers")
    _assert_project_allows_work(project)
    await assert_not_blocked(task)

    existing = await ActiveTimeSession.find_one({"company_id": actor.company_id, "user_id": str(actor.id)})
    if existing and existing.status != ActiveTimeSessionStatus.STOPPING and str(existing.task_id) == str(task.id):
        return existing
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Stop or pause your current timer before starting another task.")

    now = utc_now()
    session = ActiveTimeSession(
        company_id=actor.company_id,
        user_id=str(actor.id),
        task_id=str(task.id),
        project_id=str(project.id) if project else (str(task.project_id) if task.project_id else None),
        client_id=getattr(project, "client_id", None) if project else None,
        started_at=now,
        last_resumed_at=now,
        status=ActiveTimeSessionStatus.RUNNING,
    )
    try:
        await session.insert()
    except DuplicateKeyError:
        existing = await ActiveTimeSession.find_one({"company_id": actor.company_id, "user_id": str(actor.id)})
        if existing and existing.status != ActiveTimeSessionStatus.STOPPING and str(existing.task_id) == str(task.id):
            return existing
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Stop or pause your current timer before starting another task.")

    if normalize_status(task.status) == TaskStatus.ASSIGNED:
        try:
            await transition_task(task=task, actor=actor, action="start_work")
        except Exception:
            await session.delete()
            raise
    return session


async def active_timer(actor: User) -> Optional[ActiveTimeSession]:
    return await ActiveTimeSession.find_one({"company_id": actor.company_id, "user_id": str(actor.id)})


async def pause_timer(actor: User) -> ActiveTimeSession:
    session = await active_timer(actor)
    if not session:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active timer found.")
    if session.status == ActiveTimeSessionStatus.PAUSED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Timer is already paused.")
    now = utc_now()
    session.accumulated_seconds = elapsed_seconds(session, now)
    session.status = ActiveTimeSessionStatus.PAUSED
    session.paused_at = now
    session.updated_at = now
    await session.save()
    return session


async def resume_timer(actor: User) -> ActiveTimeSession:
    session = await active_timer(actor)
    if not session:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active timer found.")
    if session.status == ActiveTimeSessionStatus.RUNNING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Timer is already running.")
    now = utc_now()
    session.status = ActiveTimeSessionStatus.RUNNING
    session.last_resumed_at = now
    session.paused_at = None
    session.updated_at = now
    await session.save()
    return session


async def stop_timer(actor: User, description: Optional[str] = None) -> TimeLog:
    now = utc_now()

    # Atomically claim the session via motor's find_one_and_update.
    # Concurrent stop_timer calls race here; only one wins.
    from pymongo import ReturnDocument
    raw = await ActiveTimeSession.get_pymongo_collection().find_one_and_update(
        {
            "company_id": actor.company_id,
            "user_id": str(actor.id),
            "status": {"$in": [ActiveTimeSessionStatus.RUNNING.value, ActiveTimeSessionStatus.PAUSED.value]},
        },
        {
            "$set": {
                "status": ActiveTimeSessionStatus.STOPPING.value,
                "updated_at": now.isoformat(),
                "finalized": False,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active timer found.")
    session = ActiveTimeSession.model_validate(raw)

    # Compute elapsed from last_resumed_at regardless of status, since find_one_and_update
    # already atomically set status to STOPPING.
    seconds = int(session.accumulated_seconds or 0)
    if session.last_resumed_at:
        seconds += max(0, int((now - parse_to_utc(session.last_resumed_at)).total_seconds()))
    if seconds <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Timer duration must be positive.")

    # Idempotency: if a TimeLog already exists for this session, return it.
    session_id = str(session.id)
    existing_log = await TimeLog.find_one({
        "timer_session_id": session_id,
        "company_id": session.company_id,
    })
    if existing_log:
        session.finalized = True
        await session.save()
        await session.delete()
        return existing_log

    hours = round(seconds / 3600.0, 4)
    time_log = TimeLog(
        task_id=session.task_id,
        company_id=session.company_id,
        user_id=session.user_id,
        user_name=actor.full_name(),
        hours=hours,
        minutes=round((seconds % 3600) / 60),
        date=now,
        started_at=session.started_at,
        ended_at=now,
        source=TimeLogSource.TIMER,
        timer_session_id=str(session.id),
        project_id=session.project_id,
        client_id=session.client_id,
        description=description,
        created_by=str(actor.id),
        updated_by=str(actor.id),
    )
    await time_log.insert()
    await _update_summary_and_task(time_log, hours)
    session.finalized = True
    await session.save()
    await session.delete()
    return time_log


async def recover_stopped_timer(session: ActiveTimeSession, description: Optional[str] = None) -> TimeLog:
    """Recover a timer stuck in STOPPING state by creating its TimeLog.

    Called when a previous ``stop_timer`` failed after setting the session to
    STOPPING but before completing the TimeLog creation.  Uses an idempotent
    check so repeated recovery calls never create duplicate TimeLogs.
    """
    now = utc_now()

    # Idempotency: if a TimeLog already exists for this session, do not duplicate.
    session_id = str(session.id)
    existing_log = await TimeLog.find_one({
        "timer_session_id": session_id,
        "company_id": session.company_id,
    })
    if not existing_log:
        # Fallback: check by task + started_at + source for crash-recovery where session ID may differ.
        existing_log = await TimeLog.find_one({
            "task_id": session.task_id,
            "company_id": session.company_id,
            "started_at": session.started_at,
            "source": TimeLogSource.TIMER,
        })
    if existing_log:
        await session.delete()
        return existing_log

    seconds = elapsed_seconds(session)
    if seconds <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Timer duration must be positive.")

    hours = round(seconds / 3600.0, 4)
    time_log = TimeLog(
        task_id=session.task_id,
        company_id=session.company_id,
        user_id=session.user_id,
        user_name=session.user_id,  # actor name unavailable during recovery
        hours=hours,
        minutes=round((seconds % 3600) / 60),
        date=now,
        started_at=session.started_at,
        ended_at=now,
        source=TimeLogSource.TIMER,
        timer_session_id=session_id,
        project_id=session.project_id,
        client_id=session.client_id,
        description=description,
        created_by=session.user_id,
        updated_by=session.user_id,
    )
    await time_log.insert()
    await _update_summary_and_task(time_log, hours)
    session.finalized = True
    await session.save()
    await session.delete()
    return time_log


async def recover_stale_stopping_timers() -> None:
    """Recover timer sessions stuck in STOPPING state.

    Runs once at startup. Finds any sessions left in STOPPING that were not
    finalized within a reasonable grace period and calls ``recover_stopped_timer``
    to create the missing TimeLog and clean up the session.
    """
    from datetime import timedelta
    grace = utc_now() - timedelta(minutes=5)
    stuck = await ActiveTimeSession.find({
        "status": ActiveTimeSessionStatus.STOPPING.value,
        "finalized": False,
        "updated_at": {"$lt": grace},
    }).to_list()
    for session in stuck:
        try:
            await recover_stopped_timer(session)
            logger.info(f"Recovered stuck timer session {session.id} for user {session.user_id}")
        except Exception as exc:
            logger.error(f"Failed to recover timer session {session.id}: {exc}")


async def create_manual_time_log(
    *,
    actor: User,
    task_id: str,
    hours: float,
    minutes: int = 0,
    date: Optional[str] = None,
    description: Optional[str] = None,
    is_billable: bool = False,
    billing_rate: Optional[float] = None,
) -> TimeLog:
    task, project = await _load_task_for_time(task_id, actor)
    total_hours = float(hours or 0) + (int(minutes or 0) / 60.0)
    if total_hours <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Duration must be positive.")
    if total_hours > MAX_MANUAL_HOURS_PER_ENTRY:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Duration cannot exceed {MAX_MANUAL_HOURS_PER_ENTRY} hours per entry.")
    if str(task.assigned_to or "") != str(actor.id) and actor.role not in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.LEAD}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot add time for this task")

    log_date = utc_now()
    if date:
        try:
            log_date = parse_to_utc(datetime.fromisoformat(date.replace("Z", "+00:00")))
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date") from exc

    time_log = TimeLog(
        task_id=str(task.id),
        company_id=actor.company_id,
        user_id=str(actor.id),
        user_name=actor.full_name(),
        hours=round(total_hours, 4),
        minutes=minutes,
        date=log_date,
        source=TimeLogSource.MANUAL,
        project_id=str(project.id) if project else (str(task.project_id) if task.project_id else None),
        client_id=getattr(project, "client_id", None) if project else None,
        description=description,
        is_billable=is_billable,
        billing_rate=billing_rate,
        created_by=str(actor.id),
        updated_by=str(actor.id),
    )
    await time_log.insert()
    await _update_summary_and_task(time_log, time_log.hours)
    return time_log
