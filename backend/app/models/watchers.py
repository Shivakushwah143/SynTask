"""
Watchers Model - Users watching tasks/issues
"""
from datetime import datetime
from typing import List
from beanie import Document, Indexed
from pydantic import Field


class Watcher(Document):
    """Watcher Model - Users watching a task"""
    task_id: Indexed(str)
    user_id: Indexed(str)
    company_id: str
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "watchers"
        indexes = [
            ("task_id", "user_id"),  # Compound index for uniqueness
            "company_id",
        ]


