"""OpenTelemetry tracing bootstrap, instrumentation and helpers.

Design rules (Topic 9):

* **Never fatal.**  Every OpenTelemetry import and instrumentation call is
  guarded; a missing/broken dependency degrades to a no-op, it never breaks
  application startup, request handling or Celery.
* **Bounded attributes only.**  Resource/span attributes never carry user IDs,
  emails, company IDs, request IDs or other high-cardinality identifiers.
* **Complement, don't replace.**  The existing custom AI observability
  (``app.ai.observability``) keeps its own storage.  This module only *adds*
  OTLP spans and can expose the OTLP ``trace_id`` so the two systems can be
  cross-referenced.
* **Configurable sampling.**  ``OTEL_TRACES_SAMPLER_ARG`` (0.0–1.0) controls
  the ratio; the production default is 10 %.

Environment variables
---------------------
``OTEL_TRACES_ENABLED``       ``true``/``false``.  Default: enabled in
                              production, disabled elsewhere (opt-in for dev).
``OTEL_EXPORTER_OTLP_ENDPOINT``  OTLP/gRPC endpoint (default ``http://tempo:4317``).
``OTEL_SERVICE_NAME``         fallback service name.
``OTEL_TRACES_SAMPLER``       ``always_on`` | ``always_off`` | ``traceidratio``.
``OTEL_TRACES_SAMPLER_ARG``   ratio for ``traceidratio`` (production default 0.1).
"""

from __future__ import annotations

import importlib
import logging
import os
from contextlib import contextmanager
from typing import Any, Iterator, Optional

logger = logging.getLogger(__name__)

_DEFAULT_OTLP_ENDPOINT = "http://tempo:4317"

# Cached OpenTelemetry references (``None`` when the SDK is unavailable).
_trace_api = None
_tracer_provider = None
_tracer = None
_configured = False
_dependencies_instrumented = False
_fastapi_instrumented = False


# ---------------------------------------------------------------------------
# Availability / configuration helpers
# ---------------------------------------------------------------------------

def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _settings_environment() -> str:
    try:
        from app.core.config import settings

        return str(settings.ENVIRONMENT)
    except Exception:  # pragma: no cover - defensive
        return os.getenv("ENVIRONMENT", "development")


def tracing_enabled() -> bool:
    """Return whether OTLP tracing is active for this process.

    Explicitly opt-in/out via ``OTEL_TRACES_ENABLED``.  When unset, tracing is
    enabled only in production so local/CI runs stay quiet by default.
    """
    default = _settings_environment() == "production"
    return _env_bool("OTEL_TRACES_ENABLED", default)


def sampler_ratio() -> float:
    """Sampling probability for root spans (0.0–1.0)."""
    raw = os.getenv("OTEL_TRACES_SAMPLER_ARG")
    if raw is not None and raw.strip():
        try:
            return max(0.0, min(1.0, float(raw)))
        except ValueError:
            logger.warning("Invalid OTEL_TRACES_SAMPLER_ARG=%r; using default", raw)
    # Production avoids unnecessary overhead; dev keeps full visibility.
    return 0.1 if _settings_environment() == "production" else 1.0


def _otlp_endpoint() -> str:
    return os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", _DEFAULT_OTLP_ENDPOINT).strip()


# ---------------------------------------------------------------------------
# Provider setup
# ---------------------------------------------------------------------------

def setup_tracing(service_name: Optional[str] = None):
    """Configure the global tracer provider once per process.

    Returns the tracer, or ``None`` when tracing is disabled/unavailable.
    Idempotent: the first caller in a process wins, so the API process keeps
    ``syntask-backend`` even though it transitively imports the Celery app.
    """
    global _trace_api, _tracer_provider, _tracer, _configured

    if _configured:
        return _tracer
    _configured = True

    if not tracing_enabled():
        logger.info("OpenTelemetry tracing disabled (OTEL_TRACES_ENABLED=false)")
        return None

    try:
        from opentelemetry import trace as trace_api
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
            OTLPSpanExporter,
        )
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.sdk.trace.sampling import (
            ALWAYS_OFF,
            ALWAYS_ON,
            ParentBased,
            TraceIdRatioBased,
        )
    except Exception as exc:  # pragma: no cover - depends on optional extras
        logger.warning("OpenTelemetry SDK unavailable; tracing disabled: %s", exc)
        return None

    resolved_service = (
        service_name or os.getenv("OTEL_SERVICE_NAME") or "syntask-backend"
    )

    from app.core.release import release_info

    release = release_info()
    resource_attrs: dict[str, Any] = {
        "service.name": resolved_service,
        "service.version": release["version"],
        "deployment.environment": release["environment"],
    }
    # Bounded release identity (one value per deploy — not high cardinality).
    if release["commit"] != "unknown":
        resource_attrs["vcs.revision"] = release["commit"]
    if release["branch"] != "unknown":
        resource_attrs["vcs.ref.head.name"] = release["branch"]

    sampler_name = os.getenv("OTEL_TRACES_SAMPLER", "").strip().lower()
    if sampler_name == "always_on":
        sampler = ParentBased(ALWAYS_ON)
    elif sampler_name == "always_off":
        sampler = ParentBased(ALWAYS_OFF)
    else:
        sampler = ParentBased(TraceIdRatioBased(sampler_ratio()))

    try:
        provider = TracerProvider(
            resource=Resource.create(resource_attrs),
            sampler=sampler,
        )
        endpoint = _otlp_endpoint()
        exporter = OTLPSpanExporter(
            endpoint=endpoint,
            insecure=endpoint.startswith("http://"),
        )
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace_api.set_tracer_provider(provider)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("OpenTelemetry provider setup failed; tracing disabled: %s", exc)
        return None

    _trace_api = trace_api
    _tracer_provider = provider
    _tracer = trace_api.get_tracer("syntask", release["version"])
    logger.info(
        "OpenTelemetry tracing enabled: service=%s endpoint=%s sampler=%s ratio=%s",
        resolved_service,
        endpoint,
        sampler_name or "traceidratio",
        sampler_ratio(),
    )
    return _tracer


