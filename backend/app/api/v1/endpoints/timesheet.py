"""
Timesheet Endpoints - Daily timesheet management
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form, Query
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timedelta

from app.models.timesheet import TimesheetEntry, TimesheetSummary, TimesheetStatus
from app.models.task import Task
from app.models.project import Project
from app.models.user import User, UserRole, Employee, Lead
from app.api.dependencies import get_current_user, check_company_access
from app.core.clock import utc_now

router = APIRouter()


@router.post("/entries")
async def create_timesheet_entry(
    date: str = Form(...),  # YYYY-MM-DD
    project_id: Optional[str] = Form(None),
    task_id: Optional[str] = Form(None),
    assigned_on: Optional[str] = Form(None),  # YYYY-MM-DD
    closed_on: Optional[str] = Form(None),  # YYYY-MM-DD
    hours_spent: float = Form(0.0),
    hours_spent_today: float = Form(0.0),
    is_meeting: bool = Form(False),
    is_miscellaneous: bool = Form(False),
    meeting_title: Optional[str] = Form(None),
    miscellaneous_description: Optional[str] = Form(None),
    notification_manager_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Create or update a timesheet entry"""
    try:
        entry_date = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date format. Use YYYY-MM-DD"
        )
    
    # Get project and task names if provided
    project_name = None
    task_title = None
    
    if project_id:
        project = await Project.get(project_id)
        if project:
            project_name = project.name
            check_company_access(current_user, project.company_id)
    
    if task_id:
        task = await Task.get(task_id)
        if task:
            task_title = task.title
            check_company_access(current_user, task.company_id)
            if not project_id and task.project_id:
                project_id = str(task.project_id)
                project = await Project.get(task.project_id)
                if project:
                    project_name = project.name
    
    # Parse dates
    assigned_on_date = None
    if assigned_on:
        try:
            assigned_on_date = datetime.strptime(assigned_on, "%Y-%m-%d").date()
        except:
            pass
    
    closed_on_date = None
    if closed_on:
        try:
            closed_on_date = datetime.strptime(closed_on, "%Y-%m-%d").date()
        except:
            pass
    
    # Check if entry already exists for this date, project, task
    query = {
        "company_id": current_user.company_id,
        "user_id": str(current_user.id),
        "date": entry_date,
    }
    
    if task_id:
        query["task_id"] = task_id
    elif project_id:
        query["project_id"] = project_id
    
    existing_entry = await TimesheetEntry.find_one(query)
    
    if existing_entry:
        # Update existing entry
        existing_entry.hours_spent = hours_spent
        existing_entry.hours_spent_today = hours_spent_today
        existing_entry.assigned_on = assigned_on_date
        existing_entry.closed_on = closed_on_date
        existing_entry.is_meeting = is_meeting
        existing_entry.is_miscellaneous = is_miscellaneous
        existing_entry.meeting_title = meeting_title
        existing_entry.miscellaneous_description = miscellaneous_description
        existing_entry.notification_manager_id = notification_manager_id
        existing_entry.updated_at = utc_now()
        await existing_entry.save()
        entry = existing_entry
    else:
        # Create new entry
        entry = TimesheetEntry(
            company_id=current_user.company_id,
            user_id=str(current_user.id),
            date=entry_date,
            project_id=project_id,
            project_name=project_name,
            task_id=task_id,
            task_title=task_title,
            assigned_on=assigned_on_date,
            closed_on=closed_on_date,
            hours_spent=hours_spent,
            hours_spent_today=hours_spent_today,
            is_meeting=is_meeting,
            is_miscellaneous=is_miscellaneous,
            meeting_title=meeting_title,
            miscellaneous_description=miscellaneous_description,
            notification_manager_id=notification_manager_id,
            status=TimesheetStatus.PENDING,
        )
        await entry.insert()
    
    # Update summary
    await update_timesheet_summary(current_user.company_id, str(current_user.id), entry_date)
    
    return {
        "message": "Timesheet entry saved successfully",
        "entry_id": str(entry.id)
    }


