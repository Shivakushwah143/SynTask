from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.api.deps import Pagination20, PaginationParams
from app.models.user import User, UserRole
from app.models.work_request import WorkRequest, WorkRequestStatus, WorkRequestType
from app.services.work_request_service import WorkRequestService, assert_request_view

router = APIRouter()


class WorkRequestCreate(BaseModel):
    type: WorkRequestType
    title: str = Field(min_length=1)
    description: str = Field(min_length=1)
    priority: str = "medium"
    assigned_reviewer_id: Optional[str] = None
    project_id: Optional[str] = None
    task_id: Optional[str] = None
    client_id: Optional[str] = None
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[str] = None
    reason: Optional[str] = None
    requested_changes: Dict[str, Any] = Field(default_factory=dict)


class WorkRequestDecision(BaseModel):
    reason: Optional[str] = None


class WorkRequestConversion(BaseModel):
    target: str = "task"
    task: Dict[str, Any] = Field(default_factory=dict)
    project: Dict[str, Any] = Field(default_factory=dict)


def _value(value):
    return getattr(value, "value", value)


async def _serialize_request(item: WorkRequest) -> dict:
    return {
        "id": str(item.id),
        "request_id": item.request_id,
        "company_id": item.company_id,
        "type": _value(item.type),
        "title": item.title,
        "description": item.description,
        "status": _value(item.status),
        "priority": item.priority,
        "requested_by": item.requested_by,
        "assigned_reviewer_id": item.assigned_reviewer_id,
        "resolver_id": item.resolver_id,
        "project_id": item.project_id,
        "task_id": item.task_id,
        "client_id": item.client_id,
        "related_entity_type": item.related_entity_type,
        "related_entity_id": item.related_entity_id,
        "reason": item.reason,
        "requested_changes": item.requested_changes,
        "action_result": item.action_result,
        "submitted_at": item.submitted_at,
        "review_started_at": item.review_started_at,
        "decided_at": item.decided_at,
        "decided_by": item.decided_by,
        "decision_reason": item.decision_reason,
        "converted_task_id": item.converted_task_id,
        "converted_project_id": item.converted_project_id,
        "cancelled_at": item.cancelled_at,
        "cancelled_by": item.cancelled_by,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "allowed_actions": _allowed_action_names(item),
    }


def _allowed_action_names(item: WorkRequest) -> list[str]:
    status_value = _value(item.status)
    if status_value == WorkRequestStatus.SUBMITTED.value:
        return ["start_review", "cancel"]
    if status_value == WorkRequestStatus.UNDER_REVIEW.value:
        return ["approve", "reject", "cancel"]
    if status_value == WorkRequestStatus.APPROVED.value:
        return ["convert_to_task", "convert_to_project"]
    return []


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_work_request(payload: WorkRequestCreate, current_user: User = Depends(get_current_user)):
    request = await WorkRequestService.create_request(current_user, **payload.model_dump())
    return await _serialize_request(request)


@router.get("/")
async def list_work_requests(
    mine: bool = Query(False),
    needs_my_review: bool = Query(False),
    type: Optional[WorkRequestType] = Query(None),
    status_filter: Optional[WorkRequestStatus] = Query(None, alias="status"),
    project_id: Optional[str] = None,
    client_id: Optional[str] = None,
    requester_id: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = None,
    pagination: PaginationParams = Pagination20,
    current_user: User = Depends(get_current_user),
):
    if not current_user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    query: Dict[str, Any] = {"company_id": current_user.company_id}
    if current_user.role == UserRole.EMPLOYEE:
        query["$or"] = [{"requested_by": str(current_user.id)}, {"assigned_reviewer_id": str(current_user.id)}]
    if mine:
        query["requested_by"] = str(current_user.id)
    if needs_my_review:
        query["assigned_reviewer_id"] = str(current_user.id)
        query["status"] = {"$in": [WorkRequestStatus.SUBMITTED.value, WorkRequestStatus.UNDER_REVIEW.value]}
    if type:
        query["type"] = type.value
    if status_filter:
        query["status"] = status_filter.value
    if project_id:
        query["project_id"] = project_id
    if client_id:
        query["client_id"] = client_id
    if requester_id and current_user.role != UserRole.EMPLOYEE:
        query["requested_by"] = requester_id
    if priority:
        query["priority"] = priority
    if search:
        query["$and"] = query.get("$and", []) + [{
            "$or": [
                {"request_id": {"$regex": search, "$options": "i"}},
                {"title": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}},
                {"project_id": {"$regex": search, "$options": "i"}},
                {"client_id": {"$regex": search, "$options": "i"}},
            ]
        }]
    skip, limit = pagination.skip, pagination.limit
    items = await WorkRequest.find(query).skip(skip).limit(limit).sort("-updated_at").to_list()
    total = await WorkRequest.find(query).count()
    return {"requests": [await _serialize_request(item) for item in items], "total": total, "skip": skip, "limit": limit}


@router.get("/{request_id}")
async def get_work_request(request_id: str, current_user: User = Depends(get_current_user)):
    item = await _load_request(request_id, current_user)
    return await _serialize_request(item)


async def _load_request(request_id: str, current_user: User) -> WorkRequest:
    item = await WorkRequest.get(request_id)
    if not item:
        item = await WorkRequest.find_one({"request_id": request_id, "company_id": current_user.company_id})
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work request not found")
    await assert_request_view(current_user, item)
    return item


@router.post("/{request_id}/start-review")
async def start_work_request_review(request_id: str, current_user: User = Depends(get_current_user)):
    item = await _load_request(request_id, current_user)
    item = await WorkRequestService.transition(item, current_user, "start_review")
    return await _serialize_request(item)


@router.post("/{request_id}/approve")
async def approve_work_request(request_id: str, payload: WorkRequestDecision, current_user: User = Depends(get_current_user)):
    item = await _load_request(request_id, current_user)
    item = await WorkRequestService.transition(item, current_user, "approve", payload.reason)
    return await _serialize_request(item)


@router.post("/{request_id}/reject")
async def reject_work_request(request_id: str, payload: WorkRequestDecision, current_user: User = Depends(get_current_user)):
    item = await _load_request(request_id, current_user)
    item = await WorkRequestService.transition(item, current_user, "reject", payload.reason)
    return await _serialize_request(item)


@router.post("/{request_id}/cancel")
async def cancel_work_request(request_id: str, payload: WorkRequestDecision, current_user: User = Depends(get_current_user)):
    item = await _load_request(request_id, current_user)
    item = await WorkRequestService.transition(item, current_user, "cancel", payload.reason)
    return await _serialize_request(item)


@router.post("/{request_id}/convert")
async def convert_work_request(request_id: str, payload: WorkRequestConversion, current_user: User = Depends(get_current_user)):
    item = await _load_request(request_id, current_user)
    target = payload.target.lower()
    if target == "task":
        return await WorkRequestService.convert_to_task(item, current_user, payload.task)
    if target == "project":
        return await WorkRequestService.convert_to_project(item, current_user, payload.project)
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Conversion target must be task or project")
