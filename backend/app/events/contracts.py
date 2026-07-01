from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


class DomainEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_name: str
    event_version: int = 1
    aggregate_type: str
    aggregate_id: str
    company_id: str
    project_id: Optional[str] = None
    campaign_id: Optional[str] = None
    actor_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    payload: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str
    correlation_id: Optional[str] = None
    causation_id: Optional[str] = None

