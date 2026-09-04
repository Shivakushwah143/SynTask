"""
Meeting Management Endpoints with Zoom Integration
"""
from fastapi import APIRouter, HTTPException, status as http_status, Depends, Form, Query
from typing import Optional, List
from datetime import datetime, timedelta
import logging

from app.models.meeting import Meeting, MeetingStatus
from app.models.client import Client
from app.models.project import Project
from app.models.sales_contact import SalesContact
from app.models.notification import Notification, NotificationType
from app.models.timeline import TimelineEventType, TimelineModule
from app.models.user import User, UserRole
from app.events import publish_event
from app.events.factories import build_domain_event
from app.api.dependencies import (
    get_current_user,
    get_current_company_admin_or_lead,
    check_company_access
)
from app.core.zoom import ZoomService
from app.core.config import settings
from app.services.timeline_service import create_timeline_event
from app.core.clock import utc_now

logger = logging.getLogger(__name__)

router = APIRouter()
zoom_service = ZoomService()

MEETING_PARTICIPANT_ROLES_BY_CREATOR = {
    UserRole.SUPER_ADMIN: {UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE},
    UserRole.ADMIN: {UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE},
    UserRole.MANAGER: {UserRole.LEAD, UserRole.EMPLOYEE},
    UserRole.LEAD: {UserRole.EMPLOYEE},
}


def validate_meeting_duration(duration: int) -> None:
    if duration < 1 or duration > 60:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Duration must be between 1 and 60 minutes",
        )


def validate_meeting_participant_role(current_user: User, participant: User) -> None:
    allowed_roles = MEETING_PARTICIPANT_ROLES_BY_CREATOR.get(current_user.role, set())
    if participant.role not in allowed_roles:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Participants must be junior users available to the meeting creator",
        )


def normalize_participant_ids(participant_ids: Optional[str]) -> List[str]:
    seen = set()
    normalized = []
    for pid in (participant_ids or "").split(","):
        value = pid.strip()
        if value and value not in seen:
            seen.add(value)
            normalized.append(value)
    return normalized


def can_view_meeting(current_user: User, meeting: Meeting) -> bool:
    user_id = str(current_user.id)
    return meeting.host_id == user_id or user_id in (meeting.participant_ids or [])


def can_see_zoom_start_url(current_user: User, meeting: Meeting) -> bool:
    return meeting.host_id == str(current_user.id) or current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]


def can_manage_meeting(current_user: User, meeting: Meeting) -> bool:
    return meeting.host_id == str(current_user.id) or current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]


def validate_meeting_access(current_user: User, meeting: Meeting) -> None:
    check_company_access(current_user, meeting.company_id)
    if not can_view_meeting(current_user, meeting):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this meeting",
        )


def validate_meeting_management_access(current_user: User, meeting: Meeting) -> None:
    check_company_access(current_user, meeting.company_id)
    if not can_manage_meeting(current_user, meeting):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Only the meeting host or admin can manage this meeting",
        )


def parse_meeting_datetime(meeting_date: str, meeting_time: str) -> datetime:
    try:
        date_obj = datetime.strptime(meeting_date, "%Y-%m-%d").date()
        time_obj = datetime.strptime(meeting_time, "%H:%M").time()
        return datetime.combine(date_obj, time_obj)
    except ValueError as e:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid date or time format: {str(e)}",
        )


def validate_future_meeting_datetime(meeting_datetime: datetime) -> None:
    if meeting_datetime < utc_now():
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Meeting date and time must be in the future",
        )


def serialize_meeting(meeting: Meeting, host: Optional[User], participants: List[dict], current_user: User) -> dict:
    return {
        "id": str(meeting.id),
        "title": meeting.title,
        "description": meeting.description,
        "meeting_date": meeting.meeting_date.isoformat(),
        "meeting_time": meeting.meeting_time,
        "duration": meeting.duration,
        "host": {
            "id": str(host.id) if host else None,
            "email": host.email if host else None,
            "first_name": host.first_name if host else None,
            "last_name": host.last_name if host else None,
        } if host else None,
        "participants": participants,
        "client_id": getattr(meeting, "client_id", None),
        "project_id": getattr(meeting, "project_id", None),
        "contact_id": getattr(meeting, "contact_id", None),
        "zoom_meeting_url": meeting.zoom_meeting_url,
        "zoom_start_url": meeting.zoom_start_url if can_see_zoom_start_url(current_user, meeting) else None,
        "zoom_password": meeting.zoom_password,
        "host_video_enabled": meeting.host_video_enabled,
        "participant_video_enabled": meeting.participant_video_enabled,
        "status": meeting.status.value,
        "created_at": meeting.created_at.isoformat(),
    }


