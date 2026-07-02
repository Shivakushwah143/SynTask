"""
CRM lead notes endpoints.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.crm.lead_notes import CRMLeadNotesService
from app.models.user import User

router = APIRouter()


class LeadNotePayload(BaseModel):
    content: str = Field(..., min_length=1)


@router.get("/leads/{lead_id}/notes")
async def list_lead_notes(lead_id: str, current_user: User = Depends(get_current_user)):
    return await CRMLeadNotesService.list_notes(current_user, lead_id)


@router.post("/leads/{lead_id}/notes")
async def create_lead_note(
    lead_id: str,
    payload: LeadNotePayload,
    current_user: User = Depends(get_current_user),
):
    return await CRMLeadNotesService.create_note(current_user, lead_id, payload.content)


@router.patch("/leads/{lead_id}/notes/{note_id}")
async def update_lead_note(
    lead_id: str,
    note_id: str,
    payload: LeadNotePayload,
    current_user: User = Depends(get_current_user),
):
    return await CRMLeadNotesService.update_note(current_user, lead_id, note_id, payload.content)


@router.delete("/leads/{lead_id}/notes/{note_id}")
async def delete_lead_note(
    lead_id: str,
    note_id: str,
    current_user: User = Depends(get_current_user),
):
    return await CRMLeadNotesService.delete_note(current_user, lead_id, note_id)
