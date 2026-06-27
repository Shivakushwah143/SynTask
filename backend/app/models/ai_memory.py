"""
Persistent AI memory models.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, TEXT, IndexModel


class CompanyMemory(Document):
    company_id: Indexed(str)
    title: str
    content: str
    memory_type: str
    source: str
    importance: int = Field(default=1, ge=1, le=5)
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    last_seen_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "company_memory"
        indexes = [
            "company_id",
            "memory_type",
            "importance",
            "last_seen_at",
            IndexModel([("company_id", ASCENDING), ("memory_type", ASCENDING), ("last_seen_at", DESCENDING)]),
            IndexModel([("title", TEXT), ("content", TEXT), ("tags", TEXT)]),
        ]


class ProjectMemory(Document):
    company_id: Indexed(str)
    project_id: Indexed(str)
    title: str
    content: str
    memory_type: str
    source: str
    importance: int = Field(default=1, ge=1, le=5)
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    last_seen_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "project_memory"
        indexes = [
            "company_id",
            "project_id",
            "memory_type",
            "importance",
            "last_seen_at",
            IndexModel([("company_id", ASCENDING), ("project_id", ASCENDING), ("last_seen_at", DESCENDING)]),
            IndexModel([("title", TEXT), ("content", TEXT), ("tags", TEXT)]),
        ]


class UserMemory(Document):
    company_id: Indexed(str)
    user_id: Indexed(str)
    title: str
    content: str
    memory_type: str
    source: str
    importance: int = Field(default=1, ge=1, le=5)
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    last_seen_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "user_memory"
        indexes = [
            "company_id",
            "user_id",
            "memory_type",
            "importance",
            "last_seen_at",
            IndexModel([("company_id", ASCENDING), ("user_id", ASCENDING), ("last_seen_at", DESCENDING)]),
            IndexModel([("title", TEXT), ("content", TEXT), ("tags", TEXT)]),
        ]


class ClientMemory(Document):
    company_id: Indexed(str)
    client_id: Indexed(str)
    title: str
    content: str
    memory_type: str
    source: str
    importance: int = Field(default=1, ge=1, le=5)
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    last_seen_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


    class Settings:
        name = "client_memory"
        indexes = [
            "company_id",
            "client_id",
            "memory_type",
            "importance",
            "last_seen_at",
            IndexModel([("company_id", ASCENDING), ("client_id", ASCENDING), ("last_seen_at", DESCENDING)]),
            IndexModel([("title", TEXT), ("content", TEXT), ("tags", TEXT)]),
        ]
