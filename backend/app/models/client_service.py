"""Client Service model.

Represents purchased or active services under a client account. Projects remain
the delivery execution system and are linked by id.
"""
from datetime import datetime
from enum import Enum
from typing import List, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class ClientServiceStatus(str, Enum):
    PLANNED = "planned"
    ACTIVE = "active"
    PAUSED = "paused"
    ENDED = "ended"


class ClientService(Document):
    client_id: Indexed(str)
    company_id: Indexed(str)

    name: str
    service_type: Optional[str] = None
    status: ClientServiceStatus = ClientServiceStatus.PLANNED
    pricing_value: Optional[float] = None
    billing_cycle: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    service_owner_id: Optional[str] = None
    team_member_ids: List[str] = Field(default_factory=list)
    linked_project_ids: List[str] = Field(default_factory=list)

    source_lead_id: Optional[str] = None
    source_category_id: Optional[str] = None
    notes: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "client_services"
        indexes = [
            "client_id",
            "company_id",
            "status",
            "service_owner_id",
            "team_member_ids",
            "linked_project_ids",
            "source_lead_id",
            IndexModel([("company_id", ASCENDING), ("client_id", ASCENDING), ("updated_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("client_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("source_lead_id", ASCENDING)]),
        ]
