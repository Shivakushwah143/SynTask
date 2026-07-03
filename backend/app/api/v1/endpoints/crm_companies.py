from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field

from app.api.dependencies import get_current_user
from app.crm.companies import CRMCompanyService
from app.models.user import User

router = APIRouter()


class CRMCompanyPayload(BaseModel):
    name: str = Field(..., min_length=1)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    notes: Optional[str] = None
    primary_contact_id: Optional[str] = None


class CRMCompanyUpdatePayload(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    notes: Optional[str] = None
    primary_contact_id: Optional[str] = None


@router.get("")
async def list_companies(
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
):
    return await CRMCompanyService.list_companies(current_user, search=search, skip=skip, limit=limit)


@router.post("")
async def create_company(payload: CRMCompanyPayload, current_user: User = Depends(get_current_user)):
    return await CRMCompanyService.create_company(current_user, payload.model_dump())


@router.get("/{company_id}")
async def get_company(company_id: str, current_user: User = Depends(get_current_user)):
    return await CRMCompanyService.get_company(current_user, company_id)


@router.patch("/{company_id}")
async def update_company(company_id: str, payload: CRMCompanyUpdatePayload, current_user: User = Depends(get_current_user)):
    return await CRMCompanyService.update_company(current_user, company_id, payload.model_dump(exclude_unset=True))


@router.delete("/{company_id}")
async def delete_company(company_id: str, current_user: User = Depends(get_current_user)):
    return await CRMCompanyService.delete_company(current_user, company_id)