async def notify_meeting_participants(meeting: Meeting, current_user: User) -> None:
    for participant_id in meeting.participant_ids or []:
        notification = Notification(
            user_id=participant_id,
            company_id=str(meeting.company_id),
            type=NotificationType.MEETING_INVITED,
            title="Meeting invitation",
            message=f"You are invited to {meeting.title}",
            related_id=str(meeting.id),
            related_type="meeting",
            action_url=f"/meetings/{meeting.id}",
            metadata={
                "meeting_date": meeting.meeting_date.isoformat(),
                "meeting_time": meeting.meeting_time,
                "duration": meeting.duration,
                "host_id": str(current_user.id),
            },
        )
        await notification.insert()


async def _load_users_by_ids(user_ids: List[str]) -> dict:
    """Batch-load users by id in ONE query instead of one ``User.get`` per id.

    Returns a ``{str(id): User}`` map. Invalid or unknown ids are simply
    skipped (the previous per-id lookups would surface them as missing users).
    """
    from bson import ObjectId
    valid = [ObjectId(uid) for uid in dict.fromkeys(filter(None, user_ids)) if ObjectId.is_valid(uid)]
    if not valid:
        return {}
    users = await User.find({"_id": {"$in": valid}}).to_list()
    return {str(user.id): user for user in users}


async def get_participant_details(participant_ids: List[str]) -> List[dict]:
    users_by_id = await _load_users_by_ids(participant_ids or [])
    participants = []
    for pid in participant_ids:
        user = users_by_id.get(pid)
        if user:
            participants.append({
                "id": str(user.id),
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
            })
    return participants


async def serialize_meeting_response(meeting: Meeting, current_user: User) -> dict:
    # Batch host + participants into a single user query.
    users_by_id = await _load_users_by_ids([meeting.host_id, *(meeting.participant_ids or [])])
    host = users_by_id.get(meeting.host_id)
    participants = []
    for pid in meeting.participant_ids or []:
        user = users_by_id.get(pid)
        if user:
            participants.append({
                "id": str(user.id),
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
            })
    return serialize_meeting(meeting, host, participants, current_user)


