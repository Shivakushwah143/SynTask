"""
Usage Tracking Model for Plan Enforcement
"""
from datetime import datetime
from typing import Optional, Dict, Any
from beanie import Document, Indexed
from pydantic import Field


class UsageTracking(Document):
    """Track company usage for plan enforcement"""
    company_id: Indexed(str)
    
    # Usage Period
    period_month: int  # 1-12
    period_year: int
    
    # User Counts
    total_users: int = 0
    total_managers: int = 0
    total_leads: int = 0
    total_employees: int = 0
    
    # Task/Project/Ticket Counts
    total_tasks: int = 0
    total_projects: int = 0
    total_tickets: int = 0
    
    # Storage
    storage_used_gb: float = 0.0
    
    # API Usage
    api_requests_count: int = 0
    
    # Limit Warnings (track when limits are approached)
    warnings_sent: Dict[str, Any] = Field(default_factory=dict)  # {"users": True, "storage": False}
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "usage_tracking"
        indexes = [
            ("company_id", "period_year", "period_month"),
            "company_id",
        ]

