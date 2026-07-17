"""
Sales Masters API - Stages, Reasons, Channels, Tags, Nationality, Business Category, Greetings
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Form, status as http_status

from app.api.dependencies import get_current_user, require_module
from app.models.user import User, UserRole
from app.models.sales_masters import (
    SalesStage, ReasonForLost, SalesChannel, SalesTag,
    Nationality, BusinessCategory, GreetingTemplate
)
from app.api.deps import Pagination50, PaginationParams

router = APIRouter(dependencies=[Depends(require_module("sales"))])

APPROVED_STAGE_METADATA = {
    "new": {"name": "New", "key": "new", "order": 0, "category": "intake", "description": "Fresh lead awaiting outreach.", "is_terminal": False},
    "contacted": {"name": "Contacted", "key": "contacted", "order": 1, "category": "qualification", "description": "Initial contact has been made.", "is_terminal": False},
    "qualified": {"name": "Qualified", "key": "qualified", "order": 2, "category": "qualification", "description": "Lead fits the target criteria.", "is_terminal": False},
    "discovery": {"name": "Discovery", "key": "discovery", "order": 3, "category": "evaluation", "description": "Needs analysis or discovery is underway.", "is_terminal": False},
    "proposal": {"name": "Proposal", "key": "proposal", "order": 4, "category": "proposal", "description": "Proposal or quote has been delivered.", "is_terminal": False},
    "negotiation": {"name": "Negotiation", "key": "negotiation", "order": 5, "category": "proposal", "description": "Commercial terms are under discussion.", "is_terminal": False},
    "won": {"name": "Won", "key": "won", "order": 6, "category": "closed", "description": "Opportunity closed successfully.", "is_terminal": True},
    "lost": {"name": "Lost", "key": "lost", "order": 7, "category": "closed", "description": "Opportunity closed without conversion.", "is_terminal": True},
}


def _ensure_admin_permission(user: User):
    if user.role not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )


# ==================== STAGES ====================

@router.get("/stages")
async def list_stages(
    search: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user)
):
    """List all stages with search and pagination"""
    skip, limit = pagination.skip, pagination.limit
    query = {"deleted": False}
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = current_user.company_id
    
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    
    total = await SalesStage.find(query).count()
    stages = await SalesStage.find(query).sort(SalesStage.order).skip(skip).limit(limit).to_list()
    return {
        "total": total,
        "items": [
            {
                "id": str(s.id),
                "name": s.name,
                "order": s.order,
                "is_default": s.is_default,
                "key": getattr(s, "key", None),
                "description": getattr(s, "description", None),
                "category": getattr(s, "category", None),
                "is_terminal": bool(getattr(s, "is_terminal", False)),
            }
            for s in stages
        ]
    }


@router.post("/stages")
async def create_stage(
    name: str = Form(...),
    order: int = Form(0),
    is_default= Form(False),
    current_user: User = Depends(get_current_user)
):
    """Create a new stage"""
    _ensure_admin_permission(current_user)
    
    existing = await SalesStage.find_one(
        {"name": name, "company_id": current_user.company_id, "deleted": False}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Stage already exists")

    normalized_name = name.strip().lower()
    metadata = APPROVED_STAGE_METADATA.get(normalized_name, {})
    
    stage = SalesStage(
        name=name.strip(),
        order=order if order else metadata.get("order", 0),
        key=metadata.get("key") or normalized_name.replace(" ", "-"),
        description=metadata.get("description"),
        category=metadata.get("category"),
        is_terminal=bool(metadata.get("is_terminal", False)),
        is_default=is_default,
        company_id=current_user.company_id,
    )
    await stage.insert()
    return {"id": str(stage.id), "message": "Stage created"}


@router.put("/stages/{stage_id}")
async def update_stage(
    stage_id: str,
    name: str = Form(...),
    order: int = Form(0),
    is_default: bool = Form(False),
    current_user: User = Depends(get_current_user)
):
    """Update a stage"""
    _ensure_admin_permission(current_user)
    
    stage = await SalesStage.get(stage_id)
    if not stage or stage.deleted or stage.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    # Check duplicate name
    existing = await SalesStage.find_one(
        {"name": name, "company_id": current_user.company_id, "deleted": False, "id": {"$ne": stage_id}}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Stage name already exists")

    normalized_name = name.strip().lower()
    metadata = APPROVED_STAGE_METADATA.get(normalized_name, {})
    stage.name = name.strip()
    stage.order = order if order else metadata.get("order", stage.order)
    stage.key = metadata.get("key") or normalized_name.replace(" ", "-")
    stage.description = metadata.get("description", stage.description)
    stage.category = metadata.get("category", stage.category)
    stage.is_terminal = bool(metadata.get("is_terminal", stage.is_terminal))
    stage.is_default = is_default
    await stage.save()
    return {"message": "Stage updated"}


@router.delete("/stages/{stage_id}")
async def delete_stage(
    stage_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a stage (soft delete)"""
    _ensure_admin_permission(current_user)
    
    stage = await SalesStage.get(stage_id)
    if not stage or stage.deleted or stage.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    stage.deleted = True
    await stage.save()
    return {"message": "Stage deleted"}