@router.get("/my-timesheet")
async def get_my_timesheet(
    date_filter: Optional[str] = Query(None, alias="date", description="Date (YYYY-MM-DD). If not provided, uses today"),
    current_user: User = Depends(get_current_user),
):
    """Get current user's timesheet for a specific date"""
    try:
        if date_filter:
            entry_date = datetime.strptime(date_filter, "%Y-%m-%d").date()
        else:
            entry_date = date.today()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date format. Use YYYY-MM-DD"
        )
    
    entries = await TimesheetEntry.find({
        "company_id": current_user.company_id,
        "user_id": str(current_user.id),
        "date": entry_date
    }).sort("created_at").to_list()
    
    # Calculate totals
    total_hours = sum(e.hours_spent_today for e in entries)
    hours_spent_today = sum(e.hours_spent_today for e in entries)
    
    return {
        "date": entry_date.isoformat(),
        "entries": [
            {
                "id": str(e.id),
                "project_id": e.project_id,
                "project_name": e.project_name,
                "task_id": e.task_id,
                "task_title": e.task_title,
                "assigned_on": e.assigned_on.isoformat() if e.assigned_on else None,
                "closed_on": e.closed_on.isoformat() if e.closed_on else None,
                "hours_spent": e.hours_spent,
                "hours_spent_today": e.hours_spent_today,
                "is_meeting": e.is_meeting,
                "is_miscellaneous": e.is_miscellaneous,
                "meeting_title": e.meeting_title,
                "miscellaneous_description": e.miscellaneous_description,
                "status": e.status.value,
            }
            for e in entries
        ],
        "total_hours": total_hours,
        "hours_spent_today": hours_spent_today,
        "total_entries": len(entries)
    }


@router.get("/team-timesheet")
async def get_team_timesheet(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """Get team timesheet with hierarchical RBAC"""
    # Check access - Admin, Sub Admin, Manager, Lead can view team timesheet
    is_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SUB_ADMIN]
    
    if not is_admin and current_user.role not in [UserRole.MANAGER, UserRole.LEAD]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin, Manager, and Lead can view team timesheet"
        )
    
    # Determine date range
    if start_date:
        start = datetime.strptime(start_date, "%Y-%m-%d").date()
    else:
        start = date.today() - timedelta(days=7)
    
    if end_date:
        end = datetime.strptime(end_date, "%Y-%m-%d").date()
    else:
        end = date.today()
    
    # Get user IDs to fetch based on hierarchy
    user_ids_to_fetch = []
    
    if is_admin:
        # Admin sees all users in company
        if employee_id:
            user_ids_to_fetch = [employee_id]
        else:
            users = await User.find({
                "company_id": current_user.company_id,
                "role": {"$in": [UserRole.EMPLOYEE.value, UserRole.LEAD.value, UserRole.MANAGER.value]}
            }).to_list()
            user_ids_to_fetch = [str(u.id) for u in users]
    elif current_user.role == UserRole.MANAGER:
        # Manager sees all subordinates
        subordinates = await current_user.get_all_subordinates()
        subordinate_ids = [str(sub.id) for sub in subordinates]
        if employee_id:
            if employee_id not in subordinate_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only view timesheets for your team members"
                )
            user_ids_to_fetch = [employee_id]
        else:
            user_ids_to_fetch = subordinate_ids
    else:
        # Lead sees their employees
        employees = await User.find(
            User.reports_to == str(current_user.id),
            User.role == UserRole.EMPLOYEE
        ).to_list()
        user_ids_to_fetch = [str(e.id) for e in employees]
        if employee_id:
            if employee_id not in user_ids_to_fetch:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only view timesheets for your team members"
                )
            user_ids_to_fetch = [employee_id]
    
    # Fetch entries
    entries = await TimesheetEntry.find({
        "company_id": current_user.company_id,
        "user_id": {"$in": user_ids_to_fetch},
        "date": {"$gte": start, "$lte": end}
    }).sort([("date", -1), ("user_id", 1)]).to_list()
    
    # Group by user and date
    timesheet_data = {}
    for entry in entries:
        user_id = entry.user_id
        entry_date = entry.date.isoformat()
        
        if user_id not in timesheet_data:
            timesheet_data[user_id] = {}
        if entry_date not in timesheet_data[user_id]:
            timesheet_data[user_id][entry_date] = {
                "date": entry_date,
                "entries": [],
                "total_hours": 0.0
            }
        
        timesheet_data[user_id][entry_date]["entries"].append({
            "id": str(entry.id),
            "project_name": entry.project_name,
            "task_title": entry.task_title,
            "hours_spent_today": entry.hours_spent_today,
            "status": entry.status.value,
        })
        timesheet_data[user_id][entry_date]["total_hours"] += entry.hours_spent_today
    
    # Get user names
    user_data = {}
    for user_id in user_ids_to_fetch:
        user = await User.get(user_id)
        if user:
            user_data[user_id] = {
                "id": user_id,
                "name": f"{user.first_name} {user.last_name}",
                "email": user.email
            }
    
    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "timesheet_data": timesheet_data,
        "user_data": user_data
    }


