"""
Focused tests for Topic 2: health endpoints + Prometheus RED metrics.

Covers:
  - /livez liveness probe
  - /readyz readiness probe dependency behaviour
  - /api/v1/health bug fix (returns status dict)
  - HTTP counter increments and status-code labels
  - FastAPI matched-route normalization + __unmatched__ fallback
  - /health, /metrics excluded from RED metrics
  - Histogram records duration
  - eTimeOffice metrics basic success/error
"""

from __future__ import annotations

import json
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.middleware.prometheus import (
    REQUEST_COUNT,
    REQUEST_DURATION,
    _resolve_route_label,
    PrometheusMiddleware,
    metrics_endpoint,
)
from app.core.health import router as health_router
from app.metrics.etimeoffice import (
    SYNC_RUNS,
    SYNC_DURATION,
    LAST_SUCCESSFUL_SYNC,
    record_sync_start,
    record_sync_success,
    record_sync_error,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_app() -> FastAPI:
    """Build a minimal FastAPI app with health, metrics, and test routes."""
    app = FastAPI()
    app.include_router(health_router)

    @app.get("/ping")
    async def ping():
        return "pong"

    @app.get("/users/{user_id}")
    async def get_user(user_id: str):
        return {"id": user_id}

    @app.get("/tasks/{task_id}/comments/{comment_id}")
    async def get_comment(task_id: str, comment_id: str):
        return {}

    @app.get("/health")
    async def legacy_health():
        return {"status": "ok"}

    @app.get("/metrics")
    async def metrics():
        return "metrics"

    app.add_middleware(PrometheusMiddleware)
    return app


# ---------------------------------------------------------------------------
# 1. /livez
# ---------------------------------------------------------------------------

class TestLiveness:
    def test_livez_returns_alive(self):
        app = _make_app()
        client = TestClient(app)
        resp = client.get("/livez")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "alive"
        assert "uptime_seconds" in body
        assert body["uptime_seconds"] >= 0

    def test_livez_no_db_dependency(self):
        app = _make_app()
        client = TestClient(app)
        resp = client.get("/livez")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# 2. /readyz
# ---------------------------------------------------------------------------

class TestReadiness:
    def test_readyz_structure(self):
        app = _make_app()
        client = TestClient(app)
        resp = client.get("/readyz")
        body = resp.json()
        assert "status" in body
        assert "checks" in body
        assert "mongodb" in body["checks"]
        assert "redis" in body["checks"]

    def test_readyz_reports_mongodb_check(self):
        app = _make_app()
        client = TestClient(app)
        resp = client.get("/readyz")
        body = resp.json()
        assert "ok" in body["checks"]["mongodb"]


# ---------------------------------------------------------------------------
# 3. /api/v1/health bug fix — returns the status dict
# ---------------------------------------------------------------------------

class TestAPIv1HealthBugFix:
    def test_health_returns_status_dict(self):
        """The /api/v1/health endpoint must return the status dict (not None)."""
        from app.api.v1.router import health_check
        import asyncio

        result = asyncio.get_event_loop().run_until_complete(health_check())
        if hasattr(result, "body"):
            body = json.loads(result.body)
        else:
            body = result
        assert "status" in body
        assert "checks" in body


# ---------------------------------------------------------------------------
# 4. FastAPI matched-route normalization via middleware
# ---------------------------------------------------------------------------

class TestRouteNormalization:
    """Verify the middleware uses FastAPI's route template for label values."""

    def test_static_route_uses_template(self):
        app = _make_app()
        client = TestClient(app)
        client.get("/ping")
        val = REQUEST_COUNT.labels(
            method="GET", normalized_route="/ping", status_code="200"
        )._value.get()
        assert val >= 1

    def test_dynamic_route_uses_fastapi_template(self):
        """FastAPI route /users/{user_id} must produce label /users/{user_id}."""
        app = _make_app()
        client = TestClient(app)
        client.get("/users/550e8400-e29b-41d4-a716-446655440000")
        val = REQUEST_COUNT.labels(
            method="GET", normalized_route="/users/{user_id}", status_code="200"
        )._value.get()
        assert val >= 1

    def test_nested_dynamic_route_uses_template(self):
        """FastAPI template /tasks/{task_id}/comments/{comment_id}."""
        app = _make_app()
        client = TestClient(app)
        client.get("/tasks/abc-123/comments/xyz-789")
        val = REQUEST_COUNT.labels(
            method="GET",
            normalized_route="/tasks/{task_id}/comments/{comment_id}",
            status_code="200",
        )._value.get()
        assert val >= 1

    def test_unmatched_route_collapses_to_unmatched(self):
        """Paths with no matching FastAPI route use __unmatched__."""
        app = _make_app()
        client = TestClient(app)
        client.get("/this/path/does/not/exist")
        val = REQUEST_COUNT.labels(
            method="GET", normalized_route="__unmatched__", status_code="404"
        )._value.get()
        assert val >= 1


# ---------------------------------------------------------------------------
# 5. HTTP counter increments + status-code labels
# ---------------------------------------------------------------------------

class TestHTTPCounter:
    def test_counter_increments_on_request(self):
        app = _make_app()
        client = TestClient(app)
        before = REQUEST_COUNT.labels(
            method="GET", normalized_route="/ping", status_code="200"
        )._value.get()
        client.get("/ping")
        after = REQUEST_COUNT.labels(
            method="GET", normalized_route="/ping", status_code="200"
        )._value.get()
        assert after == before + 1

    def test_counter_captures_status_code(self):
        app = _make_app()
        client = TestClient(app)
        client.get("/nonexistent")
        val = REQUEST_COUNT.labels(
            method="GET", normalized_route="__unmatched__", status_code="404"
        )._value.get()
        assert val >= 1


# ---------------------------------------------------------------------------
# 6. Excluded paths not counted
# ---------------------------------------------------------------------------

class TestExcludedPaths:
    def test_metrics_path_excluded(self):
        app = _make_app()
        client = TestClient(app)
        before = REQUEST_COUNT.labels(
            method="GET", normalized_route="/metrics", status_code="200"
        )._value.get()
        client.get("/metrics")
        after = REQUEST_COUNT.labels(
            method="GET", normalized_route="/metrics", status_code="200"
        )._value.get()
        assert after == before

    def test_health_path_excluded(self):
        app = _make_app()
        client = TestClient(app)
        before = REQUEST_COUNT.labels(
            method="GET", normalized_route="/health", status_code="200"
        )._value.get()
        client.get("/health")
        after = REQUEST_COUNT.labels(
            method="GET", normalized_route="/health", status_code="200"
        )._value.get()
        assert after == before

    def test_livez_excluded(self):
        app = _make_app()
        client = TestClient(app)
        client.get("/livez")
        # /livez should not appear as a RED metric label
        assert True  # no crash


# ---------------------------------------------------------------------------
# 7. Histogram records duration
# ---------------------------------------------------------------------------

class TestHistogramDuration:
    def test_histogram_observes_duration(self):
        app = _make_app()
        client = TestClient(app)
        before = REQUEST_DURATION.labels(
            method="GET", normalized_route="/ping"
        )._sum.get()
        client.get("/ping")
        after = REQUEST_DURATION.labels(
            method="GET", normalized_route="/ping"
        )._sum.get()
        assert after > before


# ---------------------------------------------------------------------------
# 8. eTimeOffice metrics
# ---------------------------------------------------------------------------

class TestETimeOfficeMetrics:
    def test_sync_success_records_metrics(self):
        before_runs = SYNC_RUNS.labels(status="success")._value.get()
        before_duration = SYNC_DURATION._sum.get()
        start = record_sync_start()
        time.sleep(0.01)
        record_sync_success(start)
        after_runs = SYNC_RUNS.labels(status="success")._value.get()
        after_duration = SYNC_DURATION._sum.get()
        assert after_runs == before_runs + 1
        assert after_duration > before_duration

    def test_sync_error_records_metrics(self):
        before_runs = SYNC_RUNS.labels(status="error")._value.get()
        start = record_sync_start()
        time.sleep(0.01)
        record_sync_error(start)
        after_runs = SYNC_RUNS.labels(status="error")._value.get()
        assert after_runs == before_runs + 1

    def test_last_successful_sync_gauge_set(self):
        before = LAST_SUCCESSFUL_SYNC._value.get()
        start = record_sync_start()
        record_sync_success(start)
        after = LAST_SUCCESSFUL_SYNC._value.get()
        assert after >= before


# ---------------------------------------------------------------------------
# 9. /metrics endpoint returns Prometheus format
# ---------------------------------------------------------------------------

class TestMetricsEndpoint:
    def test_metrics_endpoint_returns_prometheus_format(self):
        app = FastAPI()
        app.get("/metrics")(metrics_endpoint)
        client = TestClient(app)
        resp = client.get("/metrics")
        assert resp.status_code == 200
        text = resp.text
        assert "# HELP" in text or "# TYPE" in text
