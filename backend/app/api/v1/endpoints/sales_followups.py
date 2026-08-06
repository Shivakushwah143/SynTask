"""
Sales Follow-up API.

A dedicated API layer for scheduling lead follow-ups that reuses the existing
ScheduledJob (CREATE_TASK) infrastructure instead of introducing a second
scheduling engine. A follow-up is a coordinated write across three records:

1. ScheduledJob  — action_type=CREATE_TASK, run_at=scheduled_at, payload carrying
   the normal task fields plus generic relation metadata (source_type /
   related_entity_*). At the scheduled time the existing SchedulingService
   creates a real Task assigned to the selected salesperson, and the existing
   task-assignment notification reminds them.
2. SalesProspect — next_follow_up_at / next_action stay in sync. current_stage
   and current_stage_status are NEVER touched by this module.
3. CRMActivity   — activity_type=FOLLOW_UP, status=SCHEDULED, linked to the
   ScheduledJob via metadata.scheduled_job_id so reschedule/cancel stay in sync
   and the executed task id is recorded on it.

Tenant isolation and ownership rules mirror the rest of the Sales domain:
company scoping, require_owned_record_access with the standard lead ownership
fields, and the existing task-assignment hierarchy for the assignee. An EMPLOYEE
may only schedule a follow-up for a lead they own, and only to themselves.
"""
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.api.v1.endpoints.tasks import _assert_can_assign_task
from app.core.clock import parse_to_utc, utc_now
from app.core.rbac_visibility import require_owned_record_access
from app.crm.models import SalesProspect
from app.crm.pipeline import normalize_stage_display, stage_status_key
from app.models.crm_activity import (
    CRMActivity,
    CRMActivityPriority,
    CRMActivityStatus,
    CRMActivityType,
)
from app.models.scheduled_job import (
    ScheduledJob,
    ScheduledJobActionType,
    ScheduledJobStatus,
)
from app.models.user import User, UserRole, UserStatus
from app.services.scheduling_service import SchedulingService

router = APIRouter()
logger = logging.getLogger(__name__)

# Canonical stages where a Sales follow-up may be scheduled. Lost and unknown
# stages are excluded because follow-up work no longer applies there.
FOLLOW_UP_STAGES = {
    "acquire",
    "qualify",
    "discovery",
    "proposal",
    "negotiation",
    "agreement",
    "won",
}

TRANSFERRED_MESSAGE = (
    "This lead has been transferred to Clients. Schedule future work from the Client workspace."
)

FOLLOW_UP_SOURCE = "sales_follow_up"
FOLLOW_UP_RELATED_ENTITY_TYPE = "sales_lead"


class SalesFollowUpCreateRequest(BaseModel):
    scheduled_at: datetime
    title: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: str = "medium"
    estimated_hours: Optional[float] = 0.5


class SalesFollowUpUpdateRequest(BaseModel):
    scheduled_at: datetime
    title: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: Optional[str] = None
    estimated_hours: Optional[float] = None


def _normalize_future_scheduled_at(value: datetime) -> datetime:
    """Normalize to naive UTC and reject past/non-future times."""
    normalized = parse_to_utc(value)
    if normalized is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="scheduled_at is required",
        )
    if normalized <= utc_now():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Schedule time must be in the future",
        )
    return normalized


async def _load_lead_for_follow_up(lead_id: str, current_user: User) -> SalesProspect:
    lead = await SalesProspect.get(lead_id)
    if not lead or lead.deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prospect not found")
    await require_owned_record_access(
        current_user,
        lead,
        ownership_fields=("assigned_to", "assigned_by", "created_by"),
    )
    return lead


async def _ensure_schedulable_stage(lead: SalesProspect) -> str:
    """Return the canonical stage key when the lead may receive a follow-up."""
    # A transferred Won lead has left the Sales domain — new Sales follow-ups are
    # rejected with a clear warning. The stage/inner status are never modified.
    transferred = bool(getattr(lead, "transferred_at", None))
    won_status = str(getattr(lead, "won_status", "") or "").strip().lower().replace(" ", "_")
    if transferred or won_status == "transferred":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=TRANSFERRED_MESSAGE,
        )
    stage_key = stage_status_key(getattr(lead, "current_stage", None)) or ""
    if stage_key not in FOLLOW_UP_STAGES:
        display = normalize_stage_display(getattr(lead, "current_stage", "")) or "Unstaged"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Follow-ups can be scheduled only for active Sales stages; '{display}' is not eligible.",
        )
    return stage_key


