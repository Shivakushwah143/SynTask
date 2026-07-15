"""
Time Tracking Endpoints - Track time spent on tasks
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form
from typing import Optional
from datetime import datetime

from app.models.time_tracking import TimeLog, TimeTrackingSummary
from app.models.task import Task
from app.models.user import User, UserRole
from app.api.dependencies import get_current_user, check_company_access
from app.api.deps import Pagination50, PaginationParams

router = APIRouter()


@router.post("/tasks/{task_id}/log-time")
async def log_time(
    task_id: str,
    hours: float = Form(...),
    minutes: Optional[int] = Form(0),
    date: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    is_billable: bool = Form(False),
    billing_rate: Optional[float] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Log time spent on a task"""
    task = await Task.get(task_id)
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    check_company_access(current_user, task.company_id)
    
    # Calculate total hours
    total_hours = hours + (minutes / 60.0 if minutes else 0)
    
    # Parse date
    log_date = datetime.now()
    if date:
        try:
            log_date = datetime.fromisoformat(date.replace('Z', '+00:00'))
        except:
            try:
                log_date = datetime.strptime(date, '%Y-%m-%d')
            except:
                pass
    
    time_log = TimeLog(
        task_id=task_id,
        company_id=current_user.company_id,
        user_id=str(current_user.id),
        user_name=current_user.full_name(),
        hours=total_hours,
        minutes=minutes,
        date=log_date,
        description=description,
        is_billable=is_billable,
        billing_rate=billing_rate,
    )
    
    await time_log.insert()
    
    # Update time tracking summary
    summary = await TimeTrackingSummary.find_one(
        TimeTrackingSummary.task_id == task_id
    )
    
    if not summary:
        summary = TimeTrackingSummary(
            task_id=task_id,
            company_id=current_user.company_id,
        )
        await summary.insert()
    
    summary.total_hours += total_hours
    if is_billable:
        summary.total_billable_hours += total_hours
    summary.total_entries += 1
    summary.last_logged_at = datetime.now()
    summary.updated_at = datetime.now()
    await summary.save()
    
    # Update task actual hours
    if task.actual_hours:
        task.actual_hours += total_hours
    else:
        task.actual_hours = total_hours
    await task.save()
    
    return {
        "message": "Time logged successfully",
        "time_log_id": str(time_log.id),
        "total_hours": summary.total_hours
    }


@router.get("/tasks/{task_id}/time-logs")
async def get_task_time_logs(
    task_id: str,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user),
):
    """Get all time logs for a task"""
    skip, limit = pagination.skip, pagination.limit
    task = await Task.get(task_id)
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    check_company_access(current_user, task.company_id)
    
    time_logs = await TimeLog.find(
        TimeLog.task_id == task_id
    ).skip(skip).limit(limit).sort("-date").to_list()
    
    total = await TimeLog.find(TimeLog.task_id == task_id).count()
    
    return {
        "time_logs": [
            {
                "id": str(log.id),
                "user_id": log.user_id,
                "user_name": log.user_name,
                "hours": log.hours,
                "date": log.date,
                "description": log.description,
                "is_billable": log.is_billable,
                "billing_rate": log.billing_rate,
                "created_at": log.created_at,
            }
            for log in time_logs
        ],
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/tasks/{task_id}/time-summary")
async def get_task_time_summary(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get time tracking summary for a task"""
    task = await Task.get(task_id)
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    check_company_access(current_user, task.company_id)
    
    summary = await TimeTrackingSummary.find_one(
        TimeTrackingSummary.task_id == task_id
    )
    
    if not summary:
        return {
            "task_id": task_id,
            "total_hours": 0.0,
            "total_billable_hours": 0.0,
            "total_entries": 0,
            "estimated_hours": task.estimated_hours,
            "actual_hours": task.actual_hours or 0.0,
        }
    
    return {
        "task_id": task_id,
        "total_hours": summary.total_hours,
        "total_billable_hours": summary.total_billable_hours,
        "total_entries": summary.total_entries,
        "estimated_hours": task.estimated_hours,
        "actual_hours": task.actual_hours or 0.0,
        "last_logged_at": summary.last_logged_at,
    }


@router.delete("/time-logs/{log_id}")
async def delete_time_log(
    log_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a time log entry"""
    time_log = await TimeLog.get(log_id)
    
    if not time_log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Time log not found"
        )
    
    check_company_access(current_user, time_log.company_id)
    
    # Only allow deletion by the user who created it or admin
    if time_log.user_id != str(current_user.id) and current_user.role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own time logs"
        )
    
    # Update summary
    summary = await TimeTrackingSummary.find_one(
        TimeTrackingSummary.task_id == time_log.task_id
    )
    
    if summary:
        summary.total_hours -= time_log.hours
        if time_log.is_billable:
            summary.total_billable_hours -= time_log.hours
        summary.total_entries -= 1
        summary.updated_at = datetime.now()
        await summary.save()
    
    # Update task
    task = await Task.get(time_log.task_id)
    if task and task.actual_hours:
        task.actual_hours = max(0, task.actual_hours - time_log.hours)
        await task.save()
    
    await time_log.delete()
    
    return {"message": "Time log deleted successfully"}


@router.get("/users/{user_id}/time-logs")
async def get_user_time_logs(
    user_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user),
):
    """Get time logs for a user"""
    skip, limit = pagination.skip, pagination.limit
    # Check access
    if user_id != str(current_user.id) and current_user.role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own time logs"
        )
    
    query = {"user_id": user_id, "company_id": current_user.company_id}
    
    # Date filtering
    if start_date:
        try:
            start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query["date"] = {"$gte": start}
        except:
            pass
    
    if end_date:
        try:
            end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            if "date" in query:
                query["date"]["$lte"] = end
            else:
                query["date"] = {"$lte": end}
        except:
            pass
    
    time_logs = await TimeLog.find(query).skip(skip).limit(limit).sort("-date").to_list()
    total = await TimeLog.find(query).count()
    
    return {
        "time_logs": [
            {
                "id": str(log.id),
                "task_id": log.task_id,
                "hours": log.hours,
                "date": log.date,
                "description": log.description,
                "is_billable": log.is_billable,
                "created_at": log.created_at,
            }
            for log in time_logs
        ],
        "total": total,
        "skip": skip,
        "limit": limit
    }


