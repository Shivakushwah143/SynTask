"""OpenTelemetry distributed tracing for SynTask (Topic 9).

This package complements — and never replaces — the existing custom AI
observability stack (``app.ai.observability``).  The AI stack records product
level LLM/tool traces in MongoDB; this package emits infrastructure spans over
OTLP to Grafana Tempo.
"""

from app.observability.tracing import (  # noqa: F401
    current_trace_id,
    instrument_dependencies,
    instrument_fastapi_app,
    setup_tracing,
    shutdown_tracing,
    trace_span,
)

__all__ = [
    "current_trace_id",
    "instrument_dependencies",
    "instrument_fastapi_app",
    "setup_tracing",
    "shutdown_tracing",
    "trace_span",
]
