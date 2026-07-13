"""
Meeting Management Endpoints with Zoom Integration
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form, Query
from typing import Optional, List
from datetime import datetime, timedelta
import logging

from app.models.meeting import Meeting, MeetingStatus
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

logger = logging.getLogger(__name__)

router = APIRouter()
zoom_service = ZoomService()


@router.post("/")
async def create_meeting(
    title: str = Form(...),
    description: Optional[str] = Form(None),
    meeting_date: str = Form(...),  # Format: YYYY-MM-DD
    meeting_time: str = Form(...),  # Format: HH:MM
    duration: int = Form(30),
    participant_ids: Optional[str] = Form(None),  # Comma-separated user IDs
    host_video_enabled: bool = Form(True),
    participant_video_enabled: bool = Form(True),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Create a meeting and schedule it on Zoom"""
    try:
        # Parse meeting date and time
        try:
            date_obj = datetime.strptime(meeting_date, "%Y-%m-%d").date()
            time_obj = datetime.strptime(meeting_time, "%H:%M").time()
            meeting_datetime = datetime.combine(date_obj, time_obj)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid date or time format: {str(e)}"
            )
        
        # Check if meeting is in the future
        if meeting_datetime < datetime.now():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Meeting date and time must be in the future"
            )
        
        # Parse participant IDs
        participant_list = []
        if participant_ids:
            participant_list = [pid.strip() for pid in participant_ids.split(",") if pid.strip()]
        
        # Validate participants are in the same company
        if participant_list:
            for pid in participant_list:
                participant = await User.get(pid)
                if not participant:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Participant {pid} not found"
                    )
                if participant.company_id != current_user.company_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Participant {pid} is not in your company"
                    )
        
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
        
        # Get participant details for response
        participants = []
        if participant_list:
            for pid in participant_list:
                user = await User.get(pid)
                if user:
                    participants.append({
                        "id": str(user.id),
                        "email": user.email,
                        "first_name": user.first_name,
                        "last_name": user.last_name,
                    })
        
        return {
            "success": True,
            "message": "Meeting scheduled successfully",
            "meeting": {
                "id": str(meeting.id),
                "title": meeting.title,
                "description": meeting.description,
                "meeting_date": meeting.meeting_date.isoformat(),
                "meeting_time": meeting.meeting_time,
                "duration": meeting.duration,
                "host": {
                    "id": str(current_user.id),
                    "email": current_user.email,
                    "first_name": current_user.first_name,
                    "last_name": current_user.last_name,
                },
                "participants": participants,
                "zoom_meeting_url": meeting.zoom_meeting_url,
                "zoom_start_url": meeting.zoom_start_url,
                "zoom_password": meeting.zoom_password,
                "host_video_enabled": meeting.host_video_enabled,
                "participant_video_enabled": meeting.participant_video_enabled,
                "status": meeting.status.value,
                "created_at": meeting.created_at.isoformat(),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating meeting: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create meeting: {str(e)}"
        )


@router.get("/")
async def list_meetings(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """List meetings for the current user's company"""
    query = {"company_id": current_user.company_id}
    
    # Filter by status if provided
    if status:
        try:
            query["status"] = MeetingStatus(status)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: {status}"
            )
    
    # Employees can only see meetings they're part of
    if current_user.role == UserRole.EMPLOYEE:
        query["$or"] = [
            {"host_id": str(current_user.id)},
            {"participant_ids": str(current_user.id)}
        ]
    
    meetings = await Meeting.find(query).sort(-Meeting.meeting_date).skip(skip).limit(limit).to_list()
    total = await Meeting.find(query).count()
    
    # Enrich with user details
    meetings_data = []
    for meeting in meetings:
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
        
        meetings_data.append({
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
            "zoom_meeting_url": meeting.zoom_meeting_url,
            "zoom_start_url": meeting.zoom_start_url,
            "zoom_password": meeting.zoom_password,
            "host_video_enabled": meeting.host_video_enabled,
            "participant_video_enabled": meeting.participant_video_enabled,
            "status": meeting.status.value,
            "created_at": meeting.created_at.isoformat(),
        })
    
    return {
        "meetings": meetings_data,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/{meeting_id}")
async def get_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get meeting details"""
    meeting = await Meeting.get(meeting_id)
    
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found"
        )
    
    check_company_access(current_user, meeting.company_id)
    
    # Employees can only see meetings they're part of
    if current_user.role == UserRole.EMPLOYEE:
        if meeting.host_id != str(current_user.id) and str(current_user.id) not in meeting.participant_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
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
        "zoom_meeting_url": meeting.zoom_meeting_url,
        "zoom_start_url": meeting.zoom_start_url,
        "zoom_password": meeting.zoom_password,
        "host_video_enabled": meeting.host_video_enabled,
        "participant_video_enabled": meeting.participant_video_enabled,
        "status": meeting.status.value,
        "created_at": meeting.created_at.isoformat(),
    }


@router.delete("/{meeting_id}")
async def delete_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Delete a meeting"""
    meeting = await Meeting.get(meeting_id)
    
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found"
        )
    
    check_company_access(current_user, meeting.company_id)
    
    # Only host or admin can delete
    if meeting.host_id != str(current_user.id) and current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
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