@router.post("/")
async def create_meeting(
    title: str = Form(...),
    description: Optional[str] = Form(None),
    meeting_date: str = Form(...),  # Format: YYYY-MM-DD
    meeting_time: str = Form(...),  # Format: HH:MM
    duration: int = Form(30),
    participant_ids: Optional[str] = Form(None),  # Comma-separated user IDs
    client_id: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    contact_id: Optional[str] = Form(None),
    host_video_enabled: bool = Form(True),
    participant_video_enabled: bool = Form(True),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Create a meeting and schedule it on Zoom"""
    try:
        validate_meeting_duration(duration)

        meeting_datetime = parse_meeting_datetime(meeting_date, meeting_time)
        
        validate_future_meeting_datetime(meeting_datetime)
        
        # Parse participant IDs
        participant_list = normalize_participant_ids(participant_ids)
        
        # Validate participants are in the same company
        if participant_list:
            for pid in participant_list:
                participant = await User.get(pid)
                if not participant:
                    raise HTTPException(
                        status_code=http_status.HTTP_400_BAD_REQUEST,
                        detail=f"Participant {pid} not found"
                    )
                if participant.company_id != current_user.company_id:
                    raise HTTPException(
                        status_code=http_status.HTTP_400_BAD_REQUEST,
                        detail=f"Participant {pid} is not in your company"
                    )
                validate_meeting_participant_role(current_user, participant)
        if client_id:
            client = await Client.get(client_id)
            if not client or client.company_id != current_user.company_id:
                raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid client")
        if project_id:
            try:
                project = await Project.get(project_id)
            except Exception:
                project = None
            if not project:
                project = await Project.find_one({"company_id": current_user.company_id, "project_id": project_id})
            if not project or project.company_id != current_user.company_id:
                raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid project")
            project_id = str(project.id)
        if contact_id:
            try:
                contact = await SalesContact.get(contact_id)
            except Exception:
                contact = None
            if not contact or contact.company_id != current_user.company_id or contact.deleted:
                raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid contact")
        
        # Create Zoom meeting if credentials are configured
        zoom_data = {}
        if settings.ZOOM_API_KEY_COMPUTED and settings.ZOOM_API_SECRET_COMPUTED:
            try:
                zoom_data = await zoom_service.create_meeting(
                    topic=title,
                    start_time=meeting_datetime,
                    duration=duration,
                    host_email=current_user.email,
                    host_video=host_video_enabled,
                    participant_video=participant_video_enabled
                )
                logger.info(f"Zoom meeting created: {zoom_data.get('zoom_meeting_id')}")
            except Exception as e:
                logger.warning(f"Failed to create Zoom meeting: {str(e)}")
                # Continue without Zoom integration if it fails
                zoom_data = {}
        else:
            logger.warning("Zoom API credentials not configured, creating meeting without Zoom integration")
        
        # Create meeting record
        meeting = Meeting(
            title=title,
            description=description,
            company_id=current_user.company_id,
            created_by=str(current_user.id),
            host_id=str(current_user.id),
            participant_ids=participant_list,
            client_id=client_id,
            project_id=project_id,
            contact_id=contact_id,
            meeting_date=meeting_datetime,
            meeting_time=meeting_time,
            duration=duration,
            host_video_enabled=host_video_enabled,
            participant_video_enabled=participant_video_enabled,
            status=MeetingStatus.SCHEDULED,
            **zoom_data
        )
        
        await meeting.insert()

        await create_timeline_event(
            user_id=str(current_user.id),
            company_id=current_user.company_id,
            event_type=TimelineEventType.MEETING_CREATED,
            title="Meeting Created",
            description=meeting.title,
            related_module=TimelineModule.MEETING,
            related_record_id=str(meeting.id),
            actor_id=str(current_user.id),
            timestamp=meeting.created_at,
            metadata={
                "meeting_title": meeting.title,
                "meeting_date": meeting.meeting_date.isoformat(),
                "participant_ids": meeting.participant_ids,
            },
            idempotency_key=f"meeting:{meeting.id}:created:{current_user.id}",
        )

        await notify_meeting_participants(meeting, current_user)

        await publish_event(
            build_domain_event(
                event_name="MeetingCreated",
                aggregate_type="meeting",
                aggregate_id=str(meeting.id),
                company_id=str(current_user.company_id),
                actor_id=str(current_user.id),
                payload={
                    "title": meeting.title,
                    "description": meeting.description,
                    "meeting_date": meeting.meeting_date.isoformat(),
                    "meeting_time": meeting.meeting_time,
                    "duration": meeting.duration,
                    "participant_ids": meeting.participant_ids,
                    "status": meeting.status.value,
                },
                project_id=None,
                metadata={"source": "meeting_create"},
            )
        )
        
        return {
            "success": True,
            "message": "Meeting scheduled successfully",
            "meeting": await serialize_meeting_response(meeting, current_user)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating meeting: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create meeting: {str(e)}"
        )


@router.get("/")
async def list_meetings(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    meeting_status: Optional[str] = Query(None, alias="status"),
    upcoming: bool = Query(False),
    client_id: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    contact_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """List meetings for the current user's company"""
    query = {"company_id": current_user.company_id}
    
    # Filter by status if provided
    if meeting_status:
        try:
            query["status"] = MeetingStatus(meeting_status)
        except ValueError:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: {meeting_status}"
            )

    if upcoming:
        query["meeting_date"] = {"$gte": utc_now()}
    if client_id:
        query["client_id"] = client_id
    if project_id:
        query["project_id"] = project_id
    if contact_id:
        query["contact_id"] = contact_id
    
    if not any([client_id, project_id, contact_id]):
        query["$or"] = [
            {"host_id": str(current_user.id)},
            {"participant_ids": str(current_user.id)}
        ]
    
    sort_direction = Meeting.meeting_date if upcoming else -Meeting.meeting_date
    meetings = await Meeting.find(query).sort(sort_direction).skip(skip).limit(limit).to_list()
    total = await Meeting.find(query).count()
    
    # Enrich with user details. All hosts + participants on the page are
    # resolved in ONE batched query (previously 1 User.get per host plus 1
    # per participant, i.e. N+1 queries per meeting).
    meetings_data = []
    if meetings:
        all_user_ids = []
        for meeting in meetings:
            all_user_ids.append(meeting.host_id)
            all_user_ids.extend(meeting.participant_ids or [])
        users_by_id = await _load_users_by_ids(all_user_ids)
        for meeting in meetings:
            host = users_by_id.get(meeting.host_id)
            participants = []
            for pid in meeting.participant_ids or []:
                user = users_by_id.get(pid)
                if user:
                    participants.append({
                        "id": str(user.id),
                        "email": user.email,
                        "first_name": user.first_name,
                        "last_name": user.last_name,
                    })
            meetings_data.append(serialize_meeting(meeting, host, participants, current_user))
    
    return {
        "meetings": meetings_data,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.patch("/{meeting_id}")
async def update_meeting(
    meeting_id: str,
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    meeting_date: Optional[str] = Form(None),
    meeting_time: Optional[str] = Form(None),
    duration: Optional[int] = Form(None),
    participant_ids: Optional[str] = Form(None),
    client_id: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    contact_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Update meeting details and reschedule when date/time changes"""
    meeting = await Meeting.get(meeting_id)
    if not meeting:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    validate_meeting_management_access(current_user, meeting)

    if duration is not None:
        validate_meeting_duration(duration)
        meeting.duration = duration

    if title is not None:
        meeting.title = title
    if description is not None:
        meeting.description = description

    next_date = meeting_date or meeting.meeting_date.strftime("%Y-%m-%d")
    next_time = meeting_time or meeting.meeting_time
    if meeting_date is not None or meeting_time is not None:
        meeting_datetime = parse_meeting_datetime(next_date, next_time)
        validate_future_meeting_datetime(meeting_datetime)
        meeting.meeting_date = meeting_datetime
        meeting.meeting_time = next_time

    if participant_ids is not None:
        participant_list = normalize_participant_ids(participant_ids)
        for pid in participant_list:
            participant = await User.get(pid)
            if not participant:
                raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=f"Participant {pid} not found")
            if participant.company_id != current_user.company_id:
                raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=f"Participant {pid} is not in your company")
            validate_meeting_participant_role(current_user, participant)
        meeting.participant_ids = participant_list
    if client_id is not None:
        client = await Client.get(client_id) if client_id else None
        if client_id and (not client or client.company_id != current_user.company_id):
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid client")
        meeting.client_id = client_id or None
    if project_id is not None:
        if project_id:
            try:
                project = await Project.get(project_id)
            except Exception:
                project = None
        else:
            project = None
        if project_id and not project:
            project = await Project.find_one({"company_id": current_user.company_id, "project_id": project_id})
        if project_id and (not project or project.company_id != current_user.company_id):
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid project")
        meeting.project_id = str(project.id) if project else None
    if contact_id is not None:
        if contact_id:
            try:
                contact = await SalesContact.get(contact_id)
            except Exception:
                contact = None
        else:
            contact = None
        if contact_id and (not contact or contact.company_id != current_user.company_id or contact.deleted):
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid contact")
        meeting.contact_id = contact_id or None

    meeting.updated_at = utc_now()
    await meeting.save()

    await publish_event(
        build_domain_event(
            event_name="MeetingUpdated",
            aggregate_type="meeting",
            aggregate_id=str(meeting.id),
            company_id=str(current_user.company_id),
            actor_id=str(current_user.id),
            payload={"title": meeting.title, "meeting_date": meeting.meeting_date.isoformat(), "status": meeting.status.value},
            metadata={"source": "meeting_update"},
        )
    )

    return {"success": True, "message": "Meeting updated successfully", "meeting": await serialize_meeting_response(meeting, current_user)}


@router.post("/{meeting_id}/start")
async def start_meeting(meeting_id: str, current_user: User = Depends(get_current_company_admin_or_lead)):
    meeting = await Meeting.get(meeting_id)
    if not meeting:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    validate_meeting_management_access(current_user, meeting)
    if meeting.status == MeetingStatus.CANCELLED:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Cancelled meetings cannot be started")
    meeting.status = MeetingStatus.ONGOING
    meeting.started_at = utc_now()
    meeting.updated_at = utc_now()
    await meeting.save()
    return {"success": True, "message": "Meeting started", "meeting": await serialize_meeting_response(meeting, current_user)}


@router.post("/{meeting_id}/complete")
async def complete_meeting(meeting_id: str, current_user: User = Depends(get_current_company_admin_or_lead)):
    meeting = await Meeting.get(meeting_id)
    if not meeting:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    validate_meeting_management_access(current_user, meeting)
    if meeting.status == MeetingStatus.CANCELLED:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Cancelled meetings cannot be completed")
    meeting.status = MeetingStatus.COMPLETED
    meeting.ended_at = utc_now()
    meeting.updated_at = utc_now()
    await meeting.save()
    return {"success": True, "message": "Meeting completed", "meeting": await serialize_meeting_response(meeting, current_user)}


@router.post("/{meeting_id}/cancel")
async def cancel_meeting(meeting_id: str, current_user: User = Depends(get_current_company_admin_or_lead)):
    meeting = await Meeting.get(meeting_id)
    if not meeting:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    validate_meeting_management_access(current_user, meeting)
    if meeting.zoom_meeting_id and settings.ZOOM_API_KEY_COMPUTED:
        await zoom_service.delete_meeting(meeting.zoom_meeting_id, current_user.email)
    meeting.status = MeetingStatus.CANCELLED
    meeting.updated_at = utc_now()
    await meeting.save()
    return {"success": True, "message": "Meeting cancelled", "meeting": await serialize_meeting_response(meeting, current_user)}


@router.get("/{meeting_id}")
async def get_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get meeting details"""
    meeting = await Meeting.get(meeting_id)
    
    if not meeting:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Meeting not found"
        )
    
    check_company_access(current_user, meeting.company_id)
    
    if not can_view_meeting(current_user, meeting):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this meeting"
        )
    
    host = await User.get(meeting.host_id)
    participants = []
    for pid in meeting.participant_ids:
        user = await User.get(pid)
        if user:
            participants.append({
                "id": str(user.id),
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
            })
    
    return serialize_meeting(meeting, host, participants, current_user)


