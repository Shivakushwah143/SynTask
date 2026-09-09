"""
AI Operations API — LLMOps observability (Admin / Super Admin only).

Exposes tenant-scoped operational views derived from AITrace / AISpan
records: overview metrics, trace summaries + detail (safe spans), per-agent,
per-tool and per-provider (Groq) operational data, plus health/warning flags.

Normal employees/managers never access operational trace details. Records
are privacy-safe: only sanitized query excerpts, safe span attributes and
truncated error messages are ever returned.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.ai.observability import metrics as ai_metrics
from app.api.dependencies import get_current_user
from app.models.ai_observability import AISpan, AITrace, AITraceStatus
from app.models.user import User, UserRole

router = APIRouter()

DEFAULT_RANGE_DAYS = 1


def _role(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


async def require_ops_admin(current_user: User = Depends(get_current_user)) -> User:
    """Only Admin and Super Admin may view AI Operations."""
    if _role(current_user) not in {UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required for AI Operations",
        )
    return current_user


def _tenant_id(current_user: User) -> str:
    company_id = getattr(current_user, "company_id", None)
    if not company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant scope required")
    return str(company_id)


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        text = value.strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        return parsed
    except ValueError:
        return None


def _resolve_range(start: Optional[str], end: Optional[str], days: int) -> tuple[Optional[datetime], Optional[datetime]]:
    start_dt = _parse_dt(start)
    end_dt = _parse_dt(end)
    if start_dt and end_dt and start_dt > end_dt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="start must be before end")
    if start_dt is None and end_dt is None:
        end_dt = datetime.utcnow()
        start_dt = end_dt - timedelta(days=days)
    return start_dt, end_dt


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def _trace_summary(trace: AITrace) -> dict[str, Any]:
    return {
        "trace_id": trace.trace_id,
        "tenant_id": trace.tenant_id,
        "user_id": trace.user_id,
        "role": trace.role,
        "conversation_id": trace.conversation_id,
        "agent": trace.agent,
        "path": trace.path,
        "route": trace.route,
        "provider": trace.provider,
        "model": trace.model,
        "streaming": trace.streaming,
        "status": trace.status.value if hasattr(trace.status, "value") else str(trace.status),
        "started_at": trace.started_at.isoformat() + "Z",
        "completed_at": trace.completed_at.isoformat() + "Z" if trace.completed_at else None,
        "total_latency_ms": round(float(trace.total_latency_ms or 0), 1),
        "groq_calls": trace.groq_calls,
        "tool_calls": trace.tool_calls,
        "steps": trace.steps,
        "prompt_tokens": trace.prompt_tokens,
        "completion_tokens": trace.completion_tokens,
        "total_tokens": trace.total_tokens,
        "error_type": trace.error_type,
        "error_message_safe": trace.error_message_safe,
        "query_excerpt": trace.query_excerpt,
    }


def _span_view(span: AISpan) -> dict[str, Any]:
    return {
        "trace_id": span.trace_id,
        "span_id": span.span_id,
        "parent_span_id": span.parent_span_id,
        "type": span.type.value if hasattr(span.type, "value") else str(span.type),
        "name": span.name,
        "status": span.status.value if hasattr(span.status, "value") else str(span.status),
        "started_at": span.started_at.isoformat() + "Z",
        "completed_at": span.completed_at.isoformat() + "Z" if span.completed_at else None,
        "latency_ms": round(float(span.latency_ms or 0), 1),
        "attributes": span.safe_attributes or {},
        "error_type": span.error_type,
        "error_message_safe": span.error_message_safe,
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/overview")
async def operations_overview(
    start: Optional[str] = None,
    end: Optional[str] = None,
    days: int = Query(default=DEFAULT_RANGE_DAYS, ge=1, le=90),
    agent: Optional[str] = None,
    current_user: User = Depends(require_ops_admin),
):
    """Operational overview: requests, success rate, P50/P95 latency, tokens,
    Groq error rates, tool failure rate + health/warning flags."""
    start_dt, end_dt = _resolve_range(start, end, days)
    return await ai_metrics.overview_metrics(
        tenant_id=_tenant_id(current_user),
        start=start_dt,
        end=end_dt,
        agent=agent,
    )


@router.get("/traces")
async def list_traces(
    start: Optional[str] = None,
    end: Optional[str] = None,
    days: int = Query(default=DEFAULT_RANGE_DAYS, ge=1, le=90),
    agent: Optional[str] = None,
    status: Optional[str] = None,
    error_type: Optional[str] = None,
    model: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(require_ops_admin),
):
    """Trace list (summaries only). Optionally filter by status/error/model."""
    tenant = _tenant_id(current_user)
    start_dt, end_dt = _resolve_range(start, end, days)
    query: dict[str, Any] = {"tenant_id": tenant}
    if start_dt or end_dt:
        time_f: dict[str, Any] = {}
        if start_dt:
            time_f["$gte"] = start_dt
        if end_dt:
            time_f["$lte"] = end_dt
        query["started_at"] = time_f
    if agent:
        query["agent"] = agent
    if status:
        if status not in {s.value for s in AITraceStatus}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid status: {status}")
        query["status"] = status
    if error_type:
        query["error_type"] = error_type
    if model:
        query["model"] = model
    total = await AITrace.find(query).count()
    traces = (
        await AITrace.find(query)
        .sort([("started_at", -1)])
        .skip(offset)
        .limit(limit)
        .to_list()
    )
    return {
        "traces": [_trace_summary(t) for t in traces],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/traces/{trace_id}")
async def get_trace_detail(trace_id: str, current_user: User = Depends(require_ops_admin)):
    """Trace detail with its safe spans in chronological order."""
    tenant = _tenant_id(current_user)
    trace = await AITrace.find_one({"trace_id": trace_id, "tenant_id": tenant})
    if not trace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trace not found")
    spans = (
        await AISpan.find({"trace_id": trace_id})
        .sort([("started_at", 1)])
        .to_list()
    )
    return {
        "trace": _trace_summary(trace),
        "spans": [_span_view(span) for span in spans],
    }


@router.get("/agents")
async def operations_agents(
    start: Optional[str] = None,
    end: Optional[str] = None,
    days: int = Query(default=DEFAULT_RANGE_DAYS, ge=1, le=90),
    current_user: User = Depends(require_ops_admin),
):
    """Per-agent operational view (Executive / HR requests, steps, errors)."""
    start_dt, end_dt = _resolve_range(start, end, days)
    return {
        "agents": await ai_metrics.agent_metrics(
            tenant_id=_tenant_id(current_user),
            start=start_dt,
            end=end_dt,
        )
    }


@router.get("/tools")
async def operations_tools(
    start: Optional[str] = None,
    end: Optional[str] = None,
    days: int = Query(default=DEFAULT_RANGE_DAYS, ge=1, le=90),
    current_user: User = Depends(require_ops_admin),
):
    """Per-tool operational view: calls, failure %, P95 latency."""
    start_dt, end_dt = _resolve_range(start, end, days)
    return {
        "tools": await ai_metrics.tool_metrics(
            tenant_id=_tenant_id(current_user),
            start=start_dt,
            end=end_dt,
        )
    }


@router.get("/provider")
async def operations_provider(
    start: Optional[str] = None,
    end: Optional[str] = None,
    days: int = Query(default=DEFAULT_RANGE_DAYS, ge=1, le=90),
    model: Optional[str] = None,
    current_user: User = Depends(require_ops_admin),
):
    """Groq provider operational view: calls, tokens, latency, 429/400/timeouts/retries."""
    start_dt, end_dt = _resolve_range(start, end, days)
    return await ai_metrics.provider_metrics(
        tenant_id=_tenant_id(current_user),
        start=start_dt,
        end=end_dt,
        model=model,
    )
