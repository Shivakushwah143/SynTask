"""
AISecurityEvent — explicit security decision audit model.

Stores safe metadata only — NEVER stores:
    - raw sensitive tool results
    - payroll bodies / salary payloads
    - employee documents / credentials
    - full malicious/raw prompts
    - access tokens

Security audit persistence failure must NEVER grant access.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel

from app.core.clock import utc_now

logger = logging.getLogger(__name__)


class AISecurityEvent(Document):
    """Immutable security decision record for AI governance audit trail."""

    event_id: str = Field(default_factory=lambda: str(uuid4()))

    # Traceability
    trace_id: str | None = None
    run_id: str | None = None

    # Actor
    company_id: str
    user_id: str
    role: str

    # Capability
    agent: str
    capability: str

    # Decision
    decision: str  # ALLOW, DENY, REQUIRE_APPROVAL
    decision_code: str | None = None  # DenialReason value
    decision_details: str | None = None

    # Risk
    risk_level: str | None = None
    injection_signal: str | None = None

    # Resource (safe references only)
    resource_type: str | None = None
    resource_id_safe: str | None = None  # truncated/hashed, never raw

    # Policy
    policy_version: str | None = None

    # Timestamp
    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "ai_security_events"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("created_at", ASCENDING)]),
            IndexModel([("decision", ASCENDING)]),
            IndexModel([("agent", ASCENDING), ("capability", ASCENDING)]),
            IndexModel([("user_id", ASCENDING), ("created_at", ASCENDING)]),
        ]


async def record_security_event(
    *,
    company_id: str,
    user_id: str,
    role: str,
    agent: str,
    capability: str,
    decision: str,
    decision_code: str | None = None,
    decision_details: str | None = None,
    risk_level: str | None = None,
    injection_signal: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    policy_version: str | None = None,
    trace_id: str | None = None,
    run_id: str | None = None,
) -> None:
    """Record a security decision event.

    Best-effort: failure to persist must NEVER affect the authorization decision.
    """
    try:
        # Safe resource ID — truncate to prevent leaking sensitive info
        safe_rid = None
        if resource_id:
            safe_rid = resource_id[:8] + "..." if len(resource_id) > 8 else resource_id

        event = AISecurityEvent(
            company_id=company_id,
            user_id=user_id,
            role=role,
            agent=agent,
            capability=capability,
            decision=decision,
            decision_code=decision_code,
            decision_details=decision_details,
            risk_level=risk_level,
            injection_signal=injection_signal,
            resource_type=resource_type,
            resource_id_safe=safe_rid,
            policy_version=policy_version,
            trace_id=trace_id,
            run_id=run_id,
        )
        await event.insert()
    except Exception:
        # Security audit persistence failure must NEVER grant access
        logger.warning(
            "Failed to record security event for %s/%s — authorization unchanged",
            capability,
            decision,
        )
