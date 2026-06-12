from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


class CreateClientRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    contact: Optional[str] = None
    company_name: Optional[str] = None
    tags: List[str] = []


class ClientResponse(BaseModel):
    id: str
    name: str
    company_id: str
    email: Optional[str] = None
    contact: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime
