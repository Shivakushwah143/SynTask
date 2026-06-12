from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class CreateTicketRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: str = Field(..., min_length=1)
    assigned_to: Optional[str] = None
    type: str = "general"
    priority: str = "medium"
    tags: List[str] = []


class TicketResponse(BaseModel):
    id: str
    ticket_number: str
    title: str
    description: str
    company_id: str
    created_by: str
    assigned_to: Optional[str] = None
    status: str
    priority: str
    created_at: datetime
    updated_at: datetime
