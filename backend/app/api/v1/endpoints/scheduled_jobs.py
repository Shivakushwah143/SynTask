"""
Scheduled Jobs Endpoints
"""
from datetime import datetime
from typing import Optional, Any, Dict
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field

from app.models.scheduled_job import ScheduledJob, ScheduledJobActionType, ScheduledJobStatus
from app.models.user import User, UserRole
from app.api.dependencies import get_current_user
from app.services.scheduling_service import SchedulingService
from app.api.deps import Pagination20, PaginationParams
from app.models.notification import Notification, NotificationType
from app.core.clock import parse_to_utc, utc_now
from app.core.cache import cache_delete_pattern, project_list_key
from app.services.project_permissions import ProjectPermission, has_project_permission, load_project_for_permission

router = APIRouter()


class ScheduleJobRequest(BaseModel):
    action_type: ScheduledJobActionType
    payload: Dict[str, Any]
    run_at: datetime
    notes: Optional[str] = None


class UpdateScheduleRequest(BaseModel):
    run_at: datetime


def _normalize_run_at(run_at: datetime) -> datetime:
    """Return a naive UTC datetime for storage and due-job queries."""
    return parse_to_utc(run_at)


def _ensure_future_run_at(run_at: datetime) -> datetime:
    normalized = _normalize_run_at(run_at)
    if normalized <= utc_now():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Schedule time must be in the future"
        )
    return normalized


async def _ensure_can_schedule_action(current_user: User, action_type: ScheduledJobActionType, payload: Optional[Dict[str, Any]] = None) -> None:
    if action_type == ScheduledJobActionType.CREATE_PROJECT:
        allowed_roles = {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN}
    else:
        allowed_roles = {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN}

    if current_user.role in allowed_roles:
        return

    if action_type == ScheduledJobActionType.CREATE_TASK and payload:
        project_id = payload.get("project_id")
        if project_id:
            project = await load_project_for_permission(str(project_id), current_user)
            if has_project_permission(current_user, project, ProjectPermission.CREATE_TASK):
                return

    if current_user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to schedule this action"
        )


def _ensure_can_manage_scheduled_jobs(current_user: User) -> None:
    if current_user.role not in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to manage scheduled jobs"
        )


def _serialize_job(job: ScheduledJob) -> Dict[str, Any]:
    return {
        "id": str(job.id),
        "action_type": job.action_type.value,
        "payload": job.payload,
        "run_at": job.run_at,
        "status": job.status.value,
        "created_by": job.created_by,
        "company_id": job.company_id,
        "retry_count": job.retry_count,
        "error": job.error,
        "notes": job.notes,
        "created_at": job.created_at,
        "completed_at": job.completed_at,
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_scheduled_job(
    request: ScheduleJobRequest,
    current_user: User = Depends(get_current_user)
):
    """Schedule a new project or task creation action"""
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a company"
        )
    await _ensure_can_schedule_action(current_user, request.action_type, request.payload)
    run_at = _ensure_future_run_at(request.run_at)

    # If action_type is CREATE_PROJECT, verify project_id and key uniqueness
    if request.action_type == ScheduledJobActionType.CREATE_PROJECT:
        project_id = request.payload.get("project_id")
        key = request.payload.get("key")
        if not project_id or not key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project ID and Key are required for CREATE_PROJECT payload"
            )
        existing_proj = await ScheduledJob.find_one(
            {"company_id": current_user.company_id, "payload.project_id": project_id, "status": {"$in": [ScheduledJobStatus.PENDING.value, ScheduledJobStatus.RUNNING.value]}}
        )
        if existing_proj:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Project ID '{project_id}' is already scheduled or running."
            )

    job = await SchedulingService.schedule_job(
        action_type=request.action_type,
        payload=request.payload,
        run_at=run_at,
        created_by=str(current_user.id),
        company_id=current_user.company_id,
        notes=request.notes,
    )
    if request.action_type == ScheduledJobActionType.CREATE_PROJECT:
        await cache_delete_pattern(f"{project_list_key(current_user.company_id)}*")
    return _serialize_job(job)