async def _resolve_assignee(current_user: User, assigned_to: Optional[str]) -> str:
    """Validate the follow-up assignee against the existing task hierarchy.

    Employees may only schedule a follow-up assigned to themselves (and only for
    leads they can access — enforced by _load_lead_for_follow_up). Everyone else
    follows the standard task assignment hierarchy.
    """
    if current_user.role == UserRole.EMPLOYEE:
        requested = str(assigned_to or "").strip()
        if requested and requested != str(current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Employees can schedule follow-ups only for themselves",
            )
        return str(current_user.id)

    assignee_id = str(assigned_to or "").strip()
    if not assignee_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="assigned_to is required",
        )
    assignee = await User.get(assignee_id)
    if not assignee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned user not found")
    if assignee.company_id != current_user.company_id and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigned user must be from the same company",
        )
    if assignee.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigned user must be active",
        )
    await _assert_can_assign_task(current_user, assignee)
    return assignee_id


def _build_task_payload(
    *,
    title: str,
    notes: Optional[str],
    assigned_to: str,
    priority: str,
    estimated_hours: float,
    scheduled_at: datetime,
    stage_key: str,
    lead_id: str,
) -> Dict[str, Any]:
    """Normal task payload + additive generic relation metadata.

    Existing CREATE_TASK payload fields are preserved; the Sales follow-up adds
    source_type/related_entity_* so the executed task links back to the lead
    without any Sales-only scheduler action type.
    """
    return {
        "title": title,
        "description": notes,
        "assigned_to": assigned_to,
        "priority": priority or "medium",
        "due_date": scheduled_at,
        "estimated_hours": estimated_hours if estimated_hours is not None else 0.5,
        "task_type": "standard",
        "tags": "sales-follow-up",
        "source_type": FOLLOW_UP_SOURCE,
        "related_entity_type": FOLLOW_UP_RELATED_ENTITY_TYPE,
        "related_entity_id": lead_id,
        "related_entity_stage": stage_key,
        "related_entity_url": f"/crm/leads/{lead_id}",
    }


async def _find_linked_activity(job: ScheduledJob) -> Optional[CRMActivity]:
    return await CRMActivity.find_one(
        {
            "company_id": job.company_id,
            "metadata.scheduled_job_id": str(job.id),
            "deleted": False,
        }
    )