@router.delete("/{meeting_id}")
async def delete_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Delete a meeting"""
    meeting = await Meeting.get(meeting_id)
    
    if not meeting:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Meeting not found"
        )
    
    check_company_access(current_user, meeting.company_id)
    
    # Only host or admin can delete
    if meeting.host_id != str(current_user.id) and current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Only the meeting host or admin can delete this meeting"
        )
    
    # Delete from Zoom if exists
    if meeting.zoom_meeting_id and settings.ZOOM_API_KEY:
        try:
            host = await User.get(meeting.host_id)
            if host:
                await zoom_service.delete_meeting(meeting.zoom_meeting_id, host.email)
        except Exception as e:
            logger.warning(f"Failed to delete Zoom meeting: {str(e)}")
    
    await publish_event(
        build_domain_event(
            event_name="MeetingDeleted",
            aggregate_type="meeting",
            aggregate_id=str(meeting.id),
            company_id=str(current_user.company_id),
            actor_id=str(current_user.id),
            payload={
                "title": meeting.title,
                "description": meeting.description,
                "meeting_date": meeting.meeting_date.isoformat(),
                "meeting_time": meeting.meeting_time,
                "duration": meeting.duration,
                "participant_ids": meeting.participant_ids,
                "status": meeting.status.value,
            },
            metadata={"source": "meeting_delete"},
        )
    )

    await meeting.delete()
    
    return {
        "success": True,
        "message": "Meeting deleted successfully"
    }
