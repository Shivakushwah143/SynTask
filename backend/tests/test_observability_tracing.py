"""
Focused tests for Topic 9 (OpenTelemetry tracing) and Topic 10 (release
identity).

These tests intentionally avoid installing a real OTLP exporter: the helpers
must be safe no-ops when tracing is disabled, and the config/release helpers are
pure functions. This keeps the suite deterministic and free of network calls.
"""

from __future__ import annotations

import json
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import observability
from app.observability import tracing as tracing_module
from app.core import release as release_module
from app.core.health import router as health_router
from app.core.logging_config import _JSONFormatter, _TraceContextFilter
from app.metrics import release as release_metrics


# ---------------------------------------------------------------------------
# 1. Enablement + sampling configuration
# ---------------------------------------------------------------------------

class TestTracingConfiguration:
    def test_explicit_disable_wins(self, monkeypatch):
        monkeypatch.setenv("OTEL_TRACES_ENABLED", "false")
        assert tracing_module.tracing_enabled() is False

    def test_explicit_enable(self, monkeypatch):
        monkeypatch.setenv("OTEL_TRACES_ENABLED", "true")
        assert tracing_module.tracing_enabled() is True

    def test_default_disabled_outside_production(self, monkeypatch):
        monkeypatch.delenv("OTEL_TRACES_ENABLED", raising=False)
        monkeypatch.setattr(tracing_module, "_settings_environment", lambda: "development")
        assert tracing_module.tracing_enabled() is False

    def test_default_enabled_in_production(self, monkeypatch):
        monkeypatch.delenv("OTEL_TRACES_ENABLED", raising=False)
        monkeypatch.setattr(tracing_module, "_settings_environment", lambda: "production")
        assert tracing_module.tracing_enabled() is True

    def test_sampler_arg_is_used(self, monkeypatch):
        monkeypatch.setenv("OTEL_TRACES_SAMPLER_ARG", "0.25")
        assert tracing_module.sampler_ratio() == pytest.approx(0.25)

    def test_sampler_arg_is_clamped(self, monkeypatch):
        monkeypatch.setenv("OTEL_TRACES_SAMPLER_ARG", "5")
        assert tracing_module.sampler_ratio() == 1.0
        monkeypatch.setenv("OTEL_TRACES_SAMPLER_ARG", "-3")
        assert tracing_module.sampler_ratio() == 0.0

    def test_production_default_is_ten_percent(self, monkeypatch):
        monkeypatch.delenv("OTEL_TRACES_SAMPLER_ARG", raising=False)
        monkeypatch.setattr(tracing_module, "_settings_environment", lambda: "production")
        assert tracing_module.sampler_ratio() == pytest.approx(0.1)

    def test_invalid_sampler_arg_falls_back(self, monkeypatch):
        monkeypatch.setenv("OTEL_TRACES_SAMPLER_ARG", "not-a-number")
        monkeypatch.setattr(tracing_module, "_settings_environment", lambda: "development")
        assert tracing_module.sampler_ratio() == 1.0


# ---------------------------------------------------------------------------
# 2. No-op safety when tracing is disabled
# ---------------------------------------------------------------------------

class TestTracingDisabledIsSafe:
    def setup_method(self):
        # Simulate "tracing disabled": no tracer, no OTel api reference.
        self._saved_tracer = tracing_module._tracer
        self._saved_api = tracing_module._trace_api
        self._saved_deps = tracing_module._dependencies_instrumented
        tracing_module._tracer = None
        tracing_module._trace_api = None
        tracing_module._dependencies_instrumented = False

    def teardown_method(self):
        tracing_module._tracer = self._saved_tracer
        tracing_module._trace_api = self._saved_api
        tracing_module._dependencies_instrumented = self._saved_deps

    def test_current_trace_id_is_none(self):
        assert tracing_module.current_trace_id() is None

    def test_trace_span_yields_none(self):
        with tracing_module.trace_span("noop", {"k": "v"}) as span:
            assert span is None

    def test_instrument_dependencies_is_noop(self):
        tracing_module.instrument_dependencies()
        assert tracing_module._dependencies_instrumented is False

    def test_instrument_fastapi_is_noop(self):
        app = FastAPI()
        tracing_module.instrument_fastapi_app(app)
        assert tracing_module._fastapi_instrumented is False

    def test_shutdown_without_provider_is_safe(self):
        tracing_module.shutdown_tracing()  # must not raise


# ---------------------------------------------------------------------------
# 3. Manual span helper with a fake tracer
# ---------------------------------------------------------------------------

class _FakeSpan:
    def __init__(self):
        self.attributes = {}

    def set_attribute(self, key, value):
        self.attributes[key] = value


class _FakeTracer:
    def __init__(self):
        self.last_span = None

    def start_as_current_span(self, name):
        tracer = self

        class _Ctx:
            def __enter__(self):
                tracer.last_span = _FakeSpan()
                return tracer.last_span

            def __exit__(self, *exc):
                return False

        return _Ctx()


class TestManualSpans:
    def test_trace_span_sets_bounded_attributes(self, monkeypatch):
        fake = _FakeTracer()
        monkeypatch.setattr(tracing_module, "_tracer", fake)
        with tracing_module.trace_span(
            "etimeoffice.attendance_sync", {"syntask.integration": "etimeoffice"}
        ) as span:
            assert span is not None
        assert fake.last_span.attributes == {"syntask.integration": "etimeoffice"}

    def test_trace_span_swallows_attribute_errors(self, monkeypatch):
        class _BrokenSpan:
            def set_attribute(self, key, value):
                raise RuntimeError("boom")

        class _BrokenCtx:
            def __enter__(self):
                return _BrokenSpan()

            def __exit__(self, *exc):
                return False

        class _BrokenTracer:
            def start_as_current_span(self, name):
                return _BrokenCtx()

        monkeypatch.setattr(tracing_module, "_tracer", _BrokenTracer())
        with tracing_module.trace_span("x", {"a": "b"}) as span:
            assert span is not None  # no exception leaks to the caller