# ---------------------------------------------------------------------------
# Instrumentation
# ---------------------------------------------------------------------------

def _instrument(module: str, class_name: str, **kwargs) -> bool:
    """Import and apply one instrumentation, never raising."""
    try:
        instrumentor = getattr(importlib.import_module(module), class_name)()
        instrumentor.instrument(**kwargs)
        return True
    except Exception as exc:  # pragma: no cover - depends on optional extras
        logger.info("OpenTelemetry instrumentation skipped (%s): %s", module, exc)
        return False


def instrument_dependencies() -> None:
    """Instrument outbound dependencies (HTTPX, Redis, PyMongo/Motor, Celery)."""
    global _dependencies_instrumented

    if _tracer is None or _dependencies_instrumented:
        return
    _dependencies_instrumented = True

    # HTTPX covers all app HTTP calls (AI providers, Meta, Zoom, eTimeOffice).
    _instrument("opentelemetry.instrumentation.httpx", "HTTPXClientInstrumentor")
    # Redis (redis.asyncio included) — cache/rate-limit/leader operations.
    _instrument("opentelemetry.instrumentation.redis", "RedisInstrumentor")
    # PyMongo command monitoring also covers Motor/Beanie, which sit on PyMongo.
    _instrument("opentelemetry.instrumentation.pymongo", "PymongoInstrumentor")
    # Celery producer + worker context propagation (API request -> task span).
    _instrument("opentelemetry.instrumentation.celery", "CeleryInstrumentor")


# Health / metrics probes must not create spans (reduces noise).
# Anchored regexes: OpenTelemetry joins these with "|" and applies `search`,
# so unanchored names would also exclude business routes such as
# `/api/v1/tasks/health/summary`.
_FASTAPI_EXCLUDED_URLS = (
    "^/health$,^/livez$,^/readyz$,^/metrics$,"
    "^/api/docs$,^/api/redoc$,^/api/openapi\\.json$"
)


def instrument_fastapi_app(app) -> None:
    """Instrument the FastAPI app (server spans for incoming requests)."""
    global _fastapi_instrumented

    if _tracer is None or _fastapi_instrumented:
        return
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(
            app,
            tracer_provider=_tracer_provider,
            excluded_urls=_FASTAPI_EXCLUDED_URLS,
        )
        _fastapi_instrumented = True
    except Exception as exc:  # pragma: no cover - depends on optional extras
        logger.info("FastAPI OpenTelemetry instrumentation skipped: %s", exc)


# ---------------------------------------------------------------------------
# Manual spans + trace id correlation
# ---------------------------------------------------------------------------

def current_trace_id() -> Optional[str]:
    """Return the active OTLP trace id as a 32-char hex string, or ``None``."""
    if _trace_api is None:
        return None
    try:
        span_context = _trace_api.get_current_span().get_span_context()
        if span_context is not None and span_context.is_valid:
            return format(span_context.trace_id, "032x")
    except Exception:  # pragma: no cover - defensive
        return None
    return None


@contextmanager
def trace_span(name: str, attributes: Optional[dict[str, Any]] = None) -> Iterator[Any]:
    """Create a manual span around a meaningful business operation.

    No-op (yields ``None``) when tracing is disabled or the SDK is unavailable,
    so instrumentation can be added to shared code paths safely.
    """
    if _tracer is None:
        yield None
        return
    try:
        span_cm = _tracer.start_as_current_span(name)
    except Exception:  # pragma: no cover - defensive
        yield None
        return
    with span_cm as span:
        if attributes:
            try:
                for key, value in attributes.items():
                    span.set_attribute(key, value)
            except Exception:  # pragma: no cover - defensive
                pass
        yield span


def shutdown_tracing() -> None:
    """Flush and shut down the provider so buffered spans reach Tempo."""
    global _tracer_provider
    if _tracer_provider is None:
        return
    try:
        _tracer_provider.shutdown()
    except Exception:  # pragma: no cover - defensive
        pass
