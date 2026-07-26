"""
Webhook Endpoints - For external integrations
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form, Body
from typing import Optional, List, Dict, Any
from datetime import datetime

from app.models.webhook import Webhook, WebhookDelivery, WebhookEvent
from app.models.user import User
from app.api.dependencies import get_current_user, get_current_company_admin, check_company_access
from app.api.deps import Pagination50, PaginationParams
from app.core.clock import utc_now

router = APIRouter()


@router.post("/")
async def create_webhook(
    name: str = Form(...),
    url: str = Form(...),
    project_id: Optional[str] = Form(None),
    events: Optional[List[str]] = Body(None),
    secret: Optional[str] = Form(None),
    headers: Optional[Dict[str, str]] = Body(None),
    verify_ssl: bool = Form(True),
    current_user: User = Depends(get_current_company_admin),
):
    """Create a webhook"""
    # Validate URL
    if not url.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="URL must start with http:// or https://"
        )
    
    # Validate events
    valid_events = []
    if events:
        for event in events:
            try:
                valid_events.append(WebhookEvent(event))
            except:
                pass
    
    if not valid_events:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one valid event must be specified"
        )
    
    webhook = Webhook(
        name=name,
        url=url,
        company_id=current_user.company_id,
        project_id=project_id,
        events=valid_events,
        secret=secret,
        headers=headers or {},
        verify_ssl=verify_ssl,
        created_by=str(current_user.id),
    )
    
    await webhook.insert()
    
    return {
        "message": "Webhook created successfully",
        "webhook_id": str(webhook.id)
    }


@router.get("/")
async def list_webhooks(
    project_id: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
):
    """List webhooks"""
    query = {"company_id": current_user.company_id}
    
    if project_id:
        query["project_id"] = project_id
    if is_active is not None:
        query["is_active"] = is_active
    
    webhooks = await Webhook.find(query).sort("-created_at").to_list()
    
    return {
        "webhooks": [
            {
                "id": str(w.id),
                "name": w.name,
                "url": w.url,
                "events": [e.value for e in w.events],
                "is_active": w.is_active,
                "success_count": w.success_count,
                "failure_count": w.failure_count,
                "last_triggered_at": w.last_triggered_at,
            }
            for w in webhooks
        ]
    }


@router.get("/{webhook_id}")
async def get_webhook(
    webhook_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get webhook details"""
    webhook = await Webhook.get(webhook_id)
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found"
        )
    
    check_company_access(current_user, webhook.company_id)
    
    return {
        "id": str(webhook.id),
        "name": webhook.name,
        "url": webhook.url,
        "events": [e.value for e in webhook.events],
        "is_active": webhook.is_active,
        "verify_ssl": webhook.verify_ssl,
        "success_count": webhook.success_count,
        "failure_count": webhook.failure_count,
        "last_triggered_at": webhook.last_triggered_at,
    }


@router.patch("/{webhook_id}/activate")
async def toggle_webhook(
    webhook_id: str,
    current_user: User = Depends(get_current_company_admin),
):
    """Activate/deactivate webhook"""
    webhook = await Webhook.get(webhook_id)
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found"
        )
    
    check_company_access(current_user, webhook.company_id)
    
    webhook.is_active = not webhook.is_active
    webhook.updated_at = utc_now()
    await webhook.save()
    
    return {
        "message": f"Webhook {'activated' if webhook.is_active else 'deactivated'} successfully",
        "is_active": webhook.is_active
    }


@router.delete("/{webhook_id}")
async def delete_webhook(
    webhook_id: str,
    current_user: User = Depends(get_current_company_admin),
):
    """Delete webhook"""
    webhook = await Webhook.get(webhook_id)
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found"
        )
    
    check_company_access(current_user, webhook.company_id)
    
    await webhook.delete()
    
    return {"message": "Webhook deleted successfully"}


@router.get("/{webhook_id}/deliveries")
async def get_webhook_deliveries(
    webhook_id: str,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user),
):
    """Get webhook delivery history"""
    skip, limit = pagination.skip, pagination.limit
    webhook = await Webhook.get(webhook_id)
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found"
        )
    
    check_company_access(current_user, webhook.company_id)
    
    deliveries = await WebhookDelivery.find(
        WebhookDelivery.webhook_id == webhook_id
    ).skip(skip).limit(limit).sort("-delivered_at").to_list()
    
    total = await WebhookDelivery.find(
        WebhookDelivery.webhook_id == webhook_id
    ).count()
    
    return {
        "deliveries": [
            {
                "id": str(d.id),
                "event": d.event,
                "status_code": d.status_code,
                "success": d.success,
                "error_message": d.error_message,
                "delivered_at": d.delivered_at,
                "response_time_ms": d.response_time_ms,
            }
            for d in deliveries
        ],
        "total": total,
        "skip": skip,
        "limit": limit
    }