# ---------------------------------------------------------------------------
# 4. Log <-> trace correlation
# ---------------------------------------------------------------------------

class TestLogTraceCorrelation:
    def test_json_formatter_includes_trace_id(self):
        record = logging.LogRecord("test", logging.INFO, "", 0, "msg", (), None)
        record.trace_id = "4bf92f3577b34da6a3ce929d0e0e4736"
        entry = json.loads(_JSONFormatter().format(record))
        assert entry["trace_id"] == "4bf92f3577b34da6a3ce929d0e0e4736"
        assert entry["message"] == "msg"

    def test_json_formatter_includes_release_fields(self):
        record = logging.LogRecord("test", logging.INFO, "", 0, "started", (), None)
        record.event = "deployment"
        record.release_commit = "abc123"
        record.release_version = "v1.2.3"
        entry = json.loads(_JSONFormatter().format(record))
        assert entry["event"] == "deployment"
        assert entry["release_commit"] == "abc123"
        assert entry["release_version"] == "v1.2.3"

    def test_filter_keeps_records_without_tracing(self):
        filt = _TraceContextFilter()
        record = logging.LogRecord("test", logging.INFO, "", 0, "msg", (), None)
        assert filt.filter(record) is True
        # No trace_id attribute added when tracing is unavailable.
        assert not hasattr(record, "trace_id")

    def test_filter_preserves_explicit_trace_id(self):
        filt = _TraceContextFilter()
        record = logging.LogRecord("test", logging.INFO, "", 0, "msg", (), None)
        record.trace_id = "explicit"
        filt.filter(record)
        assert record.trace_id == "explicit"


# ---------------------------------------------------------------------------
# 5. Release identity
# ---------------------------------------------------------------------------

class TestReleaseIdentity:
    def test_defaults_are_bounded(self, monkeypatch):
        for name in (
            "SYNTASK_RELEASE_COMMIT",
            "SYNTASK_RELEASE_VERSION",
            "SYNTASK_RELEASE_BRANCH",
            "SYNTASK_RELEASE_BUILT_AT",
            "GIT_SHA",
            "GIT_COMMIT",
            "GIT_BRANCH",
            "BUILD_TIMESTAMP",
        ):
            monkeypatch.delenv(name, raising=False)
        info = release_module.release_info()
        assert info["commit"] == "unknown"
        assert info["branch"] == "unknown"
        assert info["version"]  # falls back to settings.VERSION
        assert info["environment"]

    def test_env_values_are_read(self, monkeypatch):
        monkeypatch.setenv("SYNTASK_RELEASE_COMMIT", "abcdef1234567890")
        monkeypatch.setenv("SYNTASK_RELEASE_VERSION", "v9.9.9")
        monkeypatch.setenv("SYNTASK_RELEASE_BRANCH", "release/9.9")
        monkeypatch.setenv("SYNTASK_RELEASE_BUILT_AT", "2026-09-13T00:00:00Z")
        info = release_module.release_info()
        assert info["commit"] == "abcdef1234567890"
        assert info["commit_short"] == "abcdef123456"
        assert info["version"] == "v9.9.9"
        assert info["branch"] == "release/9.9"
        assert info["built_at"] == "2026-09-13T00:00:00Z"

    def test_release_log_fields_are_deployment_markers(self, monkeypatch):
        monkeypatch.setenv("SYNTASK_RELEASE_COMMIT", "deadbeef")
        fields = release_module.release_log_fields()
        assert fields["event"] == "deployment"
        assert fields["release_commit"] == "deadbeef"

    def test_build_info_metric_is_one(self, monkeypatch):
        monkeypatch.setenv("SYNTASK_RELEASE_COMMIT", "metric-test-commit")
        monkeypatch.setenv("SYNTASK_RELEASE_VERSION", "metric-test-version")
        release_metrics._registered_for = None
        release_metrics.register_release_metrics()
        value = release_metrics.BUILD_INFO.labels(
            version="metric-test-version",
            commit="metric-test-commit",
            branch=release_module.release_branch(),
            environment=release_module.release_info()["environment"],
        )._value.get()
        assert value == 1


# ---------------------------------------------------------------------------
# 6. Readiness surfaces release identity
# ---------------------------------------------------------------------------

class TestReadyzReleaseMetadata:
    def test_readyz_includes_release(self):
        app = FastAPI()
        app.include_router(health_router)
        client = TestClient(app)
        body = client.get("/readyz").json()
        assert "release" in body
        assert "commit" in body["release"]
        assert "version" in body["release"]


# ---------------------------------------------------------------------------
# 7. Package exports
# ---------------------------------------------------------------------------

def test_package_exports_helpers():
    for name in (
        "setup_tracing",
        "instrument_dependencies",
        "instrument_fastapi_app",
        "shutdown_tracing",
        "current_trace_id",
        "trace_span",
    ):
        assert hasattr(observability, name)


# ---------------------------------------------------------------------------
# 8. AI observability cross-reference is additive
# ---------------------------------------------------------------------------

def test_ai_trace_model_has_otel_trace_id():
    from app.models.ai_observability import AITrace

    fields = AITrace.model_fields
    assert "otel_trace_id" in fields
    # Existing custom trace_id must remain untouched.
    assert "trace_id" in fields