async def _load_follow_up_job(
    lead_id: str,
    job_id: str,
    current_user: User,
) -> ScheduledJob:
    """Load a follow-up ScheduledJob scoped to the lead and the current user."""
    job = await ScheduledJob.get(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found")
    if job.action_type != ScheduledJobActionType.CREATE_TASK:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found")
    if job.payload.get("source_type") != FOLLOW_UP_SOURCE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found")
    if str(job.payload.get("related_entity_id") or "") != lead_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found")
    if job.company_id != current_user.company_id and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found")
    # Employees manage only their own lead follow-ups.
    if current_user.role == UserRole.EMPLOYEE and job.created_by != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return job


def _status_value(value: Any) -> Optional[str]:
    """Return the string value of an enum (or a plain string) for serialization."""
    if value is None:
        return None
    return getattr(value, "value", value)


def _display_name(user: Optional[User], fallback: str = "System") -> str:
    if not user:
        return fallback
    full_name = f"{(user.first_name or '')} {(user.last_name or '')}".strip()
    return full_name or getattr(user, "email", None) or fallback


def _serialize_follow_up(
    job: ScheduledJob,
    lead: SalesProspect,
    activity: Optional[CRMActivity] = None,
) -> Dict[str, Any]:
    return {
        "id": str(job.id),
        "lead_id": str(lead.id),
        "lead_name": lead.prospect_name or lead.company_name,
        "scheduled_at": job.run_at,
        "status": job.status.value,
        "title": job.payload.get("title"),
        "notes": job.payload.get("description"),
        "assigned_to": job.payload.get("assigned_to"),
        "priority": job.payload.get("priority", "medium"),
        "estimated_hours": job.payload.get("estimated_hours"),
        "source_stage": job.payload.get("related_entity_stage"),
        "related_entity_url": job.payload.get("related_entity_url"),
        "created_by": job.created_by,
        "created_at": job.created_at,
        "completed_at": job.completed_at,
        "next_follow_up_at": lead.next_follow_up_at,
        "next_action": lead.next_action,
        "activity_id": str(activity.id) if activity else None,
        "activity_status": _status_value(activity.status) if activity else None,
    }


@router.post("/{lead_id}/follow-ups", status_code=status.HTTP_201_CREATED)
async def create_sales_follow_up(
    lead_id: str,
    request: SalesFollowUpCreateRequest,
    current_user: User = Depends(get_current_user),
):
    """Schedule a follow-up for a lead through the ScheduledJob CREATE_TASK path."""
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a company",
        )
    lead = await _load_lead_for_follow_up(lead_id, current_user)
    stage_key = await _ensure_schedulable_stage(lead)
    scheduled_at = _normalize_future_scheduled_at(request.scheduled_at)
    assigned_to = await _resolve_assignee(current_user, request.assigned_to)

    title = (request.title or "").strip() or f"Follow up with {lead.company_name or lead.prospect_name or 'this lead'}"
    notes = (request.notes or "").strip() or None

    payload = _build_task_payload(
        title=title,
        notes=notes,
        assigned_to=assigned_to,
        priority=request.priority,
        estimated_hours=request.estimated_hours,
        scheduled_at=scheduled_at,
        stage_key=stage_key,
        lead_id=str(lead.id),
    )

    # 1. ScheduledJob — the only scheduling primitive used. Compensating cleanup:
    # if the coordinated write fails after the job is inserted, the job is
    # deleted so no orphan scheduler record survives.
    job = await SchedulingService.schedule_job(
        action_type=ScheduledJobActionType.CREATE_TASK,
        payload=payload,
        run_at=scheduled_at,
        created_by=str(current_user.id),
        company_id=current_user.company_id,
        notes=notes,
    )

    try:
        # 2. SalesProspect — next follow-up fields only. current_stage and
        # current_stage_status are untouched (no stage/inner-status side effect).
        existing = lead.next_follow_up_at
        lead.next_follow_up_at = scheduled_at if not existing or scheduled_at < existing else existing
        lead.next_action = title
        lead.updated_at = utc_now()
        await lead.save()

        # 3. CRMActivity — scheduled FOLLOW_UP audit entry linked to the job.
        assignee = await User.get(assigned_to)
        activity = CRMActivity(
            company_id=current_user.company_id,
            entity_type="lead",
            entity_id=str(lead.id),
            activity_type=CRMActivityType.FOLLOW_UP.value,
            title=title,
            description=notes,
            status=CRMActivityStatus.SCHEDULED,
            priority=CRMActivityPriority(request.priority or "medium"),
            owner_id=assigned_to,
            owner_name=_display_name(assignee, assigned_to),
            due_date=scheduled_at,
            scheduled_at=scheduled_at,
            metadata={
                "scheduled_job_id": str(job.id),
                "source_stage": stage_key,
                "source": FOLLOW_UP_SOURCE,
            },
            created_by=str(current_user.id),
            created_by_name=_display_name(current_user),
            updated_by=str(current_user.id),
            updated_by_name=_display_name(current_user),
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        await activity.insert()
    except Exception:
        logger.exception("Sales follow-up coordinated write failed for lead=%s", lead_id)
        try:
            await job.delete()
        except Exception:
            logger.warning("Compensating cleanup could not delete scheduled job %s", job.id)
        raise

    return _serialize_follow_up(job, lead, activity)


@router.get("/{lead_id}/follow-ups")
async def list_sales_follow_ups(
    lead_id: str,
    current_user: User = Depends(get_current_user),
):
    """List the lead's follow-ups (all statuses, newest first)."""
    lead = await _load_lead_for_follow_up(lead_id, current_user)
    query: Dict[str, Any] = {
        "company_id": current_user.company_id,
        "payload.source_type": FOLLOW_UP_SOURCE,
        "payload.related_entity_id": str(lead.id),
    }
    if current_user.role == UserRole.EMPLOYEE:
        query["created_by"] = str(current_user.id)
    jobs = await ScheduledJob.find(query).sort("-run_at").to_list()
    items = []
    for job in jobs:
        activity = await _find_linked_activity(job)
        items.append(_serialize_follow_up(job, lead, activity))
    return {"follow_ups": items, "total": len(items)}


@router.patch("/{lead_id}/follow-ups/{job_id}")
async def update_sales_follow_up(
    lead_id: str,
    job_id: str,
    request: SalesFollowUpUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    """Reschedule a pending follow-up, keeping all linked records in sync."""
    lead = await _load_lead_for_follow_up(lead_id, current_user)
    job = await _load_follow_up_job(lead_id, job_id, current_user)

    if job.status != ScheduledJobStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending follow-ups can be rescheduled",
        )

    new_run_at = _normalize_future_scheduled_at(request.scheduled_at)
    previous_run_at = job.run_at

    # 1. ScheduledJob — run_at + payload.due_date.
    job.run_at = new_run_at
    payload = dict(job.payload or {})
    payload["due_date"] = new_run_at
    if request.title is not None:
        title = (request.title or "").strip()
        if title:
            payload["title"] = title
    if request.notes is not None:
        payload["description"] = (request.notes or "").strip() or None
    if request.priority:
        payload["priority"] = request.priority
    if request.estimated_hours is not None:
        payload["estimated_hours"] = request.estimated_hours
    if request.assigned_to:
        new_assignee = await _resolve_assignee(current_user, request.assigned_to)
        payload["assigned_to"] = new_assignee
    job.payload = payload
    await job.save()

    # 2. CRMActivity — scheduled_at / due_date stay in sync.
    activity = await _find_linked_activity(job)
    if activity:
        activity.scheduled_at = new_run_at
        activity.due_date = new_run_at
        if payload.get("title"):
            activity.title = payload["title"]
        if payload.get("description"):
            activity.description = payload["description"]
        activity.updated_at = utc_now()
        await activity.save()

    # 3. SalesProspect — only when this job is the lead's currently displayed
    # next follow-up (keeps multi-follow-up leads consistent). The comparison
    # uses the pre-mutation run time.
    if lead.next_follow_up_at and previous_run_at and abs((lead.next_follow_up_at - previous_run_at).total_seconds()) < 60:
        lead.next_follow_up_at = new_run_at
        lead.next_action = payload.get("title") or lead.next_action
        lead.updated_at = utc_now()
        await lead.save()

    return _serialize_follow_up(job, lead, activity)


@router.post("/{lead_id}/follow-ups/{job_id}/cancel")
async def cancel_sales_follow_up(
    lead_id: str,
    job_id: str,
    current_user: User = Depends(get_current_user),
):
    """Cancel a pending follow-up; never deletes the audit activity."""
    lead = await _load_lead_for_follow_up(lead_id, current_user)
    job = await _load_follow_up_job(lead_id, job_id, current_user)

    if job.status not in {ScheduledJobStatus.PENDING, ScheduledJobStatus.FAILED}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending or failed follow-ups can be cancelled",
        )

    previous_run_at = job.run_at
    job.status = ScheduledJobStatus.CANCELLED
    job.completed_at = utc_now()
    await job.save()

    activity = await _find_linked_activity(job)
    if activity:
        activity.status = CRMActivityStatus.CANCELLED
        activity.updated_at = utc_now()
        await activity.save()

    # Clear the lead's displayed next follow-up only when this cancelled job was
    # the one being displayed.
    if (
        lead.next_follow_up_at
        and previous_run_at
        and abs((lead.next_follow_up_at - previous_run_at).total_seconds()) < 60
    ):
        lead.next_follow_up_at = None
        lead.updated_at = utc_now()
        await lead.save()

    return _serialize_follow_up(job, lead, activity)
