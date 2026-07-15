"""
Activity Logs Endpoints
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timedelta

from app.models.user import User
from app.models.task import Task, TaskComment
from app.models.ticket import Ticket, TicketComment
from app.api.dependencies import get_current_user, check_company_access
from app.api.deps import Pagination50, PaginationParams

router = APIRouter()


@router.get("/timeline")
async def get_activity_timeline(
    entity_type: Optional[str] = None,  # task, ticket, all
    entity_id: Optional[str] = None,
    days: int = 30,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user)
):
    """Get activity timeline for user's company"""
    skip, limit = pagination.skip, pagination.limit
    start_date = datetime.utcnow() - timedelta(days=days)
    activities = []
    
    # Get task activities
    if entity_type in [None, "task", "all"]:
        task_query = {
            "company_id": current_user.company_id,
            "created_at": {"$gte": start_date}
        }
        
        if entity_id:
            task_query["_id"] = entity_id
        
        tasks = await Task.find(task_query).sort("-created_at").skip(skip).limit(limit).to_list()
        for task in tasks:
            activities.append({
                "id": str(task.id),
                "type": "task_created",
                "entity_type": "task",
                
                "entity_id": str(task.id),
                "title": f"Task '{task.title}' created",
                "user_id": task.created_by,
                "user_name": "System",
                "timestamp": task.created_at,
                "metadata": {
                    "status": task.status.value,
                    "priority": task.priority.value,
                }
            })
            
        # Task comments
        comment_query = {
            "company_id": current_user.company_id,
            "created_at": {"$gte": start_date}
        }
        if entity_id:
            comment_query["task_id"] = entity_id
        
        task_comments = await TaskComment.find(comment_query).sort("-created_at").to_list()
        for comment in task_comments:
            activities.append({
                "id": str(comment.id),
                "type": "task_comment",
                "entity_type": "task",
                "entity_id": comment.task_id,
                "title": f"Comment on task",
                "user_id": comment.user_id,
                "user_name": comment.user_name,
                "timestamp": comment.created_at,
            })
    
    # Get ticket activities
    if entity_type in [None, "ticket", "all"]:
        ticket_query = {
            "company_id": current_user.company_id,
            "created_at": {"$gte": start_date}
        }
        if entity_id:
            ticket_query["_id"] = entity_id
        
        tickets = await Ticket.find(ticket_query).sort("-created_at").skip(skip).limit(limit).to_list()
        for ticket in tickets:
            activities.append({
                "id": str(ticket.id),
                "type": "ticket_created",
                "entity_type": "ticket",
                "entity_id": str(ticket.id),
                "title": f"Ticket '{ticket.ticket_number}' created",
                "user_id": ticket.created_by,
                "user_name": ticket.created_by_name,
                "timestamp": ticket.created_at,
                "metadata": {
                    "status": ticket.status.value,
                    "priority": ticket.priority.value,
                }
            })
        
        # Ticket comments
        ticket_comment_query = {
            "company_id": current_user.company_id,
            "created_at": {"$gte": start_date}
        }
        if entity_id:
            ticket_comment_query["ticket_id"] = entity_id
        
        ticket_comments = await TicketComment.find(ticket_comment_query).sort("-created_at").to_list()
        for comment in ticket_comments:
            activities.append({
                "id": str(comment.id),
                "type": "ticket_comment",
                "entity_type": "ticket",
                "entity_id": comment.ticket_id,
                "title": f"Comment on ticket",
                "user_id": comment.user_id,
                "user_name": comment.user_name,
                "timestamp": comment.created_at,
            })
    
    # Sort by timestamp
    activities.sort(key=lambda x: x["timestamp"], reverse=True)
    
    return {
        "activities": activities[:limit],
        "total": len(activities),
        "skip": skip,
        "limit": limit
    }


