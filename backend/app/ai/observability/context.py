"""
Trace context — per-request context propagation.

One user AI request = one ``TraceContext`` bound to a ``contextvars.ContextVar``.
Every instrumented layer (routing, query gate, capability selector, agent loop,
Groq provider, tool executor) reads the same context and appends spans to it.
Spans are buffered in memory and persisted once at trace end, keeping telemetry
off the request hot path.
"""
from __future__ import annotations

import contextvars
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from app.core.clock import utc_now
from app.models.ai_observability import AITraceStatus

_current_trace: contextvars.ContextVar[Optional["TraceContext"]] = contextvars.ContextVar(
    "ai_current_trace", default=None
)


@dataclass
class TraceSpan:
    """In-memory span being recorded for the current trace."""

    span_id: str
    trace_id: str
    type: str
    name: str
    parent_span_id: Optional[str] = None
    status: str = "RUNNING"
    started_at: datetime = field(default_factory=utc_now)
    started_mono: float = field(default_factory=time.perf_counter)
    completed_at: Optional[datetime] = None
    latency_ms: float = 0.0
    safe_attributes: dict[str, Any] = field(default_factory=dict)
    error_type: Optional[str] = None
    error_message_safe: Optional[str] = None

    def end(
        self,
        *,
        status: str = "SUCCESS",
        attrs: Optional[dict[str, Any]] = None,
        error_type: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> None:
        if self.completed_at is not None:
            return  # spans close exactly once
        self.status = status
        if attrs:
            self.safe_attributes.update(attrs)
        if error_type:
            self.error_type = error_type
        if error_message:
            self.error_message_safe = error_message
        self.completed_at = utc_now()
        self.latency_ms = round((time.perf_counter() - self.started_mono) * 1000, 2)

    def to_document(self) -> dict[str, Any]:
        return {
            "trace_id": self.trace_id,
            "span_id": self.span_id,
            "parent_span_id": self.parent_span_id,
            "type": self.type,
            "name": self.name,
            "status": self.status,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "latency_ms": self.latency_ms,
            "safe_attributes": self.safe_attributes,
            "error_type": self.error_type,
            "error_message_safe": self.error_message_safe,
        }


@dataclass
class TraceContext:
    """Mutable context accumulated across the lifetime of one AI request."""

    trace_id: str
    tenant_id: str
    started_at: datetime = field(default_factory=utc_now)
    started_mono: float = field(default_factory=time.perf_counter)
    user_id: Optional[str] = None
    role: Optional[str] = None
    conversation_id: Optional[str] = None
    streaming: bool = False
    query_excerpt: Optional[str] = None
    # Runtime identity — updated as routing/agents resolve.
    agent: Optional[str] = None
    path: Optional[str] = None
    route: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    prompt_version: Optional[str] = None
    # Final status / error (set at end_trace).
    status: str = AITraceStatus.RUNNING.value
    error_type: Optional[str] = None
    error_message_safe: Optional[str] = None
    # Aggregate counters.
    groq_calls: int = 0
    tool_calls: int = 0
    steps: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    completed_at: Optional[datetime] = None
    total_latency_ms: float = 0.0
    # Per-trace LLM call sequence (for "Groq #n" labels).
    llm_call_seq: int = 0
    # Buffered spans (persisted once at end_trace).
    spans: list[TraceSpan] = field(default_factory=list)
    # Nesting helper — id of the span opened most recently in this context.
    current_span_id: Optional[str] = None
    # Telemetry enablement snapshot: when disabled mid-request we skip writes.
    enabled: bool = True


def set_current_trace(ctx: Optional[TraceContext]) -> None:
    _current_trace.set(ctx)


def get_current_trace() -> Optional[TraceContext]:
    return _current_trace.get()


def bind_trace(ctx: Optional[TraceContext]) -> None:
    """Re-bind an existing trace context into the current task/context.

    Used across generator/task boundaries where the contextvar snapshot may not
    have propagated (e.g. SSE body iterators resumed by the ASGI server).
    """
    if ctx is not None:
        _current_trace.set(ctx)


def _span_seq() -> int:
    """Module-level sequence for short unique span ids."""
    global _SPAN_SEQ
    _SPAN_SEQ += 1
    return _SPAN_SEQ


_SPAN_SEQ = 0


def next_span_id(trace_id: str) -> str:
    return f"{trace_id[:8]}-{_span_seq():06d}"