@router.get("/list")
async def get_timesheet_list(
    current_user: User = Depends(get_current_user),
):
    """Get timesheet list with last 5 days status for team members (hierarchical RBAC)"""
    # Check access - Admin, Sub Admin, Manager, Lead can view team timesheet list
    is_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SUB_ADMIN]
    
    if not is_admin and current_user.role not in [UserRole.MANAGER, UserRole.LEAD]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin, Manager, and Lead can view timesheet list"
        )
    
    # Get last 5 days
    today = date.today()
    dates = [today - timedelta(days=i) for i in range(5)]
    
    # Get user IDs to fetch based on hierarchy
    user_ids_to_fetch = []
    
    if is_admin:
        # Admin sees all users in company
        users = await User.find({
            "company_id": current_user.company_id,
            "role": {"$in": [UserRole.EMPLOYEE.value, UserRole.LEAD.value, UserRole.MANAGER.value]}
        }).to_list()
        user_ids_to_fetch = [str(u.id) for u in users]
    elif current_user.role == UserRole.MANAGER:
        # Manager sees all subordinates
        subordinates = await current_user.get_all_subordinates()
        user_ids_to_fetch = [str(sub.id) for sub in subordinates]
    else:
        # Lead sees their employees
        employees = await User.find(
            User.reports_to == str(current_user.id),
            User.role == UserRole.EMPLOYEE
        ).to_list()
        user_ids_to_fetch = [str(e.id) for e in employees]
    
    # Fetch summaries for last 5 days
    summaries = await TimesheetSummary.find({
        "company_id": current_user.company_id,
        "user_id": {"$in": user_ids_to_fetch},
        "date": {"$in": dates}
    }).to_list()
    
    # Get user data
    user_data = {}
    for user_id in user_ids_to_fetch:
        user = await User.get(user_id)
        if user:
            user_data[user_id] = {
                "id": user_id,
                "name": f"{user.first_name} {user.last_name}",
                "email": user.email
            }
    
    # Build response
    timesheet_list = []
    for user_id in user_ids_to_fetch:
        if user_id not in user_data:
            continue
        
        last_5_days = []
        for d in dates:
            summary = next((s for s in summaries if s.user_id == user_id and s.date == d), None)
            if summary:
                last_5_days.append({
                    "date": d.isoformat(),
                    "status": summary.status.value,
                    "total_hours": summary.total_hours
                })
            else:
                # Check if user has any entry for this date
                entry = await TimesheetEntry.find_one({
                    "company_id": current_user.company_id,
                    "user_id": user_id,
                    "date": d
                })
                if entry:
                    last_5_days.append({
                        "date": d.isoformat(),
                        "status": entry.status.value,
                        "total_hours": entry.hours_spent_today
                    })
                else:
                    last_5_days.append({
                        "date": d.isoformat(),
                        "status": "missing",
                        "total_hours": 0.0
                    })
        
        timesheet_list.append({
            "user_id": user_id,
            "name": user_data[user_id]["name"],
            "email": user_data[user_id]["email"],
            "last_5_days": last_5_days
        })
    
    return {
        "timesheet_list": timesheet_list,
        "dates": [d.isoformat() for d in dates]
    }


@router.delete("/entries/{entry_id}")
async def delete_timesheet_entry(
    entry_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a timesheet entry"""
    entry = await TimesheetEntry.get(entry_id)
    
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Timesheet entry not found"
        )
    
    check_company_access(current_user, entry.company_id)
    
    # Only allow users to delete their own entries (unless admin/lead)
    # Check access - Admin, Sub Admin, Manager, Lead can delete team entries
    is_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SUB_ADMIN]
    
    if entry.user_id != str(current_user.id) and not is_admin and current_user.role not in [UserRole.MANAGER, UserRole.LEAD]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own timesheet entries"
        )
    
    entry_date = entry.date
    await entry.delete()
    
    # Update summary
    await update_timesheet_summary(entry.company_id, entry.user_id, entry_date)
    
    return {"message": "Timesheet entry deleted successfully"}


async def update_timesheet_summary(company_id: str, user_id: str, entry_date: date):
    """Update or create timesheet summary for a user and date"""
    entries = await TimesheetEntry.find({
        "company_id": company_id,
        "user_id": user_id,
        "date": entry_date
    }).to_list()
    
    total_hours = sum(e.hours_spent_today for e in entries)
    
    # Determine status
    status = TimesheetStatus.PENDING
    if len(entries) == 0:
        status = TimesheetStatus.MISSING
    elif total_hours == 0:
        status = TimesheetStatus.ABSENT
    else:
        # Check if all entries are submitted/approved
        all_submitted = all(e.status in [TimesheetStatus.SUBMITTED, TimesheetStatus.APPROVED] for e in entries)
        if all_submitted:
            status = TimesheetStatus.SUBMITTED
    
    summary = await TimesheetSummary.find_one({
        "company_id": company_id,
        "user_id": user_id,
        "date": entry_date
    })
    
    if summary:
        summary.total_hours = total_hours
        summary.total_entries = len(entries)
        summary.status = status
        summary.updated_at = utc_now()
        await summary.save()
    else:
        summary = TimesheetSummary(
            company_id=company_id,
            user_id=user_id,
            date=entry_date,
            total_hours=total_hours,
            total_entries=len(entries),
            status=status,
        )
        await summary.insert()


