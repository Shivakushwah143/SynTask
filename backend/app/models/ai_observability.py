"""
AI Observability / LLMOps — persistence models.

One user AI request = one ``AITrace`` document; every operation caused by it
carries the same ``trace_id`` and is recorded as one ``AISpan`` document.

Operational observability is kept separate from:
- ``AgentRunEvent`` (audit/compliance)
- ``query_analytics`` (product/query analytics)

These records are tenant-safe and privacy-safe: spans store only safe
attributes (names, counts, latency, status, sanitized errors) — never full
HR/payroll/tool payloads or prompts.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel

from app.core.clock import utc_now


class AITraceStatus(str, Enum):
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    BLOCKED = "BLOCKED"
    ABORTED = "ABORTED"  # client disconnected / stream aborted


class AISpanType(str, Enum):
    REQUEST = "REQUEST"
    ROUTING = "ROUTING"
    QUERY_GATE = "QUERY_GATE"
    CAPABILITY_SELECTION = "CAPABILITY_SELECTION"
    AGENT = "AGENT"
    LLM = "LLM"
    TOOL = "TOOL"
    CACHE = "CACHE"
    SERVICE = "SERVICE"
    RESPONSE = "RESPONSE"


class AISpanStatus(str, Enum):
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    ABORTED = "ABORTED"


class AITrace(Document):
    """One end-to-end trace for one AI request."""

    trace_id: Indexed(str)
    tenant_id: Indexed(str)
    user_id: Optional[str] = None
    role: Optional[str] = None
    conversation_id: Optional[str] = None

    # Routing / runtime identity
    agent: Optional[str] = None
    path: Optional[str] = None
    route: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    prompt_version: Optional[str] = None
    streaming: bool = False

    status: AITraceStatus = AITraceStatus.RUNNING
    started_at: datetime = Field(default_factory=utc_now)
    completed_at: Optional[datetime] = None
    total_latency_ms: float = 0.0

    # Aggregated counters
    groq_calls: int = 0
    tool_calls: int = 0
    steps: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

    error_type: Optional[str] = None
    error_message_safe: Optional[str] = None
    # Sanitized/truncated query excerpt (only when enabled in settings).
    query_excerpt: Optional[str] = None

    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "ai_traces"
        indexes = [
            "trace_id",
            "tenant_id",
            "status",
            "agent",
            IndexModel([("tenant_id", ASCENDING), ("started_at", DESCENDING)]),
            IndexModel([("tenant_id", ASCENDING), ("agent", ASCENDING), ("started_at", DESCENDING)]),
            IndexModel([("trace_id", ASCENDING)], unique=True),
        ]


class AISpan(Document):
    """One nested span inside an AI trace."""

    trace_id: Indexed(str)
    tenant_id: Indexed(str)
    parent_span_id: Optional[str] = None
    span_id: Indexed(str)

    type: AISpanType
    name: str
    status: AISpanStatus = AISpanStatus.RUNNING

    started_at: datetime = Field(default_factory=utc_now)
    completed_at: Optional[datetime] = None
    latency_ms: float = 0.0

    # Safe scalar metadata only (names/counts/latency) — never raw payloads.
    safe_attributes: dict[str, Any] = Field(default_factory=dict)
    error_type: Optional[str] = None
    error_message_safe: Optional[str] = None

    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "ai_spans"
        indexes = [
            "trace_id",
            "span_id",
            "tenant_id",
            "type",
            "status",
            IndexModel([("trace_id", ASCENDING), ("started_at", ASCENDING)]),
            IndexModel([("tenant_id", ASCENDING), ("type", ASCENDING), ("started_at", DESCENDING)]),
            IndexModel([("tenant_id", ASCENDING), ("status", ASCENDING), ("started_at", DESCENDING)]),
        ]
