"""
Issue Types Endpoints - Manage issue types like Jira
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form
from typing import Optional
from datetime import datetime

from app.models.issue_types import IssueType, IssueTypeCategory
from app.models.user import User
from app.api.dependencies import get_current_user, get_current_company_admin, check_company_access

router = APIRouter()


@router.post("/")
async def create_issue_type(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    icon: Optional[str] = Form(None),
    color: str = Form("#0052CC"),
    category: str = Form("standard"),
    project_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin),
):
    """Create an issue type"""
    try:
        issue_category = IssueTypeCategory(category.lower())
    except:
        issue_category = IssueTypeCategory.STANDARD
    
    issue_type = IssueType(
        name=name,
        description=description,
        icon=icon,
        color=color,
        category=issue_category,
        company_id=current_user.company_id,
        project_id=project_id,
        created_by=str(current_user.id),
    )
    
    await issue_type.insert()
    
    return {
        "message": "Issue type created successfully",
        "issue_type_id": str(issue_type.id)
    }


@router.get("/")
async def list_issue_types(
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """List issue types"""
    query = {}
    
    if project_id:
        query["project_id"] = project_id
        query["company_id"] = current_user.company_id
    else:
        # Get company-specific and global
        query["$or"] = [
            {"company_id": current_user.company_id},
            {"company_id": None}
        ]
    
    query["is_active"] = True
    
    issue_types = await IssueType.find(query).sort("order").to_list()
    
    return {
        "issue_types": [
            {
                "id": str(it.id),
                "name": it.name,
                "description": it.description,
                "icon": it.icon,
                "color": it.color,
                "category": it.category.value,
            }
            for it in issue_types
        ]
    }


