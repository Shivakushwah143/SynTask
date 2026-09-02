"""
Scheduling Service for SynTask Scheduling System
"""
import asyncio
import logging
from calendar import monthrange
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import Optional, Dict, Any
from pymongo.errors import DuplicateKeyError

from app.models.scheduled_job import ScheduledJob, ScheduledJobActionType, ScheduledJobOccurrence, ScheduledJobOccurrenceStatus, ScheduledJobScheduleType, ScheduledJobStatus
from app.models.user import User, UserStatus
from app.models.notification import Notification, NotificationType
from app.models.task import Task
from app.models.timeline import TimelineEventType, TimelineModule
from app.services.timeline_service import create_timeline_event
from app.services.project_service import ProjectService
from app.services.task_service import TaskService
from app.core.clock import parse_to_utc, utc_now

logger = logging.getLogger(__name__)


class SchedulingService:
    @staticmethod
    async def schedule_job(
        *,
        action_type: ScheduledJobActionType,
        payload: Dict[str, Any],
        run_at: datetime,
        created_by: str,
        company_id: Optional[str] = None,
        notes: Optional[str] = None,
        schedule_type: ScheduledJobScheduleType = ScheduledJobScheduleType.ONE_TIME,
        recurrence: Optional[Dict[str, Any]] = None,
        timezone: str = "UTC",
    ) -> ScheduledJob:
        """Create and save a new scheduled job"""
        job = ScheduledJob(
            action_type=action_type,
            payload=payload,
            run_at=parse_to_utc(run_at),
            status=ScheduledJobStatus.PENDING,
            created_by=created_by,
            company_id=company_id,
            notes=notes,
            schedule_type=schedule_type,
            recurrence=recurrence,
            timezone=timezone,
            next_run_at=parse_to_utc(run_at),
        )
        await job.insert()
        logger.info(f"Scheduled job created: id={job.id}, action_type={action_type}, run_at={run_at}")
        return job

    @staticmethod
    async def execute_pending_jobs():
        """Find pending or failed (with retry < 3) jobs that are ready to run, lock and execute them"""
        now = utc_now()
        # Find jobs matching criteria
        jobs = await ScheduledJob.find({
            "status": {"$in": [ScheduledJobStatus.PENDING.value, ScheduledJobStatus.FAILED.value]},
            "enabled": {"$ne": False},
            "retry_count": {"$lt": 3},
            "run_at": {"$lte": now},
        }).to_list()

        if not jobs:
            return

        logger.info(f"Found {len(jobs)} ready scheduled job(s). Starting execution.")

        from app.core.database import get_database
        from bson import ObjectId
        db = get_database()

        for job in jobs:
            occurrence = None
            # Atomically lock job by updating status to RUNNING
            # Increment retry count if status was FAILED
            new_retry_count = job.retry_count + (1 if job.status == ScheduledJobStatus.FAILED else 0)
            res = await db["scheduled_jobs"].find_one_and_update(
                {
                    "_id": ObjectId(job.id),
                    "status": {"$in": [ScheduledJobStatus.PENDING.value, ScheduledJobStatus.FAILED.value]}
                },
                {
                    "$set": {
                        "status": ScheduledJobStatus.RUNNING.value,
                        "retry_count": new_retry_count
                    }
                },
                return_document=True
            )

            if not res:
                # Job was locked by another process
                continue

            # Update the Beanie model state with what was saved
            job.status = ScheduledJobStatus.RUNNING
            job.retry_count = new_retry_count

            logger.info(f"Locked job {job.id} for execution (attempt {job.retry_count + 1})")

            try:
                creator = await User.get(job.created_by)
                if not creator:
                    raise ValueError(f"Creator user with id {job.created_by} not found")

                occurrence = await SchedulingService._lock_occurrence(job)
                if occurrence is None:
                    job.status = ScheduledJobStatus.PENDING
                    await job.save()
                    continue
                result = None
                if occurrence.status == ScheduledJobOccurrenceStatus.COMPLETED:
                    result = {occurrence.result_type or "id": occurrence.result_id}
                elif job.action_type == ScheduledJobActionType.CREATE_PROJECT:
                    result = await ProjectService.create_project_core(
                        name=job.payload.get("name"),
                        key=job.payload.get("key"),
                        description=job.payload.get("description"),
                        type=job.payload.get("type", "software"),
                        client_id=job.payload.get("client_id"),
                        lead_id=job.payload.get("lead_id"),
                        assigned_to=job.payload.get("assigned_to"),
                        assigned_user_ids=job.payload.get("assigned_user_ids"),
                        start_date=job.payload.get("start_date"),
                        delivery_date=job.payload.get("delivery_date"),
                        project_id=job.payload.get("project_id"),
                        current_user=creator,
                    )
                elif job.action_type == ScheduledJobActionType.CREATE_TASK:
                    result = await SchedulingService._execute_create_task(job, creator)
                else:
                    raise ValueError(f"Unsupported action type: {job.action_type}")

                if occurrence.status != ScheduledJobOccurrenceStatus.COMPLETED:
                    await SchedulingService._complete_occurrence(occurrence, job, result)
                if job.schedule_type == ScheduledJobScheduleType.RECURRING:
                    next_run_at = SchedulingService.next_occurrence(job, after=job.run_at)
                    if not next_run_at:
                        job.status = ScheduledJobStatus.COMPLETED
                        job.enabled = False
                        job.completed_at = utc_now()
                    else:
                        job.status = ScheduledJobStatus.PENDING
                        job.last_run_at = job.run_at
                        job.run_at = next_run_at
                        job.next_run_at = next_run_at
                        job.occurrence_count = int(job.occurrence_count or 0) + 1
                else:
                    job.status = ScheduledJobStatus.COMPLETED
                    job.completed_at = utc_now()
                job.error = None
                # Persist the generated record id so calendar consumers can
                # deduplicate the RUNNING placeholder against the real Task.
                if result and isinstance(result, dict):
                    result_id = result.get("task_id") or result.get("id") or result.get("project_id")
                    if result_id:
                        job.result_type = (
                            "task"
                            if job.action_type == ScheduledJobActionType.CREATE_TASK
                            else "project"
                        )
                        job.result_id = str(result_id)
                await job.save()

                logger.info(f"Successfully completed scheduled job {job.id}")

                # For Sales follow-ups the normal Task Assigned notification is
                # the primary reminder, so no additional vague "Scheduled Job
                # Completed" notification is created when the task was assigned.
                is_sales_follow_up = job.payload.get("source_type") == "sales_follow_up"
                task_has_assignee = bool(job.payload.get("assigned_to"))
                if not (is_sales_follow_up and task_has_assignee):
                    # Send success notification to creator
                    notification = Notification(
                        company_id=job.company_id,
                        user_id=job.created_by,
                        type=NotificationType.SYSTEM,
                        title="Scheduled Job Completed",
                        message=f"Your scheduled action '{job.action_type.value}' has completed successfully.",
                        related_id=str(job.id),
                        related_type="scheduled_job",
                        action_url="/scheduled-jobs",
                    )
                    await notification.insert()

                # Write timeline activity log
                await create_timeline_event(
                    user_id=job.created_by,
                    company_id=job.company_id,
                    event_type=TimelineEventType.TASK_UPDATED,
                    title=f"Scheduled Job Completed",
                    description=f"Job of type {job.action_type.value} completed successfully.",
                    related_module=TimelineModule.TASK,
                    related_record_id=str(job.id),
                )

            except Exception as e:
                logger.error(f"Error executing scheduled job {job.id}: {str(e)}", exc_info=True)
                if occurrence:
                    occurrence.status = ScheduledJobOccurrenceStatus.FAILED
                    occurrence.error = str(e)
                    occurrence.completed_at = utc_now()
                    await occurrence.save()
                job.error = str(e)
                job.status = ScheduledJobStatus.FAILED
                await job.save()

                # If failed 3 times, notify creator
                if job.retry_count >= 2:  # retry_count starts at 0, third run is when new_retry_count becomes 2 (since it was locked after 2 failed attempts)
                    # Send failure notification to creator
                    notification = Notification(
                        company_id=job.company_id,
                        user_id=job.created_by,
                        type=NotificationType.SYSTEM,
                        title="Scheduled Job Failed",
                        message=f"Your scheduled action '{job.action_type.value}' has failed after 3 attempts. Error: {str(e)}",
                        related_id=str(job.id),
                        related_type="scheduled_job",
                        action_url="/scheduled-jobs",
                    )
                    await notification.insert()

                    # Write timeline activity log
                    await create_timeline_event(
                        user_id=job.created_by,
                        company_id=job.company_id,
                        event_type=TimelineEventType.TASK_UPDATED,
                        title=f"Scheduled Job Failed Permanent",
                        description=f"Job of type {job.action_type.value} failed permanently after 3 attempts.",
                        related_module=TimelineModule.TASK,
                        related_record_id=str(job.id),
                    )
                else:
                    # Write temporary timeline activity log
                    await create_timeline_event(
                        user_id=job.created_by,
                        company_id=job.company_id,
                        event_type=TimelineEventType.TASK_UPDATED,
                        title=f"Scheduled Job Attempt Failed",
                        description=f"Job of type {job.action_type.value} failed (attempt {job.retry_count + 1}).",
                        related_module=TimelineModule.TASK,
                        related_record_id=str(job.id),
                    )

    @staticmethod
    async def _execute_create_task(job: ScheduledJob, creator: User) -> Dict[str, Any]:
        """Execute a CREATE_TASK job, forwarding every payload field additively.

        Sales follow-up jobs additionally link the generated task back to the
        scheduled CRM activity (task_id + status scheduled -> in_progress). The
        job is already locked as RUNNING before this runs, so a re-execution can
        only happen for FAILED jobs, which never reach the success path — a
        follow-up task is created exactly once.
        """
        occurrence_marker = (
            f"{job.id}:{parse_to_utc(job.run_at).isoformat()}"
            if job.schedule_type == ScheduledJobScheduleType.RECURRING
            else None
        )
        if occurrence_marker:
            existing = await Task.find_one({
                "company_id": job.company_id,
                "source_type": job.payload.get("source_type") or "scheduled_work",
                "related_entity_id": occurrence_marker,
            })
            if existing:
                return {
                    "id": str(existing.id),
                    "task_id": str(existing.id),
                    "title": existing.title,
                    "status": getattr(existing.status, "value", existing.status),
                }

        assignee_id = job.payload.get("assigned_to")
        if assignee_id:
            assignee = await User.get(assignee_id)
            if not assignee or assignee.status != UserStatus.ACTIVE or str(assignee.company_id) != str(job.company_id):
                raise ValueError("Scheduled work assignee is inactive or unavailable")
        result = await TaskService.create_task_core(
            title=job.payload.get("title"),
            description=job.payload.get("description"),
            assigned_to=job.payload.get("assigned_to"),
            priority=job.payload.get("priority", "medium"),
            due_date=job.payload.get("due_date"),
            tags=job.payload.get("tags"),
            parent_task_id=job.payload.get("parent_task_id"),
            project_id=job.payload.get("project_id"),
            epic_id=job.payload.get("epic_id"),
            sprint_id=job.payload.get("sprint_id"),
            department_id=job.payload.get("department_id"),
            story_points=job.payload.get("story_points"),
            estimated_hours=job.payload.get("estimated_hours"),
            task_type=job.payload.get("task_type", "standard"),
            measurement_type=job.payload.get("measurement_type"),
            custom_measurement_label=job.payload.get("custom_measurement_label"),
            target_quantity=job.payload.get("target_quantity"),
            target_unit=job.payload.get("target_unit"),
            reviewer_id=job.payload.get("reviewer_id"),
            review_required=job.payload.get("review_required"),
            source_type=job.payload.get("source_type") or ("scheduled_work" if job.schedule_type == ScheduledJobScheduleType.RECURRING else None),
            related_entity_type=job.payload.get("related_entity_type"),
            related_entity_id=job.payload.get("related_entity_id") or (
                f"{job.id}:{parse_to_utc(job.run_at).isoformat()}"
                if job.schedule_type == ScheduledJobScheduleType.RECURRING
                else None
            ),
            related_entity_stage=job.payload.get("related_entity_stage"),
            related_entity_url=job.payload.get("related_entity_url"),
            current_user=creator,
            background_tasks=None
        )
        if job.payload.get("source_type") == "sales_follow_up" and result:
            try:
                from app.models.crm_activity import CRMActivity, CRMActivityStatus
                task_id = result.get("task_id") or result.get("id")
                activity = await CRMActivity.find_one(
                    {
                        "company_id": job.company_id,
                        "metadata.scheduled_job_id": str(job.id),
                        "deleted": False,
                    }
                )
                if activity and task_id:
                    activity.status = CRMActivityStatus.IN_PROGRESS
                    activity.metadata = {
                        **dict(activity.metadata or {}),
                        "task_id": str(task_id),
                    }
                    activity.updated_at = utc_now()
                    await activity.save()
            except Exception as exc:
                logger.warning(
                    f"Could not link scheduled job {job.id} to its CRM activity: {str(exc)}",
                    exc_info=True,
                )
        return result

    @staticmethod
    def _tz(name: str) -> ZoneInfo:
        try:
            return ZoneInfo(name or "UTC")
        except ZoneInfoNotFoundError:
            raise ValueError("Invalid timezone")

    @staticmethod
    def next_occurrence(job: ScheduledJob, *, after: datetime) -> Optional[datetime]:
        recurrence = job.recurrence or {}
        frequency = str(recurrence.get("frequency") or "daily").lower()
        tz = SchedulingService._tz(job.timezone)
        local = parse_to_utc(after).replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
        end_at = recurrence.get("end_at")
        interval = max(int(recurrence.get("interval") or 1), 1)

        if frequency == "daily":
            candidate = local + timedelta(days=interval)
        elif frequency == "weekly":
            weekdays = sorted(int(day) for day in recurrence.get("weekdays") or [local.weekday()])
            if interval == 1:
                candidate = None
                for offset in range(1, 8):
                    probe = local + timedelta(days=offset)
                    if probe.weekday() in weekdays:
                        candidate = probe
                        break
            else:
                next_cycle = local - timedelta(days=local.weekday()) + timedelta(weeks=interval)
                candidate = next_cycle + timedelta(days=weekdays[0])
        elif frequency == "monthly":
            day = int(recurrence.get("month_day") or local.day)
            month = local.month - 1 + interval
            year = local.year + month // 12
            month = month % 12 + 1
            valid_day = min(day, monthrange(year, month)[1])
            candidate = local.replace(year=year, month=month, day=valid_day)
        elif frequency == "custom":
            unit = str(recurrence.get("unit") or "days").lower()
            count = max(int(recurrence.get("count") or interval), 1)
            candidate = local + (timedelta(hours=count) if unit == "hours" else timedelta(days=count))
        else:
            raise ValueError("Unsupported recurrence frequency")

        result = candidate.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        if end_at and result > parse_to_utc(end_at):
            return None
        return result

    @staticmethod
    async def _lock_occurrence(job: ScheduledJob) -> Optional[ScheduledJobOccurrence]:
        occurrence_id = f"{job.id}:{parse_to_utc(job.run_at).isoformat()}"
        existing = await ScheduledJobOccurrence.find_one({"occurrence_id": occurrence_id})
        if existing and existing.status in {ScheduledJobOccurrenceStatus.COMPLETED, ScheduledJobOccurrenceStatus.RUNNING}:
            return existing if existing.status == ScheduledJobOccurrenceStatus.COMPLETED else None
        if existing:
            existing.status = ScheduledJobOccurrenceStatus.RUNNING
            existing.retry_count = int(existing.retry_count or 0) + 1
            existing.error = None
            existing.started_at = utc_now()
            await existing.save()
            return existing
        occurrence = ScheduledJobOccurrence(
            scheduled_job_id=str(job.id),
            company_id=str(job.company_id),
            occurrence_id=occurrence_id,
            scheduled_at=parse_to_utc(job.run_at),
        )
        try:
            await occurrence.insert()
        except DuplicateKeyError:
            existing = await ScheduledJobOccurrence.find_one({"occurrence_id": occurrence_id})
            if existing and existing.status == ScheduledJobOccurrenceStatus.COMPLETED:
                return existing
            return None
        return occurrence

    @staticmethod
    async def _complete_occurrence(occurrence: ScheduledJobOccurrence, job: ScheduledJob, result: Optional[dict]) -> None:
        occurrence.status = ScheduledJobOccurrenceStatus.COMPLETED
        occurrence.completed_at = utc_now()
        if result:
            result_id = result.get("task_id") or result.get("id") or result.get("project_id")
            if result_id:
                occurrence.result_type = "task" if job.action_type == ScheduledJobActionType.CREATE_TASK else "project"
                occurrence.result_id = str(result_id)
        await occurrence.save()

    @staticmethod
    async def run_scheduled_jobs_loop():
        """Run the scheduling loop every 60 seconds"""
        logger.info("Starting run_scheduled_jobs_loop background loop")
        while True:
            try:
                await SchedulingService.execute_pending_jobs()
            except Exception as e:
                logger.error(f"Error in run_scheduled_jobs_loop: {str(e)}", exc_info=True)
            await asyncio.sleep(60)
