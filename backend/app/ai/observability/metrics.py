"""
Metrics — operational aggregates derived from AITrace / AISpan records.

All queries are tenant-scoped and time-bounded. Percentiles are computed in
Python over the fetched window (V1 volume is modest and admin-only).
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from app.core.clock import utc_now
from app.models.ai_observability import AITrace, AITraceStatus, AISpan, AISpanType

logger = logging.getLogger(__name__)

MAX_METRIC_SAMPLE = 5000


def _pct(sorted_values: list[float], pct: float) -> Optional[float]:
    if not sorted_values:
        return None
    if pct <= 0:
        return sorted_values[0]
    if pct >= 100:
        return sorted_values[-1]
    idx = (len(sorted_values) - 1) * pct / 100.0
    lower = int(idx)
    upper = min(lower + 1, len(sorted_values) - 1)
    if lower == upper:
        return round(sorted_values[lower], 1)
    frac = idx - lower
    return round(sorted_values[lower] * (1 - frac) + sorted_values[upper] * frac, 1)


def _latency_stats(values: list[float]) -> dict[str, Optional[float]]:
    ordered = sorted(v for v in values if v is not None)
    return {
        "p50_ms": _pct(ordered, 50),
        "p95_ms": _pct(ordered, 95),
        "p99_ms": _pct(ordered, 99),
    }


def _trace_time_filter(start: Optional[datetime], end: Optional[datetime]) -> dict[str, Any]:
    f: dict[str, Any] = {}
    if start:
        f["$gte"] = start
    if end:
        f["$lte"] = end
    return f


async def overview_metrics(
    *,
    tenant_id: str,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    agent: Optional[str] = None,
) -> dict[str, Any]:
    """Overview: request/success/latency/Groq/token/tool aggregates + health flags."""
    trace_q: dict[str, Any] = {"tenant_id": tenant_id}
    time_f = _trace_time_filter(start, end)
    if time_f:
        trace_q["started_at"] = time_f
    if agent:
        trace_q["agent"] = agent

    traces = (
        await AITrace.find(trace_q)
        .sort([("started_at", -1)])
        .limit(MAX_METRIC_SAMPLE)
        .to_list()
    )
    total = len(traces)
    success = sum(1 for t in traces if t.status == AITraceStatus.SUCCESS)
    failed = sum(1 for t in traces if t.status == AITraceStatus.FAILED)
    blocked = sum(1 for t in traces if t.status == AITraceStatus.BLOCKED)
    aborted = sum(1 for t in traces if t.status == AITraceStatus.ABORTED)
    running = sum(1 for t in traces if t.status == AITraceStatus.RUNNING)

    latencies = [float(t.total_latency_ms or 0) for t in traces if t.completed_at]
    latency = _latency_stats(latencies)

    groq_calls = sum(int(t.groq_calls or 0) for t in traces)
    tool_calls = sum(int(t.tool_calls or 0) for t in traces)
    total_tokens = sum(int(t.total_tokens or 0) for t in traces)
    fast_path = sum(1 for t in traces if int(t.groq_calls or 0) == 0 and t.completed_at)
    max_step_failures = sum(
        1 for t in traces if t.error_type and "MAX_STEPS" in (t.error_type or "")
    )

    # ── LLM / provider-level metrics (spans) ────────────────────────────────
    llm_q: dict[str, Any] = {"tenant_id": tenant_id, "type": AISpanType.LLM.value}
    if time_f:
        llm_q["started_at"] = time_f
    llm_spans = await AISpan.find(llm_q).sort([("started_at", -1)]).limit(MAX_METRIC_SAMPLE).to_list()
    llm_calls = len(llm_spans)
    llm_tokens = sum(int(s.safe_attributes.get("total_tokens") or 0) for s in llm_spans)
    llm_latency = _latency_stats([float(s.latency_ms or 0) for s in llm_spans if s.completed_at])
    _429 = sum(int(s.safe_attributes.get("429_count") or 0) for s in llm_spans)
    _400 = sum(int(s.safe_attributes.get("400_count") or 0) for s in llm_spans)
    timeouts = sum(int(s.safe_attributes.get("timeout_count") or 0) for s in llm_spans)
    retries = sum(int(s.safe_attributes.get("retry_count") or 0) for s in llm_spans)

    # ── Tool failure rate ────────────────────────────────────────────────────
    tool_q: dict[str, Any] = {"tenant_id": tenant_id, "type": AISpanType.TOOL.value}
    if time_f:
        tool_q["started_at"] = time_f
    tool_spans = await AISpan.find(tool_q).sort([("started_at", -1)]).limit(MAX_METRIC_SAMPLE).to_list()
    tool_failures = sum(1 for s in tool_spans if s.status in {"FAILED", "ABORTED"})

    success_rate = round((success / total) * 100, 1) if total else None
    tool_failure_rate = round((tool_failures / len(tool_spans)) * 100, 1) if tool_spans else None
    _429_rate = round((_429 / llm_calls) * 100, 1) if llm_calls else None
    _400_rate = round((_400 / llm_calls) * 100, 1) if llm_calls else None

    from app.core.config import settings

    health_flags = _health_flags(
        settings=settings,
        p95=latency.get("p95_ms"),
        requests=total,
        success_rate=success_rate,
        tool_failure_rate=tool_failure_rate,
        _429_rate=_429_rate,
        max_step_failures=max_step_failures,
        llm_failures=llm_calls - sum(1 for s in llm_spans if s.status == "SUCCESS"),
    )

    return {
        "range": {
            "start": start.isoformat() + "Z" if start else None,
            "end": end.isoformat() + "Z" if end else None,
        },
        "requests": total,
        "success_rate": success_rate,
        "failure_rate": round((failed / total) * 100, 1) if total else None,
        "counts": {
            "success": success,
            "failed": failed,
            "blocked": blocked,
            "aborted": aborted,
            "running": running,
        },
        "latency_ms": latency,
        "avg_groq_calls_per_request": round(groq_calls / total, 2) if total else 0,
        "avg_tool_calls_per_request": round(tool_calls / total, 2) if total else 0,
        "total_tokens": total_tokens,
        "fast_path_requests": fast_path,
        "fast_path_rate": round((fast_path / total) * 100, 1) if total else None,
        "max_step_failures": max_step_failures,
        "groq": {
            "calls": llm_calls,
            "total_tokens": llm_tokens,
            "latency_ms": llm_latency,
            "429_count": _429,
            "400_count": _400,
            "timeout_count": timeouts,
            "retry_count": retries,
            "429_rate": _429_rate,
            "400_rate": _400_rate,
        },
        "tools": {
            "calls": len(tool_spans),
            "failure_rate": tool_failure_rate,
            "failed": tool_failures,
        },
        "health": {
            "status": _health_status(health_flags),
            "flags": health_flags,
        },
    }


def _health_flags(
    *,
    settings,
    p95: Optional[float],
    requests: int,
    success_rate: Optional[float],
    tool_failure_rate: Optional[float],
    _429_rate: Optional[float],
    max_step_failures: int,
    llm_failures: int,
) -> list[dict[str, Any]]:
    flags: list[dict[str, Any]] = []
    if requests == 0:
        return flags

    p95_threshold = getattr(settings, "AI_OPS_P95_LATENCY_THRESHOLD_MS", 20000)
    if p95 is not None and p95 > p95_threshold:
        flags.append({
            "id": "high_p95_latency",
            "level": "warning",
            "message": f"P95 AI latency {p95:.0f}ms exceeds {p95_threshold}ms threshold",
        })

    tool_threshold = getattr(settings, "AI_OPS_TOOL_FAILURE_RATE_THRESHOLD", 10.0)
    if tool_failure_rate is not None and tool_failure_rate > tool_threshold:
        flags.append({
            "id": "tool_failures",
            "level": "warning",
            "message": f"Tool failure rate {tool_failure_rate:.1f}% exceeds {tool_threshold}% threshold",
        })

    rate_429_threshold = getattr(settings, "AI_OPS_GROQ_429_RATE_THRESHOLD", 5.0)
    if _429_rate is not None and _429_rate > rate_429_threshold:
        flags.append({
            "id": "groq_rate_limited",
            "level": "warning",
            "message": f"Groq 429 rate {_429_rate:.1f}% exceeds {rate_429_threshold}% threshold",
        })

    step_spike_threshold = getattr(settings, "AI_OPS_MAX_STEPS_SPIKE_THRESHOLD", 3)
    if max_step_failures > step_spike_threshold:
        flags.append({
            "id": "max_steps_spike",
            "level": "warning",
            "message": f"{max_step_failures} MAX_STEPS_EXCEEDED failures in window",
        })

    if llm_failures > 0 and llm_failures >= max(2, int(requests * 0.1)):
        flags.append({
            "id": "provider_errors",
            "level": "warning",
            "message": f"{llm_failures} failed Groq calls in window",
        })
    return flags


def _health_status(flags: list[dict[str, Any]]) -> str:
    if not flags:
        return "ok"
    if any(f["level"] == "critical" for f in flags):
        return "critical"
    return "warning"


async def agent_metrics(
    *,
    tenant_id: str,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> list[dict[str, Any]]:
    """Per-agent aggregates: Executive / HR requests, success %, P95, steps, errors."""
    trace_q: dict[str, Any] = {"tenant_id": tenant_id, "agent": {"$ne": None}}
    time_f = _trace_time_filter(start, end)
    if time_f:
        trace_q["started_at"] = time_f
    traces = (
        await AITrace.find(trace_q)
        .sort([("started_at", -1)])
        .limit(MAX_METRIC_SAMPLE)
        .to_list()
    )
    by_agent: dict[str, list[Any]] = {}
    for t in traces:
        by_agent.setdefault(t.agent or "unknown", []).append(t)

    rows = []
    for agent, items in sorted(by_agent.items()):
        completed = [t for t in items if t.completed_at]
        success = sum(1 for t in items if t.status == AITraceStatus.SUCCESS)
        max_step = sum(1 for t in items if t.error_type and "MAX_STEPS" in (t.error_type or ""))
        errors: dict[str, int] = {}
        for t in items:
            if t.error_type:
                errors[t.error_type] = errors.get(t.error_type, 0) + 1
        rows.append({
            "agent": agent,
            "requests": len(items),
            "success_rate": round((success / len(items)) * 100, 1) if items else None,
            "latency_ms": _latency_stats([float(t.total_latency_ms or 0) for t in completed]),
            "avg_steps": round(sum(int(t.steps or 0) for t in items) / len(items), 2) if items else 0,
            "avg_groq_calls": round(sum(int(t.groq_calls or 0) for t in items) / len(items), 2) if items else 0,
            "max_step_failures": max_step,
            "errors": errors,
        })
    return rows


async def tool_metrics(
    *,
    tenant_id: str,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> list[dict[str, Any]]:
    """Per-tool operational view: calls, failure %, P95 latency."""
    tool_q: dict[str, Any] = {"tenant_id": tenant_id, "type": AISpanType.TOOL.value}
    time_f = _trace_time_filter(start, end)
    if time_f:
        tool_q["started_at"] = time_f
    spans = await AISpan.find(tool_q).sort([("started_at", -1)]).limit(MAX_METRIC_SAMPLE).to_list()

    by_tool: dict[str, list[Any]] = {}
    for s in spans:
        by_tool.setdefault(s.name or "unknown", []).append(s)

    rows = []
    for tool, items in sorted(by_tool.items(), key=lambda kv: -len(kv[1])):
        failed = sum(1 for s in items if s.status in {"FAILED", "ABORTED"})
        rows.append({
            "tool": tool,
            "calls": len(items),
            "failure_rate": round((failed / len(items)) * 100, 1) if items else None,
            "failed": failed,
            "latency_ms": _latency_stats([float(s.latency_ms or 0) for s in items if s.completed_at]),
        })
    return rows


async def provider_metrics(
    *,
    tenant_id: str,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    model: Optional[str] = None,
) -> dict[str, Any]:
    """Groq/provider operational view from LLM spans."""
    llm_q: dict[str, Any] = {"tenant_id": tenant_id, "type": AISpanType.LLM.value}
    time_f = _trace_time_filter(start, end)
    if time_f:
        llm_q["started_at"] = time_f
    if model:
        llm_q["safe_attributes.model"] = model
    spans = await AISpan.find(llm_q).sort([("started_at", -1)]).limit(MAX_METRIC_SAMPLE).to_list()

    calls = len(spans)
    models: dict[str, int] = {}
    for s in spans:
        m = s.safe_attributes.get("model") or "unknown"
        models[m] = models.get(m, 0) + 1

    return {
        "calls": calls,
        "models": models,
        "total_tokens": sum(int(s.safe_attributes.get("total_tokens") or 0) for s in spans),
        "latency_ms": _latency_stats([float(s.latency_ms or 0) for s in spans if s.completed_at]),
        "429_count": sum(int(s.safe_attributes.get("429_count") or 0) for s in spans),
        "400_count": sum(int(s.safe_attributes.get("400_count") or 0) for s in spans),
        "timeout_count": sum(int(s.safe_attributes.get("timeout_count") or 0) for s in spans),
        "retry_count": sum(int(s.safe_attributes.get("retry_count") or 0) for s in spans),
        "failed": sum(1 for s in spans if s.status in {"FAILED", "ABORTED"}),
    }
