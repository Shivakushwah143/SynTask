"""
Workflow Management Endpoints - Customizable workflows like Jira
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form, Body
from typing import Optional, List, Dict, Any
from datetime import datetime

from app.models.workflow import Workflow, WorkflowStatus, WorkflowTransition
from app.models.user import User
from app.api.dependencies import get_current_user, get_current_company_admin, check_company_access

router = APIRouter()


# Workflow Status Endpoints
@router.post("/statuses")
async def create_workflow_status(
    name: str = Form(...),
    key: str = Form(...),
    description: Optional[str] = Form(None),
    color: str = Form("#0052CC"),
    category: str = Form("todo"),
    order: int = Form(0),
    project_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin),
):
    """Create a custom workflow status"""
    # Validate key uniqueness
    query = {"key": key.lower()}
    if project_id:
        query["project_id"] = project_id
        query["company_id"] = current_user.company_id
    else:
        query["company_id"] = current_user.company_id
    
    existing = await WorkflowStatus.find_one(query)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status key already exists"
        )
    
    status_obj = WorkflowStatus(
        name=name,
        key=key.lower(),
        description=description,
        company_id=current_user.company_id,
        project_id=project_id,
        color=color,
        category=category,
        order=order,
    )
    
    await status_obj.insert()
    
    return {
        "message": "Workflow status created successfully",
        "status_id": str(status_obj.id)
    }


@router.patch("/statuses/{status_id}")
async def update_workflow_status(
    status_id: str,
    name: Optional[str] = Form(None),
    key: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    order: Optional[int] = Form(None),
    current_user: User = Depends(get_current_company_admin),
):
    status_obj = await WorkflowStatus.get(status_id)
    if not status_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Status not found")
    check_company_access(current_user, status_obj.company_id)
    if name is not None:
        status_obj.name = name
    if key is not None:
        status_obj.key = key.lower()
    if description is not None:
        status_obj.description = description
    if color is not None:
        status_obj.color = color
    if category is not None:
        status_obj.category = category
    if order is not None:
        status_obj.order = order
    status_obj.updated_at = datetime.now()
    await status_obj.save()
    return {"message": "Workflow status updated successfully"}


@router.delete("/statuses/{status_id}")
async def delete_workflow_status(
    status_id: str,
    current_user: User = Depends(get_current_company_admin),
):
    status_obj = await WorkflowStatus.get(status_id)
    if not status_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Status not found")
    check_company_access(current_user, status_obj.company_id)
    await status_obj.delete()
    return {"message": "Workflow status deleted successfully"}


@router.get("/statuses")
async def list_workflow_statuses(
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """List workflow statuses"""
    query = {}
    
    if project_id:
        query["project_id"] = project_id
        query["company_id"] = current_user.company_id
    else:
        # Get company-specific and global statuses
        query["$or"] = [
            {"company_id": current_user.company_id},
            {"company_id": None}
        ]
    
    statuses = await WorkflowStatus.find(query).sort("order").to_list()
    
    return {
        "statuses": [
            {
                "id": str(s.id),
                "name": s.name,
                "key": s.key,
                "description": s.description,
                "color": s.color,
                "category": s.category,
                "order": s.order,
            }
            for s in statuses
        ]
    }


# Workflow Transition Endpoints
@router.post("/transitions")
async def create_workflow_transition(
    name: str = Form(...),
    from_status: str = Form(...),
    to_status: str = Form(...),
    project_id: Optional[str] = Form(None),
    conditions: Optional[List[Dict[str, Any]]] = Body(None),
    post_functions: Optional[List[Dict[str, Any]]] = Body(None),
    current_user: User = Depends(get_current_company_admin),
):
    """Create a workflow transition"""
    transition = WorkflowTransition(
        name=name,
        from_status=from_status.lower(),
        to_status=to_status.lower(),
        company_id=current_user.company_id,
        project_id=project_id,
        conditions=conditions or [],
        post_functions=post_functions or [],
    )
    
    await transition.insert()
    
    return {
        "message": "Workflow transition created successfully",
        "transition_id": str(transition.id)
    }


@router.patch("/transitions/{transition_id}")
async def update_workflow_transition(
    transition_id: str,
    name: Optional[str] = Form(None),
    from_status: Optional[str] = Form(None),
    to_status: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin),
):
    transition = await WorkflowTransition.get(transition_id)
    if not transition:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transition not found")
    check_company_access(current_user, transition.company_id)
    if name is not None:
        transition.name = name
    if from_status is not None:
        transition.from_status = from_status.lower()
    if to_status is not None:
        transition.to_status = to_status.lower()
    transition.updated_at = datetime.now()
    await transition.save()
    return {"message": "Workflow transition updated successfully"}


@router.delete("/transitions/{transition_id}")
async def delete_workflow_transition(
    transition_id: str,
    current_user: User = Depends(get_current_company_admin),
):
    transition = await WorkflowTransition.get(transition_id)
    if not transition:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transition not found")
    check_company_access(current_user, transition.company_id)
    await transition.delete()
    return {"message": "Workflow transition deleted successfully"}


@router.get("/transitions")
async def list_workflow_transitions(
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """List workflow transitions"""
    query = {}
    
    if project_id:
        query["project_id"] = project_id
        query["company_id"] = current_user.company_id
    else:
        query["company_id"] = current_user.company_id
    
    transitions = await WorkflowTransition.find(query).to_list()
    
    return {
        "transitions": [
            {
                "id": str(t.id),
                "name": t.name,
                "from_status": t.from_status,
                "to_status": t.to_status,
                "conditions": t.conditions,
                "post_functions": t.post_functions,
            }
            for t in transitions
        ]
    }


# Workflow Endpoints
@router.post("/")
async def create_workflow(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    initial_status: str = Form(...),
    status_ids: Optional[List[str]] = Body(None),
    transition_ids: Optional[List[str]] = Body(None),
    is_default: bool = Form(False),
    current_user: User = Depends(get_current_company_admin),
):
    """Create a workflow"""
    workflow = Workflow(
        name=name,
        description=description,
        company_id=current_user.company_id,
        project_id=project_id,
        initial_status=initial_status.lower(),
        status_ids=status_ids or [],
        transition_ids=transition_ids or [],
        is_default=is_default,
        created_by=str(current_user.id),
    )
    
    await workflow.insert()
    
    return {
        "message": "Workflow created successfully",
        "workflow_id": str(workflow.id)
    }


@router.patch("/{workflow_id}")
async def update_workflow(
    workflow_id: str,
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    initial_status: Optional[str] = Form(None),
    is_default: Optional[bool] = Form(None),
    current_user: User = Depends(get_current_company_admin),
):
    workflow = await Workflow.get(workflow_id)
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    check_company_access(current_user, workflow.company_id)
    if name is not None:
        workflow.name = name
    if description is not None:
        workflow.description = description
    if project_id is not None:
        workflow.project_id = project_id
    if initial_status is not None:
        workflow.initial_status = initial_status.lower()
    if is_default is not None:
        workflow.is_default = is_default
    workflow.updated_at = datetime.now()
    await workflow.save()
    return {"message": "Workflow updated successfully"}


@router.delete("/{workflow_id}")
async def delete_workflow(
    workflow_id: str,
    current_user: User = Depends(get_current_company_admin),
):
    workflow = await Workflow.get(workflow_id)
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    check_company_access(current_user, workflow.company_id)
    await workflow.delete()
    return {"message": "Workflow deleted successfully"}


@router.get("/")
async def list_workflows(
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """List workflows"""
    query = {}
    
    if project_id:
        query["project_id"] = project_id
        query["company_id"] = current_user.company_id
    else:
        query["company_id"] = current_user.company_id
    
    workflows = await Workflow.find(query).sort("-created_at").to_list()
    
    return {
        "workflows": [
            {
                "id": str(w.id),
                "name": w.name,
                "description": w.description,
                "initial_status": w.initial_status,
                "is_active": w.is_active,
                "is_default": w.is_default,
                "status_ids": w.status_ids,
                "transition_ids": w.transition_ids,
            }
            for w in workflows
        ]
    }


@router.get("/{workflow_id}")
async def get_workflow(
    workflow_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get workflow details"""
    workflow = await Workflow.get(workflow_id)
    
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found"
        )
    
    check_company_access(current_user, workflow.company_id)
    
    # Get statuses
    statuses = []
    if workflow.status_ids:
        status_objs = await WorkflowStatus.find(
            {"_id": {"$in": workflow.status_ids}}
        ).to_list()
        statuses = [
            {
                "id": str(s.id),
                "name": s.name,
                "key": s.key,
                "color": s.color,
                "category": s.category,
            }
            for s in status_objs
        ]
    
    # Get transitions
    transitions = []
    if workflow.transition_ids:
        transition_objs = await WorkflowTransition.find(
            {"_id": {"$in": workflow.transition_ids}}
        ).to_list()
        transitions = [
            {
                "id": str(t.id),
                "name": t.name,
                "from_status": t.from_status,
                "to_status": t.to_status,
            }
            for t in transition_objs
        ]
    
    return {
        "id": str(workflow.id),
        "name": workflow.name,
        "description": workflow.description,
        "initial_status": workflow.initial_status,
        "is_active": workflow.is_active,
        "is_default": workflow.is_default,
        "statuses": statuses,
        "transitions": transitions,
    }


@router.patch("/{workflow_id}/activate")
async def activate_workflow(
    workflow_id: str,
    current_user: User = Depends(get_current_company_admin),
):
    """Activate/deactivate a workflow"""
    workflow = await Workflow.get(workflow_id)
    
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found"
        )
    
    check_company_access(current_user, workflow.company_id)
    
    workflow.is_active = not workflow.is_active
    workflow.updated_at = datetime.now()
    await workflow.save()
    
    return {
        "message": f"Workflow {'activated' if workflow.is_active else 'deactivated'} successfully",
        "is_active": workflow.is_active
    }