# ==================== REASONS FOR LOST ====================

@router.get("/reasons-for-lost")
async def list_reasons(
    search: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user)
):
    """List all reasons for lost with search and pagination"""
    skip, limit = pagination.skip, pagination.limit
    query = {"deleted": False}
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = current_user.company_id
    
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    
    total = await ReasonForLost.find(query).count()
    reasons = await ReasonForLost.find(query).skip(skip).limit(limit).to_list()
    return {
        "total": total,
        "items": [
            {
                "id": str(r.id),
                "name": r.name,
            }
            for r in reasons
        ]
    }


@router.post("/reasons-for-lost")
async def create_reason(
    name: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Create a new reason"""
    _ensure_admin_permission(current_user)
    
    existing = await ReasonForLost.find_one(
        {"name": name, "company_id": current_user.company_id, "deleted": False}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Reason already exists")
    
    reason = ReasonForLost(
        name=name.strip(),
        company_id=current_user.company_id,
    )
    await reason.insert()
    return {"id": str(reason.id), "message": "Reason created"}


@router.put("/reasons-for-lost/{reason_id}")
async def update_reason(
    reason_id: str,
    name: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Update a reason"""
    _ensure_admin_permission(current_user)
    
    reason = await ReasonForLost.get(reason_id)
    if not reason or reason.deleted or reason.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Reason not found")
    
    existing = await ReasonForLost.find_one(
        {"name": name, "company_id": current_user.company_id, "deleted": False, "id": {"$ne": reason_id}}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Reason name already exists")
    
    reason.name = name.strip()
    await reason.save()
    return {"message": "Reason updated"}


@router.delete("/reasons-for-lost/{reason_id}")
async def delete_reason(
    reason_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a reason (soft delete)"""
    _ensure_admin_permission(current_user)
    
    reason = await ReasonForLost.get(reason_id)
    if not reason or reason.deleted or reason.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Reason not found")
    
    reason.deleted = True
    await reason.save()
    return {"message": "Reason deleted"}


# ==================== CHANNELS ====================

@router.get("/channels")
async def list_channels(
    search: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user)
):
    """List all channels with search and pagination"""
    skip, limit = pagination.skip, pagination.limit
    query = {"deleted": False}
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = current_user.company_id
    
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    
    total = await SalesChannel.find(query).count()
    channels = await SalesChannel.find(query).skip(skip).limit(limit).to_list()
    return {
        "total": total,
        "items": [
            {
                "id": str(c.id),
                "name": c.name,
            }
            for c in channels
        ]
    }


@router.post("/channels")
async def create_channel(
    name: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Create a new channel"""
    _ensure_admin_permission(current_user)
    
    existing = await SalesChannel.find_one(
        {"name": name, "company_id": current_user.company_id, "deleted": False}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Channel already exists")
    
    channel = SalesChannel(
        name=name.strip(),
        company_id=current_user.company_id,
    )
    await channel.insert()
    return {"id": str(channel.id), "message": "Channel created"}


@router.put("/channels/{channel_id}")
async def update_channel(
    channel_id: str,
    name: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Update a channel"""
    _ensure_admin_permission(current_user)
    
    channel = await SalesChannel.get(channel_id)
    if not channel or channel.deleted or channel.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    existing = await SalesChannel.find_one(
        {"name": name, "company_id": current_user.company_id, "deleted": False, "id": {"$ne": channel_id}}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Channel name already exists")
    
    channel.name = name.strip()
    await channel.save()
    return {"message": "Channel updated"}


@router.delete("/channels/{channel_id}")
async def delete_channel(
    channel_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a channel (soft delete)"""
    _ensure_admin_permission(current_user)
    
    channel = await SalesChannel.get(channel_id)
    if not channel or channel.deleted or channel.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    channel.deleted = True
    await channel.save()
    return {"message": "Channel deleted"}


# ==================== TAGS ====================

@router.get("/tags")
async def list_tags(
    search: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user)
):
    """List all tags with search and pagination"""
    skip, limit = pagination.skip, pagination.limit
    query = {"deleted": False}
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = current_user.company_id
    
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    
    total = await SalesTag.find(query).count()
    tags = await SalesTag.find(query).skip(skip).limit(limit).to_list()
    return {
        "total": total,
        "items": [
            {
                "id": str(t.id),
                "name": t.name,
            }
            for t in tags
        ]
    }


@router.post("/tags")
async def create_tag(
    name: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Create a new tag"""
    _ensure_admin_permission(current_user)
    
    existing = await SalesTag.find_one(
        {"name": name, "company_id": current_user.company_id, "deleted": False}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Tag already exists")
    
    tag = SalesTag(
        name=name.strip(),
        company_id=current_user.company_id,
    )
    await tag.insert()
    return {"id": str(tag.id), "message": "Tag created"}


@router.put("/tags/{tag_id}")
async def update_tag(
    tag_id: str,
    name: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Update a tag"""
    _ensure_admin_permission(current_user)
    
    tag = await SalesTag.get(tag_id)
    if not tag or tag.deleted or tag.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    existing = await SalesTag.find_one(
        {"name": name, "company_id": current_user.company_id, "deleted": False, "id": {"$ne": tag_id}}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Tag name already exists")
    
    tag.name = name.strip()
    await tag.save()
    return {"message": "Tag updated"}


@router.delete("/tags/{tag_id}")
async def delete_tag(
    tag_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a tag (soft delete)"""
    _ensure_admin_permission(current_user)
    
    tag = await SalesTag.get(tag_id)
    if not tag or tag.deleted or tag.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    tag.deleted = True
    await tag.save()
    return {"message": "Tag deleted"}


# ==================== NATIONALITY ====================

@router.get("/nationalities")
async def list_nationalities(
    search: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user)
):
    """List all nationalities with search and pagination"""
    skip, limit = pagination.skip, pagination.limit
    query = {"deleted": False}
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = current_user.company_id
    
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    
    total = await Nationality.find(query).count()
    nationalities = await Nationality.find(query).skip(skip).limit(limit).to_list()
    return {
        "total": total,
        "items": [
            {
                "id": str(n.id),
                "name": n.name,
            }
            for n in nationalities
        ]
    }


@router.post("/nationalities")
async def create_nationality(
    name: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Create a new nationality"""
    _ensure_admin_permission(current_user)
    
    existing = await Nationality.find_one(
        {"name": name, "company_id": current_user.company_id, "deleted": False}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Nationality already exists")
    
    nationality = Nationality(
        name=name.strip(),
        company_id=current_user.company_id,
    )
    await nationality.insert()
    return {"id": str(nationality.id), "message": "Nationality created"}


@router.put("/nationalities/{nationality_id}")
async def update_nationality(
    nationality_id: str,
    name: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Update a nationality"""
    _ensure_admin_permission(current_user)
    
    nationality = await Nationality.get(nationality_id)
    if not nationality or nationality.deleted or nationality.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Nationality not found")
    
    existing = await Nationality.find_one(
        {"name": name, "company_id": current_user.company_id, "deleted": False, "id": {"$ne": nationality_id}}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Nationality name already exists")
    
    nationality.name = name.strip()
    await nationality.save()
    return {"message": "Nationality updated"}


@router.delete("/nationalities/{nationality_id}")
async def delete_nationality(
    nationality_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a nationality (soft delete)"""
    _ensure_admin_permission(current_user)
    
    nationality = await Nationality.get(nationality_id)
    if not nationality or nationality.deleted or nationality.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Nationality not found")
    
    nationality.deleted = True
    await nationality.save()
    return {"message": "Nationality deleted"}


# ==================== BUSINESS CATEGORY ====================

@router.get("/business-categories")
async def list_business_categories(
    search: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user)
):
    """List all business categories with search and pagination"""
    skip, limit = pagination.skip, pagination.limit
    query = {"deleted": False}
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = current_user.company_id
    
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    
    total = await BusinessCategory.find(query).count()
    categories = await BusinessCategory.find(query).skip(skip).limit(limit).to_list()
    return {
        "total": total,
        "items": [
            {
                "id": str(c.id),
                "name": c.name,
            }
            for c in categories
        ]
    }


@router.post("/business-categories")
async def create_business_category(
    name: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Create a new business category"""
    _ensure_admin_permission(current_user)
    
    existing = await BusinessCategory.find_one(
        {"name": name, "company_id": current_user.company_id, "deleted": False}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Business category already exists")
    
    category = BusinessCategory(
        name=name.strip(),
        company_id=current_user.company_id,
    )
    await category.insert()
    return {"id": str(category.id), "message": "Business category created"}


@router.put("/business-categories/{category_id}")
async def update_business_category(
    category_id: str,
    name: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Update a business category"""
    _ensure_admin_permission(current_user)
    
    category = await BusinessCategory.get(category_id)
    if not category or category.deleted or category.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Business category not found")
    
    existing = await BusinessCategory.find_one(
        {"name": name, "company_id": current_user.company_id, "deleted": False, "id": {"$ne": category_id}}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Business category name already exists")
    
    category.name = name.strip()
    await category.save()
    return {"message": "Business category updated"}


@router.delete("/business-categories/{category_id}")
async def delete_business_category(
    category_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a business category (soft delete)"""
    _ensure_admin_permission(current_user)
    
    category = await BusinessCategory.get(category_id)
    if not category or category.deleted or category.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Business category not found")
    
    category.deleted = True
    await category.save()
    return {"message": "Business category deleted"}


# ==================== GREETING TEMPLATES ====================

@router.get("/greetings")
async def list_greetings(
    greeting_type: Optional[str] = None,
    search: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user)
):
    """List greeting templates with search and pagination"""
    skip, limit = pagination.skip, pagination.limit
    query = {"deleted": False}
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = current_user.company_id
    if greeting_type:
        query["greeting_type"] = greeting_type
    if search:
        query["message"] = {"$regex": search, "$options": "i"}
    
    total = await GreetingTemplate.find(query).count()
    greetings = await GreetingTemplate.find(query).skip(skip).limit(limit).to_list()
    return {
        "total": total,
        "items": [
            {
                "id": str(g.id),
                "greeting_type": g.greeting_type,
                "message": g.message,
            }
            for g in greetings
        ]
    }


@router.post("/greetings")
async def create_greeting(
    greeting_type: str = Form(...),
    message: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Create a new greeting template"""
    _ensure_admin_permission(current_user)
    
    if greeting_type not in ["birthday", "anniversary"]:
        raise HTTPException(status_code=400, detail="greeting_type must be 'birthday' or 'anniversary'")
    
    # Validate message length (max 20 words)
    words = message.strip().split()
    if len(words) > 20:
        raise HTTPException(status_code=400, detail="Message must be maximum 20 words")
    
    greeting = GreetingTemplate(
        greeting_type=greeting_type,
        message=message.strip(),
        company_id=current_user.company_id,
    )
    await greeting.insert()
    return {"id": str(greeting.id), "message": "Greeting template created"}


@router.put("/greetings/{greeting_id}")
async def update_greeting(
    greeting_id: str,
    greeting_type: str = Form(...),
    message: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Update a greeting template"""
    _ensure_admin_permission(current_user)
    
    greeting = await GreetingTemplate.get(greeting_id)
    if not greeting or greeting.deleted or greeting.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Greeting template not found")
    
    if greeting_type not in ["birthday", "anniversary"]:
        raise HTTPException(status_code=400, detail="greeting_type must be 'birthday' or 'anniversary'")
    
    # Validate message length (max 20 words)
    words = message.strip().split()
    if len(words) > 20:
        raise HTTPException(status_code=400, detail="Message must be maximum 20 words")
    
    greeting.greeting_type = greeting_type
    greeting.message = message.strip()
    await greeting.save()
    return {"message": "Greeting template updated"}


@router.delete("/greetings/{greeting_id}")
async def delete_greeting(
    greeting_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a greeting template (soft delete)"""
    _ensure_admin_permission(current_user)
    
    greeting = await GreetingTemplate.get(greeting_id)
    if not greeting or greeting.deleted or greeting.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Greeting template not found")
    
    greeting.deleted = True
    await greeting.save()
    return {"message": "Greeting template deleted"}
