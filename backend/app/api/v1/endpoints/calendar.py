"""
Calendar Endpoints - Get meetings and tasks for calendar view
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timedelta

from app.models.meeting import Meeting
from app.models.task import Task, TaskStatus
from app.models.project import Project, ProjectStatus
from app.models.user import User, UserRole
from app.api.dependencies import get_current_user, check_company_access
from app.services.project_service import ProjectService
from app.services.reminder_service import calendar_due_tone

router = APIRouter()


def valid_object_ids(values: list[Any]) -> list[Any]:
    from bson import ObjectId

    return [ObjectId(str(value)) for value in values if value and ObjectId.is_valid(str(value))]


def is_past_calendar_datetime(value: datetime | date | None, now: Optional[datetime] = None) -> bool:
    if not value:
        return False
    today = (now or datetime.utcnow()).date()
    value_date = value.date() if isinstance(value, datetime) else value
    return value_date < today or (value_date == today and isinstance(value, datetime) and value.replace(tzinfo=None) < (now or datetime.utcnow()).replace(tzinfo=None))


def calendar_error_detail(exc: Exception) -> str:
    message = str(exc).strip() or exc.__class__.__name__
    return f"Error fetching calendar events: {message}"


def parse_calendar_window(start_date: Optional[str], end_date: Optional[str]):
    try:
        if start_date:
            start = datetime.strptime(start_date, "%Y-%m-%d").date()
        else:
            start = date.today() - timedelta(days=30)

        if end_date:
            end = datetime.strptime(end_date, "%Y-%m-%d").date()
        else:
            end = date.today() + timedelta(days=60)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid date format: {str(e)}",
        )

    start_at = datetime.combine(start, datetime.min.time())
    end_at = datetime.combine(end, datetime.max.time())
    return start, end, start_at, end_at


def build_calendar_task_query(
    current_user: User,
    *,
    view_type: str,
    user_ids_to_fetch: list[str],
    start_at: datetime,
    end_at: datetime,
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    task_query: Dict[str, Any] = {"company_id": current_user.company_id}
    if view_type == "my_calendar":
        task_query["assigned_to"] = str(current_user.id)
    else:
        task_query["assigned_to"] = {"$in": user_ids_to_fetch}

    task_query["$or"] = [
        {"due_date": {"$gte": start_at, "$lte": end_at}},
        {"due_date": None, "created_at": {"$gte": start_at, "$lte": end_at}},
    ]

    if project_id:
        from bson import ObjectId
        try:
            task_query["project_id"] = ObjectId(project_id)
        except Exception:
            task_query["project_id"] = project_id

    return task_query


def build_project_name_lookup_query(project_ids: list[str]) -> Dict[str, Any]:
    logical_ids = [str(project_id) for project_id in project_ids if project_id]
    object_ids = valid_object_ids(logical_ids)
    conditions = []
    if object_ids:
        conditions.append({"_id": {"$in": object_ids}})
    if logical_ids:
        conditions.append({"project_id": {"$in": logical_ids}})
    return {"$or": conditions or [{"project_id": {"$in": []}}]}


async def load_calendar_project_name(
    project_id,
    company_id: str,
    *,
    project_resolver=ProjectService.get_by_identifier,
) -> Optional[str]:
    if not project_id:
        return None

    project = await project_resolver(str(project_id), company_id)
    return project.name if project else None


def _enum_value(value, fallback: str) -> str:
    return getattr(value, "value", value) or fallback


def task_to_calendar_event(task, *, assignee_name: str = "Unassigned", project_name: Optional[str] = None) -> Dict[str, Any]:
    event_datetime = task.due_date or task.created_at
    event_date = event_datetime.date() if isinstance(event_datetime, datetime) else event_datetime
    event_time = event_datetime.strftime("%H:%M") if isinstance(event_datetime, datetime) else None
    priority = _enum_value(getattr(task, "priority", None), "medium")
    status_value = _enum_value(getattr(task, "status", None), "todo")
    return {
        "id": f"task_{task.id}",
        "type": "task",
        "title": task.title,
        "description": task.description,
        "start": event_date.isoformat() if event_date else None,
        "time": event_time,
        "due_date": task.due_date.isoformat() if getattr(task, "due_date", None) else None,
        "assignee": assignee_name,
        "assignee_id": task.assigned_to,
        "project_id": str(task.project_id) if getattr(task, "project_id", None) else None,
        "project_name": project_name,
        "priority": priority,
        "status": status_value,
        "color": "#10B981" if priority in {"urgent", "critical"} else "#F59E0B" if priority == "high" else "#3B82F6",
    }


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
    Get calendar events (meetings, tasks, projects, milestones) for the current user/team.
    - my_calendar: Only events assigned to or associated with the current user.
    - team_calendar: Team events (accessible by Admin, Manager, Lead).
    """
    try:
        start, end, start_at, end_at = parse_calendar_window(start_date, end_date)
        
        events = []
        
        # Determine user scope
        user_ids_to_fetch = []
        is_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]
        
        if view_type == "my_calendar":
            user_ids_to_fetch = [str(current_user.id)]
        elif view_type == "team_calendar":
            if not is_admin and current_user.role not in [UserRole.MANAGER, UserRole.LEAD]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only Admin, Manager, and Lead can view team calendar"
                )
            
            if is_admin:
                query = {"company_id": current_user.company_id}
                if employee_id:
                    employee_object_ids = valid_object_ids([employee_id])
                    if not employee_object_ids:
                        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid employee ID")
                    query["_id"] = employee_object_ids[0]
                users = await User.find(query).to_list()
                user_ids_to_fetch = [str(u.id) for u in users]
            elif current_user.role == UserRole.MANAGER:
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
            else:  # LEAD
                employees = await User.find(
                    User.reports_to == str(current_user.id),
                    User.role == UserRole.EMPLOYEE
                ).to_list()
                user_ids_to_fetch = [str(e.id) for e in employees]
                user_ids_to_fetch.append(str(current_user.id))
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
        
        # 1. Fetch meetings
        meeting_query = {
            "company_id": current_user.company_id,
            "meeting_date": {"$gte": start_at, "$lte": end_at}
        }
        
        if view_type == "my_calendar":
            meeting_query["$or"] = [
                {"host_id": str(current_user.id)},
                {"participant_ids": str(current_user.id)}
            ]
        else:
            meeting_query["$or"] = [
                {"host_id": {"$in": user_ids_to_fetch}},
                {"participant_ids": {"$in": user_ids_to_fetch}}
            ]
        
        meetings = await Meeting.find(meeting_query).to_list()
        
        # Format meetings
        # Optimize by loading users to map IDs to names
        user_ids_set = set()
        for meeting in meetings:
            user_ids_set.add(meeting.host_id)
            user_ids_set.update(meeting.participant_ids)
        
        users_cache = {}
        if user_ids_set:
            user_object_ids = valid_object_ids(list(user_ids_set))
            if user_object_ids:
                db_users = await User.find({"_id": {"$in": user_object_ids}}).to_list()
                for u in db_users:
                    users_cache[str(u.id)] = f"{u.first_name} {u.last_name}"

        for meeting in meetings:
            meeting_date = meeting.meeting_date.date() if isinstance(meeting.meeting_date, datetime) else meeting.meeting_date
            if start <= meeting_date <= end:
                host_name = users_cache.get(meeting.host_id, "Unknown")
                participants = [users_cache.get(pid, pid) for pid in meeting.participant_ids]
                
                meeting_status = meeting.status.value if hasattr(meeting.status, "value") else str(meeting.status)
                if meeting_status in {"completed", "cancelled"} or is_past_calendar_datetime(meeting.meeting_date):
                    color = "#9CA3AF"  # Gray for completed/cancelled/past meetings
                else:
                    color = "#8B5CF6"  # Purple for active meetings
                
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
                    "status": meeting_status,
                    "color": color,
                })

        # 2. Fetch projects
        project_query = {"company_id": current_user.company_id, "deleted": {"$ne": True}}
        if not is_admin:
            if view_type == "my_calendar":
                project_query["$or"] = [
                    {"lead_id": str(current_user.id)},
                    {"assigned_to": str(current_user.id)},
                    {"team_member_ids": str(current_user.id)}
                ]
            else:
                project_query["$or"] = [
                    {"lead_id": {"$in": user_ids_to_fetch}},
                    {"assigned_to": {"$in": user_ids_to_fetch}},
                    {"team_member_ids": {"$in": user_ids_to_fetch}}
                ]
        if project_id:
            project_object_ids = valid_object_ids([project_id])
            if project_object_ids:
                project_query["_id"] = project_object_ids[0]
            else:
                project_query["project_id"] = project_id
            
        projects = await Project.find(project_query).to_list()
        
        # Format projects and milestones
        for project in projects:
            p_status = project.status.value if hasattr(project.status, "value") else str(project.status)
            proj_completed = p_status == "completed"
            
            # Project Start Event (Blue/Gray)
            if project.start_date:
                proj_start_date = project.start_date.date() if isinstance(project.start_date, datetime) else project.start_date
                if start <= proj_start_date <= end:
                    events.append({
                        "id": f"project_start_{project.id}",
                        "type": "project_start",
                        "title": f"Project Started: {project.name}",
                        "description": project.description,
                        "start": proj_start_date.isoformat(),
                        "time": project.start_date.strftime("%H:%M") if isinstance(project.start_date, datetime) else None,
                        "project_id": str(project.id),
                        "project_name": project.name,
                        "status": p_status,
                        "color": "#9CA3AF" if proj_completed else "#3B82F6",  # Blue (Project Start) / Gray (Completed)
                    })
            
            # Project Due Event (Red/Gray)
            proj_due_date = project.delivery_date or project.end_date
            if proj_due_date:
                proj_due_date_parsed = proj_due_date.date() if isinstance(proj_due_date, datetime) else proj_due_date
                if start <= proj_due_date_parsed <= end:
                    events.append({
                        "id": f"project_due_{project.id}",
                        "type": "project_due",
                        "title": f"Project Due: {project.name}",
                        "description": project.description,
                        "start": proj_due_date_parsed.isoformat(),
                        "time": proj_due_date.strftime("%H:%M") if isinstance(proj_due_date, datetime) else None,
                        "project_id": str(project.id),
                        "project_name": project.name,
                        "status": p_status,
                        "color": "#9CA3AF" if proj_completed else "#EF4444",  # Red (Project Due) / Gray (Completed)
                    })
            
            # Milestones (Yellow/Gray)
            if project.milestones:
                for idx, milestone in enumerate(project.milestones):
                    milestone_date_raw = milestone.get("date") or milestone.get("due_date")
                    if milestone_date_raw:
                        if isinstance(milestone_date_raw, str):
                            try:
                                milestone_date = datetime.fromisoformat(milestone_date_raw.replace("Z", "+00:00"))
                            except ValueError:
                                continue
                        else:
                            milestone_date = milestone_date_raw
                        
                        milestone_date_parsed = milestone_date.date() if isinstance(milestone_date, datetime) else milestone_date
                        if start <= milestone_date_parsed <= end:
                            m_status = milestone.get("status", "pending")
                            m_completed = m_status == "completed" or proj_completed
                            events.append({
                                "id": f"project_milestone_{project.id}_{idx}",
                                "type": "milestone",
                                "title": f"Milestone: {milestone.get('name') or milestone.get('title')} ({project.name})",
                                "description": milestone.get("description"),
                                "start": milestone_date_parsed.isoformat(),
                                "project_id": str(project.id),
                                "project_name": project.name,
                                "status": m_status,
                                "color": "#9CA3AF" if m_completed else "#EAB308",  # Yellow (Milestone) / Gray (Completed)
                            })

        # 3. Fetch tasks
        task_query = build_calendar_task_query(
            current_user,
            view_type=view_type,
            user_ids_to_fetch=user_ids_to_fetch,
            start_at=start_at,
            end_at=end_at,
            project_id=project_id,
        )
        tasks = await Task.find(task_query).to_list()
        
        # Format tasks
        # Cache unique assigned_to user names to prevent N+1 queries
        task_assignee_ids = {task.assigned_to for task in tasks if task.assigned_to}
        assignee_names_cache = {}
        if task_assignee_ids:
            assignee_object_ids = valid_object_ids(list(task_assignee_ids))
            if assignee_object_ids:
                task_users = await User.find({"_id": {"$in": assignee_object_ids}}).to_list()
                for u in task_users:
                    assignee_names_cache[str(u.id)] = f"{u.first_name} {u.last_name}"

        # Cache unique project names to prevent N+1 queries
        project_ids_set = {str(task.project_id) for task in tasks if task.project_id}
        project_names_cache = {}
        if project_ids_set:
            # We can lookup by either internal ID or logical project_id
            db_projects = await Project.find(build_project_name_lookup_query(list(project_ids_set))).to_list()
            for p in db_projects:
                project_names_cache[str(p.id)] = p.name
                if p.project_id:
                    project_names_cache[p.project_id] = p.name

        for task in tasks:
            task_status = _enum_value(getattr(task, "status", None), "todo")
            task_completed = task_status == "completed" or task_status == "done"
            priority = _enum_value(getattr(task, "priority", None), "medium")
            
            assignee_name = assignee_names_cache.get(task.assigned_to, "Unassigned")
            proj_name = project_names_cache.get(str(task.project_id), task.project_id) if task.project_id else None
            
            # Task Start / Assigned Event (Green/Gray)
            if task.start_date:
                t_start_date = task.start_date.date() if isinstance(task.start_date, datetime) else task.start_date
                if start <= t_start_date <= end:
                    events.append({
                        "id": f"task_start_{task.id}",
                        "type": "task_assigned",
                        "title": f"Task Assigned: {task.title}",
                        "description": task.description,
                        "start": t_start_date.isoformat(),
                        "time": task.start_date.strftime("%H:%M") if isinstance(task.start_date, datetime) else None,
                        "due_date": task.due_date.isoformat() if getattr(task, "due_date", None) else None,
                        "assignee": assignee_name,
                        "assignee_id": task.assigned_to,
                        "project_id": str(task.project_id) if getattr(task, "project_id", None) else None,
                        "project_name": proj_name,
                        "priority": priority,
                        "status": task_status,
                        "color": "#9CA3AF" if task_completed else "#10B981",  # Green (Task Assigned) / Gray (Completed)
                    })

            # Task Due Event (Orange/Yellow/Gray)
            t_due_date = task.due_date
            if not t_due_date and task.created_at and not task.start_date:
                t_due_date = task.created_at
                
            if t_due_date:
                t_due_date_parsed = t_due_date.date() if isinstance(t_due_date, datetime) else t_due_date
                if start <= t_due_date_parsed <= end:
                    if task_completed:
                        color = "#9CA3AF"  # Gray for Completed
                        reminder_status = {"label": "Completed", "color": color, "tone": "completed"}
                    else:
                        reminder_status = calendar_due_tone(t_due_date)
                        color = reminder_status["color"]
                    
                    events.append({
                        "id": f"task_due_{task.id}",
                        "type": "task_due",
                        "title": f"Task Due: {task.title}",
                        "description": task.description,
                        "start": t_due_date_parsed.isoformat(),
                        "time": t_due_date.strftime("%H:%M") if isinstance(t_due_date, datetime) else None,
                        "due_date": task.due_date.isoformat() if getattr(task, "due_date", None) else None,
                        "assignee": assignee_name,
                        "assignee_id": task.assigned_to,
                        "project_id": str(task.project_id) if getattr(task, "project_id", None) else None,
                        "project_name": proj_name,
                        "priority": priority,
                        "status": task_status,
                        "reminder_status": reminder_status,
                        "color": color,
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
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=calendar_error_detail(e)
        )
