"""
Usage Tracking Model for Plan Enforcement
"""

from datetime import datetime
from typing import Any, Dict

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, IndexModel


class UsageTracking(Document):
    """Track company usage for plan enforcement."""

    company_id: Indexed(str)

    # Usage period
    period_month: int  
    period_year: int

    # User counts
    total_users: int = 0
    total_managers: int = 0
    total_leads: int = 0
    total_employees: int = 0

    # Task, project, and ticket counts
    total_tasks: int = 0
    total_projects: int = 0
    total_tickets: int = 0

    # Storage usage
    storage_used_gb: float = 0.0

    # API usage
    api_requests_count: int = 0

    # Tracks which usage-limit warnings have already been sent
    warnings_sent: Dict[str, Any] = Field(default_factory=dict)

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "usage_tracking"

        indexes = [
            IndexModel(
                [
                    ("company_id", ASCENDING),
                    ("period_year", ASCENDING),
                    ("period_month", ASCENDING),
                ],
                name="usage_company_period_idx",
            ),
        ]