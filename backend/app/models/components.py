"""
Components Model - Project components like Jira
"""
from datetime import datetime
from typing import Optional, List
from beanie import Document, Indexed
from pydantic import Field


class Component(Document):
    """Component Model - Project components for organizing work"""
    name: str
    description: Optional[str] = None
    project_id: Indexed(str)
    company_id: str
    
    # Assignment
    lead_id: Optional[str] = None  # Component lead
    assignee_type: str = "PROJECT_LEAD"  # PROJECT_LEAD, COMPONENT_LEAD, UNASSIGNED
    
    # Settings
    is_active: bool = True
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str
    
    class Settings:
        name = "components"
        indexes = [
            "project_id",
            "company_id",
            "is_active",
        ]


