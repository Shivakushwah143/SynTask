"""
Super Admin audit log model and helper.
"""
from datetime import datetime
from typing import Any, Dict

from beanie import Document, Indexed
from pydantic import Field


class AuditLog(Document):
    action: Indexed(str)
    actor_id: str
    target_type: str
    target_id: Indexed(str)
    details: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "audit_logs"
        indexes = ["action", "actor_id", "target_type", "target_id", "created_at"]


async def log_audit(action: str, actor_id: str, target_type: str, target_id: str, details: Dict[str, Any] | None = None) -> None:
    await AuditLog(
        action=action,
        actor_id=actor_id,
        target_type=target_type,
        target_id=target_id,
        details=details or {},
    ).insert()
