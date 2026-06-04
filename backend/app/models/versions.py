"""
Versions/Releases Model - Like Jira Versions
"""
from datetime import datetime
from typing import Optional, List
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum


class VersionStatus(str, Enum):
    UNRELEASED = "unreleased"
    RELEASED = "released"
    ARCHIVED = "archived"


class Version(Document):
    """Version/Release Model - Like Jira Versions"""
    name: str
    description: Optional[str] = None
    project_id: Indexed(str)
    company_id: str
    
    # Dates
    start_date: Optional[datetime] = None
    release_date: Optional[datetime] = None
    released: bool = False
    archived: bool = False
    
    # Status
    status: VersionStatus = VersionStatus.UNRELEASED
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str
    
    class Settings:
        name = "versions"
        indexes = [
            "project_id",
            "company_id",
            "status",
            "released",
        ]


