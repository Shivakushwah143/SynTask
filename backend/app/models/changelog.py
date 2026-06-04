"""
Changelog Model - Track all changes to tasks/issues
"""
from datetime import datetime
from typing import Optional, Dict, Any
from beanie import Document, Indexed
from pydantic import Field


class ChangeLog(Document):
    """Change Log Model - Track all changes to tasks"""
    task_id: Indexed(str)
    company_id: str
    
    # Who made the change
    user_id: str
    user_name: str
    
    # What changed
    field: str  # Field name that changed
    field_type: str  # Type of field (status, priority, assignee, etc.)
    
    # Change details
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None
    old_string: Optional[str] = None
    new_string: Optional[str] = None
    
    # Additional metadata
    metadata: Dict[str, Any] = {}
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "changelogs"
        indexes = [
            "task_id",
            "company_id",
            "user_id",
            "created_at",
        ]


