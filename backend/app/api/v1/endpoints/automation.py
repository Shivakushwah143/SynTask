"""
Automation Endpoints - Automation rules like Jira Automation
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form, Body
from typing import Optional, List, Dict, Any
from datetime import datetime

from app.models.automation import AutomationRule, AutomationExecution, AutomationTriggerType, AutomationActionType
from app.models.user import User
from app.models.task import Task, TaskStatus
from app.models.notification import Notification, NotificationType
from app.api.dependencies import get_current_user, get_current_company_admin, check_company_access
from app.api.deps import Pagination50, PaginationParams

router = APIRouter()


@router.post("/")
async def create_automation_rule(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    trigger_type: str = Form(...),
    trigger_config: Optional[Dict[str, Any]] = Body(None),
    conditions: Optional[List[Dict[str, Any]]] = Body(None),
    actions: Optional[List[Dict[str, Any]]] = Body(None),
    current_user: User = Depends(get_current_company_admin),
):
    """Create an automation rule"""
    # Validate trigger type
    try:
        trigger = AutomationTriggerType(trigger_type.lower())
    except:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid trigger type"
        )
    
    rule = AutomationRule(
        name=name,
        description=description,
        company_id=current_user.company_id,
        project_id=project_id,
        trigger_type=trigger,
        trigger_config=trigger_config or {},
        conditions=conditions or [],
        actions=actions or [],
        created_by=str(current_user.id),
    )
    
    await rule.insert()
    
    return {
        "message": "Automation rule created successfully",
        "rule_id": str(rule.id)
    }


@router.get("/")
async def list_automation_rules(
    project_id: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
):
    """List automation rules"""
    query = {"company_id": current_user.company_id}
    
    if project_id:
        query["project_id"] = project_id
    if is_active is not None:
        query["is_active"] = is_active
    
    rules = await AutomationRule.find(query).sort("-created_at").to_list()
    
    return {
        "rules": [
            {
                "id": str(r.id),
                "name": r.name,
                "description": r.description,
                "trigger_type": r.trigger_type.value,
                "is_active": r.is_active,
                "run_count": r.run_count,
                "last_run_at": r.last_run_at,
            }
            for r in rules
        ]
    }


@router.get("/{rule_id}")
async def get_automation_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get automation rule details"""
    rule = await AutomationRule.get(rule_id)
    
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Automation rule not found"
        )
    
    check_company_access(current_user, rule.company_id)
    
    return {
        "id": str(rule.id),
        "name": rule.name,
        "description": rule.description,
        "trigger_type": rule.trigger_type.value,
        "trigger_config": rule.trigger_config,
        "conditions": rule.conditions,
        "actions": rule.actions,
        "is_active": rule.is_active,
        "run_count": rule.run_count,
        "last_run_at": rule.last_run_at,
    }


@router.put("/{rule_id}")
async def update_automation_rule(
    rule_id: str,
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    trigger_config: Optional[Dict[str, Any]] = Body(None),
    conditions: Optional[List[Dict[str, Any]]] = Body(None),
    actions: Optional[List[Dict[str, Any]]] = Body(None),
    current_user: User = Depends(get_current_company_admin),
):
    """Update automation rule"""
    rule = await AutomationRule.get(rule_id)
    
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Automation rule not found"
        )
    
    check_company_access(current_user, rule.company_id)
    
    if name:
        rule.name = name
    if description is not None:
        rule.description = description
    if trigger_config is not None:
        rule.trigger_config = trigger_config
    if conditions is not None:
        rule.conditions = conditions
    if actions is not None:
        rule.actions = actions
    
    rule.updated_at = datetime.utcnow()
    await rule.save()
    
    return {"message": "Automation rule updated successfully"}


@router.patch("/{rule_id}/activate")
async def toggle_automation_rule(
    rule_id: str,
    current_user: User = Depends(get_current_company_admin),
):
    """Activate/deactivate automation rule"""
    rule = await AutomationRule.get(rule_id)
    
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Automation rule not found"
        )
    
    check_company_access(current_user, rule.company_id)
    
    rule.is_active = not rule.is_active
    rule.updated_at = datetime.utcnow()
    await rule.save()
    
    return {
        "message": f"Automation rule {'activated' if rule.is_active else 'deactivated'} successfully",
        "is_active": rule.is_active
    }


@router.delete("/{rule_id}")
async def delete_automation_rule(
    rule_id: str,
    current_user: User = Depends(get_current_company_admin),
):
    """Delete automation rule"""
    rule = await AutomationRule.get(rule_id)
    
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Automation rule not found"
        )
    
    check_company_access(current_user, rule.company_id)
    
    await rule.delete()
    
    return {"message": "Automation rule deleted successfully"}


@router.get("/{rule_id}/executions")
async def get_automation_executions(
    rule_id: str,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user),
):
    """Get automation rule execution history"""
    skip, limit = pagination.skip, pagination.limit
    rule = await AutomationRule.get(rule_id)
    
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Automation rule not found"
        )
    
    check_company_access(current_user, rule.company_id)
    
    executions = await AutomationExecution.find(
        AutomationExecution.rule_id == rule_id
    ).skip(skip).limit(limit).sort("-executed_at").to_list()
    
    total = await AutomationExecution.find(
        AutomationExecution.rule_id == rule_id
    ).count()
    
    return {
        "executions": [
            {
                "id": str(e.id),
                "trigger_type": e.trigger_type,
                "status": e.status,
                "entity_type": e.entity_type,
                "entity_id": e.entity_id,
                "actions_executed": e.actions_executed,
                "actions_failed": e.actions_failed,
                "error_message": e.error_message,
                "executed_at": e.executed_at,
            }
            for e in executions
        ],
        "total": total,
        "skip": skip,
        "limit": limit
    }


