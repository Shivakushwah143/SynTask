"""
Issue Linking Endpoints - Link tasks together
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form
from typing import Optional

from app.models.issue_linking import IssueLink, LinkType
from app.models.task import Task
from app.models.user import User
from app.api.dependencies import get_current_user, check_company_access

router = APIRouter()


@router.post("/tasks/{task_id}/links")
async def create_issue_link(
    task_id: str,
    destination_task_id: str = Form(...),
    link_type: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    """Create a link between two tasks"""
    source_task = await Task.get(task_id)
    dest_task = await Task.get(destination_task_id)
    
    if not source_task or not dest_task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    check_company_access(current_user, source_task.company_id)
    check_company_access(current_user, dest_task.company_id)
    
    if source_task.company_id != dest_task.company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tasks must be in the same company"
        )
    
    try:
        link_type_enum = LinkType(link_type.lower())
    except:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid link type"
        )
    
    # Check if link already exists
    existing = await IssueLink.find_one(
        IssueLink.source_task_id == task_id,
        IssueLink.destination_task_id == destination_task_id,
        IssueLink.link_type == link_type_enum
    )
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Link already exists"
        )
    
    issue_link = IssueLink(
        source_task_id=task_id,
        destination_task_id=destination_task_id,
        company_id=current_user.company_id,
        link_type=link_type_enum,
        created_by=str(current_user.id),
    )
    
    await issue_link.insert()
    
    return {
        "message": "Issue link created successfully",
        "link_id": str(issue_link.id)
    }


@router.get("/tasks/{task_id}/links")
async def get_issue_links(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get all links for a task"""
    task = await Task.get(task_id)
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    check_company_access(current_user, task.company_id)
    
    # Get outward links (this task links to others)
    outward_links = await IssueLink.find(
        IssueLink.source_task_id == task_id
    ).to_list()
    
    # Get inward links (others link to this task)
    inward_links = await IssueLink.find(
        IssueLink.destination_task_id == task_id
    ).to_list()
    
    # Get linked task details
    linked_tasks = []
    for link in outward_links + inward_links:
        linked_task_id = link.destination_task_id if link.source_task_id == task_id else link.source_task_id
        linked_task = await Task.get(linked_task_id)
        if linked_task:
            linked_tasks.append({
                "link_id": str(link.id),
                "task_id": linked_task_id,
                "task_title": linked_task.title,
                "link_type": link.link_type.value,
                "direction": "outward" if link.source_task_id == task_id else "inward",
            })
    
    return {
        "links": linked_tasks
    }


@router.delete("/links/{link_id}")
async def delete_issue_link(
    link_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete an issue link"""
    issue_link = await IssueLink.get(link_id)
    
    if not issue_link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Link not found"
        )
    
    check_company_access(current_user, issue_link.company_id)
    
    await issue_link.delete()
    
    return {"message": "Issue link deleted successfully"}


