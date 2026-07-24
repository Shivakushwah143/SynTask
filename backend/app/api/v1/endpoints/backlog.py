"""
Backlog Management Endpoints - Prioritized list of tasks like Jira Backlog
"""
from fastapi import APIRouter, HTTPException, status, Depends
from typing import Optional
from datetime import datetime

from app.models.task import Task, TaskStatus, TaskPriority
from app.models.project import Project, Sprint
from app.models.user import User
from app.api.dependencies import get_current_user, check_company_access
from app.api.deps import Pagination50, PaginationParams
from app.core.clock import utc_now

router = APIRouter()


@router.get("/projects/{project_id}/backlog")
async def get_project_backlog(
    project_id: str,
    epic_id: Optional[str] = None,
    priority: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user),
):
    """Get backlog for a project (tasks not in any sprint)"""
    skip, limit = pagination.skip, pagination.limit
    project = await Project.get(project_id)
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    # Get all active sprints for the project
    active_sprints = await Sprint.find({
        "project_id": project_id,
        "company_id": project.company_id,
        "state": "active"
    }).to_list()
    
    active_sprint_ids = [str(s.id) for s in active_sprints]
    
    # Query for tasks not in active sprints
    query = {
        "project_id": project_id,
        "company_id": project.company_id,
        "$or": [
            {"sprint_id": None},
            {"sprint_id": {"$nin": active_sprint_ids}}
        ]
    }
    
    if epic_id:
        query["epic_id"] = epic_id
    
    if priority:
        try:
            query["priority"] = TaskPriority(priority.lower())
        except:
            pass
    
    # Get tasks sorted by priority and created date
    tasks = await Task.find(query).skip(skip).limit(limit).sort([
        ("priority", -1),  # Critical first
        ("created_at", 1)  # Oldest first
    ]).to_list()
    
    total = await Task.find(query).count()
    
    # Group by priority
    backlog_by_priority = {
        "critical": [],
        "high": [],
        "medium": [],
        "low": []
    }
    
    for task in tasks:
        priority_key = task.priority.value
        backlog_by_priority[priority_key].append({
            "id": str(task.id),
            "title": task.title,
            "description": task.description,
            "priority": task.priority.value,
            "status": task.status.value,
            "assigned_to": task.assigned_to,
            "epic_id": task.epic_id,
            "story_points": task.story_points,
            "created_at": task.created_at,
        })
    
    return {
        "backlog": [
            {
                "id": str(task.id),
                "title": task.title,
                "description": task.description,
                "priority": task.priority.value,
                "status": task.status.value,
                "assigned_to": task.assigned_to,
                "epic_id": task.epic_id,
                "sprint_id": task.sprint_id,
                "story_points": task.story_points,
                "created_at": task.created_at,
            }
            for task in tasks
        ],
        "backlog_by_priority": backlog_by_priority,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.post("/projects/{project_id}/backlog/{task_id}/move-to-sprint")
async def move_task_to_sprint(
    project_id: str,
    task_id: str,
    sprint_id: str,
    current_user: User = Depends(get_current_user),
):
    """Move a task from backlog to a sprint"""
    project = await Project.get(project_id)
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    task = await Task.get(task_id)
    
    if not task or task.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    sprint = await Sprint.get(sprint_id)
    
    if not sprint or sprint.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sprint not found"
        )
    
    if sprint.state != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only add tasks to active sprints"
        )
    
    task.sprint_id = sprint_id
    task.updated_at = utc_now()
    await task.save()
    
    return {"message": "Task moved to sprint successfully"}


@router.post("/projects/{project_id}/backlog/{task_id}/remove-from-sprint")
async def remove_task_from_sprint(
    project_id: str,
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Remove a task from sprint (move back to backlog)"""
    project = await Project.get(project_id)
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    task = await Task.get(task_id)
    
    if not task or task.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    task.sprint_id = None
    task.updated_at = utc_now()
    await task.save()
    
    return {"message": "Task removed from sprint successfully"}



