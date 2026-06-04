"""
Watchers Endpoints - Manage task watchers
"""
from fastapi import APIRouter, HTTPException, status, Depends
from typing import List

from app.models.watchers import Watcher
from app.models.task import Task
from app.models.user import User
from app.api.dependencies import get_current_user, check_company_access

router = APIRouter()


@router.post("/tasks/{task_id}/watchers")
async def add_watcher(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Add current user as watcher to a task"""
    task = await Task.get(task_id)
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    check_company_access(current_user, task.company_id)
    
    # Check if already watching
    existing = await Watcher.find_one(
        Watcher.task_id == task_id,
        Watcher.user_id == str(current_user.id)
    )
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Already watching this task"
        )
    
    watcher = Watcher(
        task_id=task_id,
        user_id=str(current_user.id),
        company_id=current_user.company_id,
    )
    
    await watcher.insert()
    
    return {"message": "Added as watcher successfully"}


@router.delete("/tasks/{task_id}/watchers")
async def remove_watcher(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Remove current user as watcher from a task"""
    watcher = await Watcher.find_one(
        Watcher.task_id == task_id,
        Watcher.user_id == str(current_user.id)
    )
    
    if not watcher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not watching this task"
        )
    
    await watcher.delete()
    
    return {"message": "Removed as watcher successfully"}


@router.get("/tasks/{task_id}/watchers")
async def get_watchers(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get all watchers for a task"""
    task = await Task.get(task_id)
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    check_company_access(current_user, task.company_id)
    
    watchers = await Watcher.find(Watcher.task_id == task_id).to_list()
    
    # Get user details
    from app.models.user import User as UserModel
    watcher_users = []
    for watcher in watchers:
        user = await UserModel.get(watcher.user_id)
        if user:
            watcher_users.append({
                "user_id": watcher.user_id,
                "user_name": user.full_name(),
                "email": user.email,
            })
    
    return {"watchers": watcher_users}


