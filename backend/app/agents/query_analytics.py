"""
Query Intelligence — privacy-safe analytics for every Executive/HR Agent query.

FRD reference:
"Capture every Executive/HR Agent question as a query analytics event so
SynTask can learn what users actually ask and improve routing, tools,
prompts, fast paths, and UX over time."

Each event stores only the minimum useful metadata:
- company/user reference (never PII)
- timestamp
- original query (subject to retention policy)
- normalized intent/topic
- selected agent/tools
- success/error outcome
- Groq calls/tokens/latency
- optional user feedback (future)

NO automatic training on raw conversations.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from app.core.clock import utc_now

logger = logging.getLogger(__name__)

# In-memory buffer — flushed to MongoDB periodically or on shutdown.
# Keeps the hot path fast; a background task can drain this.
_event_buffer: list[dict[str, Any]] = []
_BUFFER_MAX = 200  # flush when buffer exceeds this


def capture_query_event(
    *,
    company_id: str,
    user_id: str,
    conversation_id: str,
    message: str,
    path: str,
    agent_id: str,
    selected_tools: list[str],
    packs_used: list[str],
    success: bool,
    error: str | None = None,
    groq_calls: int = 0,
    total_tokens: int = 0,
    latency_ms: float = 0.0,
    cache_hit: bool = False,
    clarification_needed: bool = False,
    missing_data: bool = False,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Record a query analytics event.

    This is fire-and-forget: failures are logged but never block the request.
    """
    event: dict[str, Any] = {
        "company_id": company_id,
        "user_id": user_id,
        "conversation_id": conversation_id,
        "message": message[:500],  # truncate for privacy
        "normalized_intent": _normalize_intent(message),
        "path": path,
        "agent_id": agent_id,
        "selected_tools": selected_tools,
        "packs_used": packs_used,
        "success": success,
        "error": error,
        "groq_calls": groq_calls,
        "total_tokens": total_tokens,
        "latency_ms": round(latency_ms, 1),
        "cache_hit": cache_hit,
        "clarification_needed": clarification_needed,
        "missing_data": missing_data,
        "metadata": metadata or {},
        "occurred_at": utc_now().isoformat(),
    }

    _event_buffer.append(event)

    # Auto-flush if buffer is full
    if len(_event_buffer) >= _BUFFER_MAX:
        _flush_events()


def _normalize_intent(message: str) -> str:
    """Extract a short normalized intent from the message."""
    text = message.lower().strip()
    # Simple keyword extraction
    if any(w in text for w in ("how many", "count", "total")):
        return "count_query"
    if any(w in text for w in ("who is", "find", "search", "tell me about")):
        return "entity_lookup"
    if any(w in text for w in ("why", "how is", "what happened", "cause", "reason")):
        return "analysis"
    if any(w in text for w in ("attention", "health", "brief", "summary")):
        return "overview"
    if any(w in text for w in ("risk", "problem", "issue", "delayed", "overdue")):
        return "risk_assessment"
    if any(w in text for w in ("compare", "versus", "vs", "difference")):
        return "comparison"
    return "general_query"


def _flush_events() -> None:
    """Flush buffered events to MongoDB."""
    if not _event_buffer:
        return

    events_to_flush = _event_buffer[:]
    _event_buffer.clear()

    try:
        import asyncio
        loop = asyncio.get_running_loop()
        loop.create_task(_persist_events(events_to_flush))
    except RuntimeError:
        # No event loop running — best effort synchronous
        logger.debug("No event loop; %d analytics events dropped", len(events_to_flush))


async def _persist_events(events: list[dict[str, Any]]) -> None:
    """Write events to MongoDB."""
    try:
        from app.models.agent import AgentRunEvent

        for event_data in events:
            event = AgentRunEvent(
                event_id=event_data["conversation_id"] + ":" + event_data["normalized_intent"],
                run_id=event_data["conversation_id"],
                tenant_id=event_data["company_id"],
                previous_state=None,
                new_state="completed" if event_data["success"] else "failed",
                event_type="query_analytics",
                actor_type="user",
                actor_id=event_data["user_id"],
                reason=event_data["message"],
                metadata={
                    "normalized_intent": event_data["normalized_intent"],
                    "path": event_data["path"],
                    "agent_id": event_data["agent_id"],
                    "selected_tools": event_data["selected_tools"],
                    "packs_used": event_data["packs_used"],
                    "groq_calls": event_data["groq_calls"],
                    "total_tokens": event_data["total_tokens"],
                    "latency_ms": event_data["latency_ms"],
                    "cache_hit": event_data["cache_hit"],
                    "clarification_needed": event_data["clarification_needed"],
                    "missing_data": event_data["missing_data"],
                    "extra": event_data["metadata"],
                },
                occurred_at=utc_now(),
            )
            await event.insert()
        logger.debug("Flushed %d query analytics events", len(events))
    except Exception:
        logger.exception("Failed to flush query analytics events")


def flush_now() -> None:
    """Public sync flush — call during graceful shutdown."""
    _flush_events()
