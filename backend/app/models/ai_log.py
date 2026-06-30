"""
AI Interaction Log Model
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class AIInteractionLog(Document):
    feature: Indexed(str)
    role: Indexed(str)
    provider: Indexed(str)
    model: Optional[str] = None
    prompt_version: Optional[str] = None
    prompt_role_key: Optional[str] = None
    status: Indexed(str)

    company_id: Optional[str] = None
    user_id: Optional[str] = None
    target_user_id: Optional[str] = None

    prompt: Optional[str] = None
    context: Dict[str, Any] = Field(default_factory=dict)
    raw_response: Optional[str] = None
    parsed_response: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    fallback_chain: List[str] = Field(default_factory=list)
    executed_actions: List[Dict[str, Any]] = Field(default_factory=list)

    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    latency_ms: Optional[float] = None
    response_size_bytes: Optional[int] = None
    fallback_used: bool = False

    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "ai_logs"
        indexes = [
            "company_id",
            "user_id",
            "feature",
            "role",
            "status",
            "created_at",
            IndexModel([("company_id", ASCENDING), ("feature", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("created_at", DESCENDING)]),
        ]
