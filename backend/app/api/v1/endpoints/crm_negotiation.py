from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.dependencies import get_current_user
from app.crm import negotiation
from app.models.user import User

router = APIRouter()


class NegotiationPayload(BaseModel):
    accepted_quotation_reference: str | None = None
    negotiation_status: str | None = None
    customer_counter_offer: float | None = None
    final_agreed_amount: float | None = None
    discount: float | None = None
    final_scope: str | None = None
    payment_terms: str | None = None
    delivery_timeline: str | None = None
    client_conditions: str | None = None
    negotiation_notes: str | None = None
    next_follow_up: str | None = None
    next_follow_up_at: str | None = None


@router.get("/leads/{lead_id}/negotiation")
async def get_lead_negotiation(lead_id: str, current_user: User = Depends(get_current_user)):
    return await negotiation.get_negotiation(current_user, lead_id)


@router.patch("/leads/{lead_id}/negotiation")
async def patch_lead_negotiation(lead_id: str, payload: NegotiationPayload, current_user: User = Depends(get_current_user)):
    data: dict[str, Any] = payload.model_dump(exclude_unset=True)
    return await negotiation.patch_negotiation(current_user, lead_id, data)
