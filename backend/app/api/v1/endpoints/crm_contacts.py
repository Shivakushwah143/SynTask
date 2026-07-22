from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field

from app.api.dependencies import get_current_user
from app.crm.contacts import CRMContactService
from app.models.user import User
from app.api.deps import Pagination50, PaginationParams

router = APIRouter()


class CRMContactPayload(BaseModel):
    first_name: str = Field(..., min_length=1)
    last_name: str = Field(..., min_length=1)
    country_code: str = Field(default="+91")
    phone: str = Field(..., min_length=1)
    email: Optional[EmailStr] = None
    designation: Optional[str] = None
    channel: Optional[str] = None
    relationship_type: Optional[str] = None
    owner_name: Optional[str] = None
    owner_contact_no: Optional[str] = None
    tag: List[str] = Field(default_factory=list)
    crm_company_id: str
    is_primary_contact: bool = False


class CRMContactUpdatePayload(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    country_code: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    designation: Optional[str] = None
    channel: Optional[str] = None
    relationship_type: Optional[str] = None
    owner_name: Optional[str] = None
    owner_contact_no: Optional[str] = None
    tag: Optional[List[str]] = None
    crm_company_id: Optional[str] = None
    is_primary_contact: Optional[bool] = None


@router.get("")
async def list_contacts(
    search: Optional[str] = None,
    company_id: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user),
):
    skip, limit = pagination.skip, pagination.limit
    return await CRMContactService.list_contacts(current_user, search=search, company_id=company_id, skip=skip, limit=limit)


@router.get("/{contact_id}")
async def get_contact(contact_id: str, current_user: User = Depends(get_current_user)):
    return await CRMContactService.get_contact(current_user, contact_id)


@router.post("")
async def create_contact(payload: CRMContactPayload, current_user: User = Depends(get_current_user)):
    return await CRMContactService.create_contact(current_user, payload.model_dump())


@router.patch("/{contact_id}")
async def update_contact(contact_id: str, payload: CRMContactUpdatePayload, current_user: User = Depends(get_current_user)):
    return await CRMContactService.update_contact(current_user, contact_id, payload.model_dump(exclude_unset=True))


@router.delete("/{contact_id}")
async def delete_contact(contact_id: str, current_user: User = Depends(get_current_user)):
    return await CRMContactService.delete_contact(current_user, contact_id)