@router.get("/")
async def list_scheduled_jobs(
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    pagination: PaginationParams = Pagination20,
    current_user: User = Depends(get_current_user)
):
    """List scheduled jobs for the current user's company"""
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a company"
        )
    _ensure_can_manage_scheduled_jobs(current_user)

    skip, limit = pagination.skip, pagination.limit
    query: Dict[str, Any] = {"company_id": current_user.company_id}

    if status_filter:
        query["status"] = status_filter

    if search:
        # Search in payload title, name, or action_type
        query["$or"] = [
            {"action_type": {"$regex": search, "$options": "i"}},
            {"payload.title": {"$regex": search, "$options": "i"}},
            {"payload.name": {"$regex": search, "$options": "i"}},
            {"payload.project_id": {"$regex": search, "$options": "i"}},
        ]

    jobs = await ScheduledJob.find(query).skip(skip).limit(limit).sort("-run_at").to_list()
    total = await ScheduledJob.find(query).count()

    # Resolve created_by user names
    user_names = {}
    for user_id in {job.created_by for job in jobs if job.created_by}:
        u = await User.get(user_id)
        if u:
            user_names[str(u.id)] = f"{u.first_name} {u.last_name}".strip()

    serialized = []
    for job in jobs:
        serialized.append({
            **_serialize_job(job),
            "created_by_name": user_names.get(job.created_by, "Unknown")
        })

    return {
        "jobs": serialized,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.patch("/{job_id}")
async def update_scheduled_job(
    job_id: str,
    request: UpdateScheduleRequest,
    current_user: User = Depends(get_current_user)
):
    """Edit execution time for a pending scheduled job"""
    job = await ScheduledJob.get(job_id)
    if not job or job.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scheduled job not found"
        )
    _ensure_can_manage_scheduled_jobs(current_user)

    if job.status != ScheduledJobStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending jobs can be modified"
        )

    job.run_at = _ensure_future_run_at(request.run_at)
    await job.save()
    if job.action_type == ScheduledJobActionType.CREATE_PROJECT:
        await cache_delete_pattern(f"{project_list_key(job.company_id)}*")
    return _serialize_job(job)


@router.post("/{job_id}/cancel")
async def cancel_scheduled_job(
    job_id: str,
    current_user: User = Depends(get_current_user)
):
    """Cancel a pending scheduled job"""
    job = await ScheduledJob.get(job_id)
    if not job or job.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scheduled job not found"
        )
    _ensure_can_manage_scheduled_jobs(current_user)

    if job.status not in {ScheduledJobStatus.PENDING, ScheduledJobStatus.FAILED}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending or failed jobs can be cancelled"
        )

    job.status = ScheduledJobStatus.CANCELLED
    job.completed_at = utc_now()
    await job.save()
    if job.action_type == ScheduledJobActionType.CREATE_PROJECT:
        await cache_delete_pattern(f"{project_list_key(job.company_id)}*")

    # Send cancellation notification to creator
    notification = Notification(
        company_id=job.company_id,
        user_id=job.created_by,
        type=NotificationType.SYSTEM,
        title="Scheduled Job Cancelled",
        message=f"Your scheduled action '{job.action_type.value}' has been cancelled.",
        related_id=str(job.id),
        related_type="scheduled_job",
        action_url="/scheduled-jobs",
    )
    await notification.insert()

    return _serialize_job(job)


@router.post("/{job_id}/retry")
async def retry_failed_job(
    job_id: str,
    current_user: User = Depends(get_current_user)
):
    """Retry a failed or cancelled scheduled job by setting status to PENDING and resetting retries"""
    job = await ScheduledJob.get(job_id)
    if not job or job.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scheduled job not found"
        )
    _ensure_can_manage_scheduled_jobs(current_user)

    if job.status not in {ScheduledJobStatus.FAILED, ScheduledJobStatus.CANCELLED}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only failed or cancelled jobs can be retried"
        )

    job.status = ScheduledJobStatus.PENDING
    job.retry_count = 0
    job.error = None
    # If run_at is in the past, reset it to now so it runs immediately on next minute check
    if _normalize_run_at(job.run_at) <= utc_now():
        job.run_at = utc_now()
    await job.save()
    if job.action_type == ScheduledJobActionType.CREATE_PROJECT:
        await cache_delete_pattern(f"{project_list_key(job.company_id)}*")
    return _serialize_job(job)


@router.delete("/{job_id}")
async def delete_scheduled_job(
    job_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a completed, cancelled or failed scheduled job"""
    job = await ScheduledJob.get(job_id)
    if not job or job.company_id != current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scheduled job not found"
        )
    _ensure_can_manage_scheduled_jobs(current_user)

    if job.status not in {ScheduledJobStatus.COMPLETED, ScheduledJobStatus.CANCELLED, ScheduledJobStatus.FAILED}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only completed, cancelled or failed jobs can be deleted"
        )

    await job.delete()
    return {"message": "Scheduled job deleted successfully"}
