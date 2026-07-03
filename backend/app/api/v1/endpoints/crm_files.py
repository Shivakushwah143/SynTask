"""
CRM lead files endpoints.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile

from app.api.dependencies import get_current_user
from app.crm.lead_files import CRMLeadFilesService
from app.models.user import User

router = APIRouter()


@router.get("/leads/{lead_id}/files")
async def list_lead_files(lead_id: str, current_user: User = Depends(get_current_user)):
    return await CRMLeadFilesService.list_files(current_user, lead_id)


@router.post("/leads/{lead_id}/files")
async def upload_lead_file(
    lead_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    return await CRMLeadFilesService.upload_file(current_user, lead_id, file)


@router.delete("/leads/{lead_id}/files/{file_id}")
async def delete_lead_file(
    lead_id: str,
    file_id: str,
    current_user: User = Depends(get_current_user),
):
    return await CRMLeadFilesService.delete_file(current_user, lead_id, file_id)
