"""
Persistent AI user emotional state.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from beanie import Document, Indexed
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class AIEmotionalState(BaseModel):
    stress_level: float = Field(default=0.0, ge=0.0, le=1.0)
    productivity_level: float = Field(default=0.0, ge=0.0, le=1.0)
    burnout_risk: float = Field(default=0.0, ge=0.0, le=1.0)
    mood: str = "neutral"


class AIWorkloadMetrics(BaseModel):
    total_tasks: int = Field(default=0, ge=0)
    overdue_count: int = Field(default=0, ge=0)
    completed_today: int = Field(default=0, ge=0)


class AIUserState(Document):
    user_id: Indexed(str)
    company_id: Optional[str] = None
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    emotional_state: AIEmotionalState = Field(default_factory=AIEmotionalState)
    workload_metrics: AIWorkloadMetrics = Field(default_factory=AIWorkloadMetrics)

    class Settings:
        name = "ai_user_state"
        indexes = [
            "user_id",
            "company_id",
            "last_updated",
            IndexModel([("user_id", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("last_updated", DESCENDING)]),
        ]
