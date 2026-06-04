"""
Issue Types Model - Like Jira Issue Types (Bug, Story, Task, Epic, etc.)
"""
from datetime import datetime
from typing import Optional, List
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum


class IssueTypeCategory(str, Enum):
    STANDARD = "standard"
    SUBTASK = "subtask"
    EPIC = "epic"


class IssueType(Document):
    """Issue Type Model - Custom issue types like Jira"""
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None  # Icon URL or name
    color: str = "#0052CC"
    
    # Scope
    company_id: Optional[str] = None  # None for global, or company-specific
    project_id: Optional[str] = None  # None for global, or project-specific
    
    # Category
    category: IssueTypeCategory = IssueTypeCategory.STANDARD
    
    # Settings
    is_active: bool = True
    is_default: bool = False
    
    # Order
    order: int = 0
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str
    
    class Settings:
        name = "issue_types"
        indexes = [
            "company_id",
            "project_id",
            "is_active",
        ]


