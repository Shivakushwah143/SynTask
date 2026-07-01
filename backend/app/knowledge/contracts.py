from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


class KnowledgeRelationship(BaseModel):
    relationship_type: str
    entity_type: str
    entity_id: str
    label: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class KnowledgeEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_name: str
    event_version: int = 1
    aggregate_type: str
    aggregate_id: str
    company_id: str
    project_id: Optional[str] = None
    campaign_id: Optional[str] = None
    actor_id: Optional[str] = None
    occurred_at: datetime = Field(default_factory=datetime.utcnow)
    payload: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str
    correlation_id: Optional[str] = None
    causation_id: Optional[str] = None


class KnowledgeCreated(BaseModel):
    knowledge_id: str
    knowledge_type: str
    company_id: str
    source_entity: str
    source_entity_id: str
    source_event_id: str
    source_event_name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    relationships: List[KnowledgeRelationship] = Field(default_factory=list)

