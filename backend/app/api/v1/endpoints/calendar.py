"""
Calendar Endpoints - Get meetings and tasks for calendar view
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timedelta

from app.models.meeting import Meeting
from app.models.task import Task
from app.models.user import User, UserRole
from app.api.dependencies import get_current_user, check_company_access

router = APIRouter()


@router.get("/events")
async def get_calendar_events(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    view_type: str = Query("my_calendar", description="my_calendar or team_calendar"),
    employee_id: Optional[str] = Query(None, description="Filter by employee ID (for team calendar)"),
    project_id: Optional[str] = Query(None, description="Filter by project ID (for team calendar)"),
    current_user: User = Depends(get_current_user),
):
    """
    Get calendar events (meetings and tasks) for the current user
    - my_calendar: Only events for the current user
    - team_calendar: Events for all team members (admin/lead only)
    """
    try:
        # Parse dates
        if start_date:
            start = datetime.strptime(start_date, "%Y-%m-%d").date()
        else:
            start = date.today() - timedelta(days=30)
        
        if end_date:
            end = datetime.strptime(end_date, "%Y-%m-%d").date()
        else:
            end = date.today() + timedelta(days=60)
        
        events = []
        
        # Determine which users' events to fetch
        user_ids_to_fetch = []
        
        if view_type == "my_calendar":
            # Only current user's events
            user_ids_to_fetch = [str(current_user.id)]
        elif view_type == "team_calendar":
            # Check if user has permission for team calendar
            # Check access - Admin, Manager, Lead can view team calendar
            is_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]
            
            if not is_admin and current_user.role not in [UserRole.MANAGER, UserRole.LEAD]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only Admin, Manager, and Lead can view team calendar"
                )
            
            # Get all users in the company
            if is_admin:
                # Company Admin sees all users in company
                query = {"company_id": current_user.company_id}
                if employee_id:
                    query["_id"] = employee_id
                users = await User.find(query).to_list()
                user_ids_to_fetch = [str(u.id) for u in users]
            elif current_user.role == UserRole.MANAGER:
                # Manager sees all subordinates
                subordinates = await current_user.get_all_subordinates()
                user_ids_to_fetch = [str(sub.id) for sub in subordinates]
                user_ids_to_fetch.append(str(current_user.id))
                
                if employee_id:
                    if employee_id not in user_ids_to_fetch:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="You can only view events for your team members"
                        )
                    user_ids_to_fetch = [employee_id]
            else:
                # Lead sees their employees
                employees = await User.find(
                    User.reports_to == str(current_user.id),
                    User.role == UserRole.EMPLOYEE
                ).to_list()
                user_ids_to_fetch = [str(e.id) for e in employees]
                user_ids_to_fetch.append(str(current_user.id))
                
                # Filter by employee_id if provided
                if employee_id:
                    if employee_id not in user_ids_to_fetch:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="You can only view events for your team members"
                        )
                    user_ids_to_fetch = [employee_id]
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="view_type must be 'my_calendar' or 'team_calendar'"
            )
        
        # Fetch meetings
        meeting_query = {
            "company_id": current_user.company_id,
            "meeting_date": {"$gte": start, "$lte": end}
        }
        
        # Filter by user for meetings
        if view_type == "my_calendar":
            # User is host or participant
            meeting_query["$or"] = [
                {"host_id": str(current_user.id)},
                {"participant_ids": str(current_user.id)}
            ]
        else:
            # Team calendar - filter by user_ids_to_fetch
            meeting_query["$or"] = [
                {"host_id": {"$in": user_ids_to_fetch}},
                {"participant_ids": {"$in": user_ids_to_fetch}}
            ]
        
        meetings = await Meeting.find(meeting_query).to_list()
        
        # Fetch tasks
        task_query = {
            "company_id": current_user.company_id,
        }
        
        # Filter by user for tasks
        if view_type == "my_calendar":
            task_query["assigned_to"] = str(current_user.id)
        else:
            task_query["assigned_to"] = {"$in": user_ids_to_fetch}
        
        # Filter by project if provided
        if project_id:
            from bson import ObjectId
            try:
                task_query["project_id"] = ObjectId(project_id)
            except:
                task_query["project_id"] = project_id
        
        # Filter tasks by due_date if available, or created_at
        tasks = await Task.find(task_query).to_list()
        
        # Format meetings as events
        for meeting in meetings:
            # Check if meeting is within date range
            meeting_date = meeting.meeting_date.date() if isinstance(meeting.meeting_date, datetime) else meeting.meeting_date
            
            if start <= meeting_date <= end:
                # Get host and participant names
                host = await User.get(meeting.host_id)
                host_name = f"{host.first_name} {host.last_name}" if host else "Unknown"
                
                participants = []
                for pid in meeting.participant_ids:
                    p = await User.get(pid)
                    if p:
                        participants.append(f"{p.first_name} {p.last_name}")
                
                events.append({
                    "id": f"meeting_{meeting.id}",
                    "type": "meeting",
                    "title": meeting.title,
                    "description": meeting.description,
                    "start": meeting_date.isoformat(),
                    "time": meeting.meeting_time,
                    "duration": meeting.duration,
                    "host": host_name,
                    "host_id": meeting.host_id,
                    "participants": participants,
                    "participant_ids": meeting.participant_ids,
                    "zoom_meeting_url": meeting.zoom_meeting_url,
                    "zoom_start_url": meeting.zoom_start_url,
                    "status": meeting.status.value,
                    "color": "#3B82F6",  # Blue for meetings
                })
        
        # Format tasks as events
        for task in tasks:
            # Use due_date if available, otherwise created_at
            task_date = None
            if task.due_date:
                task_date = task.due_date.date() if isinstance(task.due_date, datetime) else task.due_date
            elif task.created_at:
                task_date = task.created_at.date() if isinstance(task.created_at, datetime) else task.created_at
            
            if task_date and start <= task_date <= end:
                # Get assignee name
                assignee = await User.get(task.assigned_to) if task.assigned_to else None
                assignee_name = f"{assignee.first_name} {assignee.last_name}" if assignee else "Unassigned"
                
                # Get project name if available
                project_name = None
                if task.project_id:
                    from app.models.project import Project
                    project = await Project.get(task.project_id)
                    if project:
                        project_name = project.name
                
                events.append({
                    "id": f"task_{task.id}",
                    "type": "task",
                    "title": task.title,
                    "description": task.description,
                    "start": task_date.isoformat(),
                    "due_date": task.due_date.isoformat() if task.due_date else None,
                    "assignee": assignee_name,
                    "assignee_id": task.assigned_to,
                    "project_id": task.project_id,
                    "project_name": project_name,
                    "priority": task.priority.value if task.priority else "medium",
                    "status": task.status.value if task.status else "todo",
                    "color": "#10B981" if task.priority and task.priority.value == "urgent" else "#F59E0B" if task.priority and task.priority.value == "high" else "#3B82F6",  # Green for urgent, Orange for high, Blue for others
                })
        
        # Sort events by date
        events.sort(key=lambda x: x["start"])
        
        return {
            "events": events,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "view_type": view_type,
            "total": len(events)
        }
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid date format: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching calendar events: {str(e)}"
        )
