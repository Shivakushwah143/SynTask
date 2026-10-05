"""
Tracer — lightweight, non-fatal trace/span recording for the AI runtime.

Design goals:
- One user request = one ``trace_id`` propagated through the whole runtime.
- Spans are buffered in memory inside ``TraceContext`` and persisted once at
  ``end_trace`` (single AITrace insert + bulk AISpan insert).
- Persistence is scheduled as a background task and guarded by try/except:
  telemetry failures NEVER break or slow the AI response.
- Provider-neutral: agents never import vendor SDKs; they only call this API.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import contextmanager
from typing import Any, Optional
from uuid import uuid4

from app.ai.observability.context import (
    TraceContext,
    TraceSpan,
    bind_trace,
    get_current_trace,
    next_span_id,
    set_current_trace,
)
from app.ai.observability.sanitization import (
    error_type_for,
    is_blocked_error_type,
    sanitize_attrs,
    sanitize_error_message,
)
from app.core.config import settings
from app.models.ai_observability import AITrace, AITraceStatus, AISpan

logger = logging.getLogger(__name__)

# Live traces registry — allows re-binding across task/generator boundaries.
_live_traces: dict[str, TraceContext] = {}
_pending_tasks: set[asyncio.Task] = set()


def telemetry_enabled() -> bool:
    return bool(getattr(settings, "AI_TELEMETRY_ENABLED", True))


# ---------------------------------------------------------------------------
# Trace lifecycle
# ---------------------------------------------------------------------------


def start_trace(
    *,
    tenant_id: str,
    user_id: Optional[str] = None,
    role: Optional[str] = None,
    conversation_id: Optional[str] = None,
    streaming: bool = False,
    query_excerpt: Optional[str] = None,
    agent: Optional[str] = None,
    provider: Optional[str] = "groq",
) -> Optional[TraceContext]:
    """Create a new trace context and bind it to the current task.

    Returns ``None`` when telemetry is disabled so callers can fast-path.
    """
    if not telemetry_enabled():
        return None
    if not tenant_id:
        return None
    ctx = TraceContext(
        trace_id=str(uuid4()),
        tenant_id=str(tenant_id),
        user_id=str(user_id) if user_id else None,
        role=role,
        conversation_id=conversation_id,
        streaming=streaming,
        query_excerpt=query_excerpt,
        agent=agent,
        provider=provider,
    )
    _live_traces[ctx.trace_id] = ctx
    set_current_trace(ctx)
    return ctx


def get_trace_by_id(trace_id: str) -> Optional[TraceContext]:
    return _live_traces.get(trace_id)


async def end_trace(
    ctx: TraceContext,
    *,
    status: Optional[str] = None,
    error_type: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    """Finalize a trace, aggregate counters, and persist (non-fatally).

    Must be awaited from an async context so persistence can run; internally
    persistence is scheduled on the running loop and never awaited by callers.
    """
    if ctx is None:
        return
    if get_current_trace() is ctx:
        set_current_trace(None)
    _live_traces.pop(ctx.trace_id, None)

    # If an error surfaced, mark the trace failed/blocked accordingly.
    if error_type or error_message:
        ctx.error_type = error_type or error_type_for(error_message)
        ctx.error_message_safe = sanitize_error_message(error_message or "")
    if ctx.error_type and (status is None or status == AITraceStatus.SUCCESS.value):
        if is_blocked_error_type(ctx.error_type):
            status = AITraceStatus.BLOCKED.value
        else:
            status = AITraceStatus.FAILED.value
    if status is None:
        # Respect an error status recorded mid-request; otherwise success.
        if ctx.status in {AITraceStatus.FAILED.value, AITraceStatus.BLOCKED.value, AITraceStatus.ABORTED.value}:
            status = ctx.status
        else:
            status = AITraceStatus.SUCCESS.value
    ctx.status = status
    ctx.completed_at = _completed_at_now(ctx)

    # Aggregate from recorded spans.
    llm_spans = [s for s in ctx.spans if s.type == "LLM"]
    tool_spans = [s for s in ctx.spans if s.type == "TOOL"]
    ctx.groq_calls = len(llm_spans)
    ctx.tool_calls = len(tool_spans)
    ctx.steps = _max_steps(ctx)
    ctx.prompt_tokens = sum(s.safe_attributes.get("prompt_tokens") or 0 for s in llm_spans)
    ctx.completion_tokens = sum(s.safe_attributes.get("completion_tokens") or 0 for s in llm_spans)
    ctx.total_tokens = sum(s.safe_attributes.get("total_tokens") or 0 for s in llm_spans)
    ctx.total_latency_ms = _latency_ms(ctx)
    # Inherit the last model seen for trace-level model attribution.
    if not ctx.model and llm_spans:
        ctx.model = llm_spans[-1].safe_attributes.get("model")
    if not ctx.agent:
        agent_spans = [s for s in ctx.spans if s.type in {"AGENT", "ROUTING"}]
        if agent_spans:
            ctx.agent = agent_spans[-1].name

    await _schedule_persist(ctx)


def enrich_trace(
    ctx: Optional[TraceContext],
    *,
    agent: Optional[str] = None,
    path: Optional[str] = None,
    route: Optional[str] = None,
    model: Optional[str] = None,
    conversation_id: Optional[str] = None,
    query: Optional[str] = None,
) -> None:
    """Attach runtime identity metadata to the current trace when available."""
    if ctx is None:
        ctx = get_current_trace()
    if ctx is None:
        return
    if agent and not ctx.agent:
        ctx.agent = agent
    if path and not ctx.path:
        ctx.path = path
    if route and not ctx.route:
        ctx.route = route
    if model and not ctx.model:
        ctx.model = model
    if conversation_id and not ctx.conversation_id:
        ctx.conversation_id = conversation_id
    if query and not ctx.query_excerpt and getattr(settings, "AI_TELEMETRY_STORE_QUERY", True):
        from app.ai.observability.sanitization import sanitize_query_excerpt

        limit = int(getattr(settings, "AI_TELEMETRY_QUERY_EXCERPT_CHARS", 300))
        ctx.query_excerpt = sanitize_query_excerpt(query, max_chars=limit)


def record_error(ctx: TraceContext, error_type: Optional[str] = None, message: Optional[str] = None) -> None:
    """Best-effort mid-request error recording (does not finalize the trace)."""
    if ctx is None:
        return
    ctx.error_type = error_type or error_type_for(message)
    ctx.error_message_safe = sanitize_error_message(message or "")
    if ctx.error_type:
        ctx.status = (
            AITraceStatus.BLOCKED.value
            if is_blocked_error_type(ctx.error_type)
            else AITraceStatus.FAILED.value
        )


# ---------------------------------------------------------------------------
# Spans
# ---------------------------------------------------------------------------


def start_span(
    span_type: str,
    name: str,
    *,
    attrs: Optional[dict[str, Any]] = None,
    parent: Optional[str] = None,
) -> Optional[TraceSpan]:
    """Record the start of a span on the current trace (if any)."""
    ctx = get_current_trace()
    if ctx is None or not telemetry_enabled():
        return None
    span = TraceSpan(
        span_id=next_span_id(ctx.trace_id),
        trace_id=ctx.trace_id,
        type=span_type,
        name=name,
        parent_span_id=parent or ctx.current_span_id,
    )
    if attrs:
        span.safe_attributes.update(sanitize_attrs(attrs))
    ctx.spans.append(span)
    ctx.current_span_id = span.span_id
    return span


def end_span(
    span: Optional[TraceSpan],
    *,
    status: str = "SUCCESS",
    attrs: Optional[dict[str, Any]] = None,
    error_type: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    if span is None:
        return
    span.end(
        status=status,
        attrs=sanitize_attrs(attrs) if attrs else None,
        error_type=error_type,
        error_message=sanitize_error_message(error_message) if error_message else None,
    )
    # Restore nesting: only pop if the closed span is the current top.
    ctx = get_current_trace()
    if ctx is not None and ctx.current_span_id == span.span_id:
        # Find most recent parent to restore nesting depth.
        ctx.current_span_id = span.parent_span_id


@contextmanager
def trace_span(
    span_type: str,
    name: str,
    *,
    attrs: Optional[dict[str, Any]] = None,
    parent: Optional[str] = None,
):
    """Context manager that records a span for the current trace.

    No-op (returns a null span) when no trace is active, so instrumentation can
    be added freely to shared code paths without affecting non-AI callers.
    """
    span = start_span(span_type, name, attrs=attrs, parent=parent)
    try:
        yield span
    except Exception as exc:
        end_span(
            span,
            status="FAILED",
            error_type=error_type_for(exc),
            error_message=f"{type(exc).__name__}: {exc}",
        )
        raise
    else:
        end_span(span)


# ---------------------------------------------------------------------------
# Persistence (background, non-fatal)
# ---------------------------------------------------------------------------


def _completed_at_now(ctx: TraceContext):
    from app.core.clock import utc_now

    return utc_now()


def _latency_ms(ctx: TraceContext) -> float:
    import time

    return round((time.perf_counter() - ctx.started_mono) * 1000, 2)


def _max_steps(ctx: TraceContext) -> int:
    """Steps used = max step attribute across AGENT/LLM/tool spans."""
    values = [
        int(s.safe_attributes.get("step") or 0)
        for s in ctx.spans
        if s.safe_attributes.get("step") is not None
    ]
    return max(values) if values else 0


async def _schedule_persist(ctx: TraceContext) -> None:
    """Serialize trace + spans now, persist in background without blocking the request."""
    try:
        trace_doc = _serialize_trace(ctx)
        span_docs = [s.to_document() for s in ctx.spans]
        loop = asyncio.get_running_loop()
        task = loop.create_task(_persist(trace_doc, span_docs))
        _pending_tasks.add(task)
        task.add_done_callback(_pending_tasks.discard)
    except Exception as exc:  # no running loop / scheduling failure
        logger.warning("AI telemetry scheduling failed (non-fatal): %s", exc)


def _otel_trace_id() -> Optional[str]:
    """Active OTLP trace id (Topic 9), or None when tracing is disabled."""
    try:
        from app.observability.tracing import current_trace_id

        return current_trace_id()
    except Exception:  # pragma: no cover - tracing is optional
        return None


def _serialize_trace(ctx: TraceContext) -> dict[str, Any]:
    return {
        "trace_id": ctx.trace_id,
        # Additive cross-reference to the Tempo trace; never replaces trace_id.
        "otel_trace_id": _otel_trace_id(),
        "tenant_id": ctx.tenant_id,
        "user_id": ctx.user_id,
        "role": ctx.role,
        "conversation_id": ctx.conversation_id,
        "agent": ctx.agent,
        "path": ctx.path,
        "route": ctx.route,
        "provider": ctx.provider,
        "model": ctx.model,
        "prompt_version": ctx.prompt_version,
        "streaming": ctx.streaming,
        "status": ctx.status,
        "started_at": ctx.started_at,
        "completed_at": _completed_at_now(ctx),
        "total_latency_ms": round(ctx.total_latency_ms, 2),
        "groq_calls": ctx.groq_calls,
        "tool_calls": ctx.tool_calls,
        "steps": ctx.steps,
        "prompt_tokens": ctx.prompt_tokens,
        "completion_tokens": ctx.completion_tokens,
        "total_tokens": ctx.total_tokens,
        "error_type": ctx.error_type,
        "error_message_safe": ctx.error_message_safe,
        "query_excerpt": ctx.query_excerpt,
    }


async def _persist(trace_doc: dict[str, Any], span_docs: list[dict[str, Any]]) -> None:
    """Write the AITrace + AISpan documents. Never raises to the caller."""
    try:
        trace = AITrace(**trace_doc)
        await trace.insert()
    except Exception as exc:
        logger.warning("AI trace persistence failed (non-fatal): %s", exc)
        return
    if not span_docs:
        return
    try:
        if len(span_docs) == 1:
            await AISpan(**span_docs[0]).insert()
        else:
            await AISpan.insert_many([AISpan(**doc) for doc in span_docs])
    except Exception as exc:
        logger.warning("AI span persistence failed for trace %s (non-fatal): %s", trace_doc.get("trace_id"), exc)


# ---------------------------------------------------------------------------
# Convenience: begin/end a whole request in one helper
# ---------------------------------------------------------------------------


async def finish_trace_if_open(trace_id: str) -> None:
    """Close a trace that is still RUNNING (e.g. stream disconnect)."""
    ctx = get_trace_by_id(trace_id)
    if ctx is not None:
        await end_trace(ctx, status=AITraceStatus.ABORTED.value, error_type="STREAM_ABORTED", error_message="Stream closed before completion")


async def stream_trace_guard(ctx: Optional[TraceContext], agen):
    """Wrap an SSE generator so the trace is closed exactly once.

    - Normal end (``else``): finalize with the status recorded mid-stream by
      ``record_error`` (FAILED/BLOCKED) or SUCCESS.
    - Client disconnect / cancellation (``GeneratorExit``/``CancelledError``):
      close the trace as ``ABORTED``.
    - Escaped exception: close as ``BLOCKED`` with the classified error.

    Re-binds the trace into the generator's context (SSE body iterators are
    resumed by the ASGI server and may not inherit the request contextvar).
    """
    if ctx is None:
        async for ev in agen:
            yield ev
        return
    bind_trace(ctx)
    trace_id = ctx.trace_id
    try:
        async for ev in agen:
            yield ev
    except (GeneratorExit, asyncio.CancelledError):
        await finish_trace_if_open(trace_id)
        raise
    except Exception as exc:
        error_type, message = classify_span_error(exc)
        await end_trace(
            ctx,
            status=AITraceStatus.BLOCKED.value,
            error_type=error_type,
            error_message=message,
        )
        raise
    else:
        await end_trace(ctx)


def classify_span_error(exc: BaseException) -> tuple[str, str]:
    """Return (error_type, safe_error_message) for an LLM/provider exception."""
    name = type(exc).__name__
    if "Timeout" in name:
        return "TIMEOUT", f"{name}: {exc}"
    if name == "Groq400Error" or getattr(exc, "status_code", None) == 400:
        return "GROQ_400", f"{name}: {exc}"
    if getattr(exc, "status_code", None) == 429 or "429" in str(exc):
        return "RATE_LIMIT", f"{name}: {exc}"
    return "PROVIDER_ERROR", f"{name}: {exc}"
