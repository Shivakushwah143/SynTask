"""
Changelog Endpoints - View task change history
"""
from fastapi import APIRouter, HTTPException, status, Depends
from typing import Optional

from app.models.changelog import ChangeLog
from app.models.task import Task
from app.models.user import User
from app.api.dependencies import get_current_user
from app.api.deps import Pagination50, PaginationParams
from app.services.task_health_service import assert_task_view_access

router = APIRouter()


@router.get("/tasks/{task_id}/changelog")
async def get_task_changelog(
    task_id: str,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user),
):
    """Get changelog for a task"""
    skip, limit = pagination.skip, pagination.limit
    task = await Task.get(task_id)
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    await assert_task_view_access(current_user, task)
    
    changelogs = await ChangeLog.find(
        ChangeLog.task_id == task_id
    ).skip(skip).limit(limit).sort("-created_at").to_list()
    
    total = await ChangeLog.find(ChangeLog.task_id == task_id).count()
    
    return {
        "changelog": [
            {
                "id": str(cl.id),
                "user_name": cl.user_name,
                "field": cl.field,
                "field_type": cl.field_type,
                "old_value": cl.old_string or cl.old_value,
                "new_value": cl.new_string or cl.new_value,
                "created_at": cl.created_at,
            }
            for cl in changelogs
        ],
        "total": total,
        "skip": skip,
        "limit": limit
    }


