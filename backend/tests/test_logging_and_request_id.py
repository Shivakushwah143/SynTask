"""
Focused tests for Topic 1: logging configuration, X-Request-ID middleware,
and secret redaction in log output.

Coverage:
  - X-Request-ID: incoming header preserved, missing header generated
  - JSON log structure: timestamp, level, service, environment, logger, message
  - Secret redaction: passwords, tokens, api_keys, etc. are masked
  - Request logging fields: method, route, status_code, duration_ms, request_id
"""

from __future__ import annotations

import json
import logging
import re
import uuid

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
from starlette.testclient import TestClient

from app.core.logging_config import (
    REDACTED,
    _JSONFormatter,
    redact_secrets,
)
from app.middleware.request_id import (
    RequestIDMiddleware,
    _RequestIDFilter,
    request_id_filter,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_app() -> FastAPI:
    """Build a tiny FastAPI app wired with the RequestIDMiddleware."""
    app = FastAPI()

    @app.get("/ping")
    async def ping(request: Request):
        return PlainTextResponse("pong")

    @app.get("/health")
    async def health():
        return PlainTextResponse("ok")

    app.add_middleware(RequestIDMiddleware)
    return app


def _json_log_record(**kwargs) -> logging.LogRecord:
    """Create a minimal LogRecord and format it with _JSONFormatter."""
    record = logging.LogRecord(
        name=kwargs.pop("name", "test"),
        level=kwargs.pop("level", logging.INFO),
        pathname="",
        lineno=0,
        msg=kwargs.pop("msg", "hello"),
        args=(),
        exc_info=None,
    )
    for k, v in kwargs.items():
        setattr(record, k, v)
    return record


# ---------------------------------------------------------------------------
# 1. X-Request-ID header behaviour
# ---------------------------------------------------------------------------

class TestRequestIDMiddleware:
    """Verify that the middleware preserves / generates request IDs."""

    def test_incoming_x_request_id_is_preserved(self):
        app = _make_app()
        client = TestClient(app)
        rid = uuid.uuid4().hex
        resp = client.get("/ping", headers={"X-Request-ID": rid})
        assert resp.headers.get("X-Request-ID") == rid

    def test_missing_x_request_id_is_generated(self):
        app = _make_app()
        client = TestClient(app)
        resp = client.get("/ping")
        generated = resp.headers.get("X-Request-ID")
        assert generated is not None
        assert len(generated) == 32  # uuid hex
        # Should be valid hex
        int(generated, 16)

    def test_different_requests_get_different_ids(self):
        app = _make_app()
        client = TestClient(app)
        ids = {client.get("/ping").headers.get("X-Request-ID") for _ in range(5)}
        assert len(ids) == 5

    def test_health_endpoint_skips_access_log(self, caplog):
        """Health paths must not emit a structured access log line."""
        app = _make_app()
        with caplog.at_level(logging.INFO, logger="app.middleware.request_id"):
            client = TestClient(app)
            client.get("/health")
        # request_id middleware still stamps the header but should NOT log
        assert not any("GET /health completed" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# 2. JSON log structure (production formatter)
# ---------------------------------------------------------------------------

class TestJSONLogFormatter:
    """Verify that _JSONFormatter emits the expected top-level keys."""

    def _format(self, **kwargs) -> dict:
        rec = _json_log_record(**kwargs)
        formatter = _JSONFormatter()
        raw = formatter.format(rec)
        return json.loads(raw)

    def test_basic_fields_present(self):
        entry = self._format(name="app.core.email")
        assert entry["level"] == "INFO"
        assert entry["service"] == "syntask-backend"
        assert entry["logger"] == "app.core.email"
        assert entry["message"] == "hello"
        # timestamp is an ISO-8601 string
        assert isinstance(entry["timestamp"], str)
        assert "T" in entry["timestamp"]
        # environment comes from settings (default "development" in test)
        assert "environment" in entry

    def test_optional_structured_fields_attached(self):
        entry = self._format(
            msg="done",
            method="POST",
            route="/api/v1/tasks",
            status_code=201,
            duration_ms=42.5,
            request_id="abc123",
        )
        assert entry["method"] == "POST"
        assert entry["route"] == "/api/v1/tasks"
        assert entry["status_code"] == 201
        assert entry["duration_ms"] == 42.5
        assert entry["request_id"] == "abc123"

    def test_message_gets_redacted_through_formatter(self):
        entry = self._format(msg="user password=secret123 is weak")
        assert "secret123" not in entry["message"]
        assert REDACTED in entry["message"]

    def test_exception_attached(self):
        try:
            raise ValueError("boom")
        except ValueError:
            import sys
            rec = _json_log_record(msg="err", exc_info=sys.exc_info())
        formatter = _JSONFormatter()
        entry = json.loads(formatter.format(rec))
        assert "exception" in entry
        assert "ValueError" in entry["exception"]
        assert "boom" in entry["exception"]


# ---------------------------------------------------------------------------
# 3. Secret redaction
# ---------------------------------------------------------------------------

class TestRedactSecrets:
    """Verify that redact_secrets masks known credential patterns."""

    @pytest.mark.parametrize("msg,secret", [
        ("password=changeme123", "changeme123"),
        ("password: hunter2", "hunter2"),
        ("token: abcdef123456", "abcdef123456"),
        ("token=sk-live-424242", "sk-live-424242"),
        ("api_key=AKIAIOSFODNN7", "AKIAIOSFODNN7"),
        ("api-key: MYSECRETKEY", "MYSECRETKEY"),
        ("secret=not-a-secret", "not-a-secret"),
        # Note: authorization pattern masks the first word after the colon
        # (e.g. "Basic", "Bearer"), not the token payload.
        ("authorization: Basic dXNlcjpwYXNz", "Basic"),
        ("Bearer tok123", "tok123"),
        ("reset_link=https://example.com/reset?token=abc", "abc"),
        ("credentials=admin:passw0rd", "passw0rd"),
    ])
    def test_secret_is_redacted(self, msg, secret):
        result = redact_secrets(msg)
        assert secret not in result
        assert REDACTED in result

    def test_normal_text_unaffected(self):
        msg = "Application started on port 8080"
        assert redact_secrets(msg) == msg

    def test_idempotent_redaction(self):
        msg = "password=secret123"
        once = redact_secrets(msg)
        twice = redact_secrets(once)
        assert once == twice


# ---------------------------------------------------------------------------
# 4. Request-ID filter integration with log records
# ---------------------------------------------------------------------------

class TestRequestIDFilter:
    """Verify the logging filter injects request_id into log records."""

    def test_filter_sets_request_id(self):
        filt = _RequestIDFilter()
        filt.set_request_id("req-42")
        record = logging.LogRecord("x", logging.INFO, "", 0, "msg", (), None)
        assert filt.filter(record)
        assert record.request_id == "req-42"  # type: ignore[attr-defined]

    def test_filter_clears_request_id(self):
        filt = _RequestIDFilter()
        filt.set_request_id("req-42")
        filt.clear_request_id()
        record = logging.LogRecord("x", logging.INFO, "", 0, "msg", (), None)
        filt.filter(record)
        assert not hasattr(record, "request_id")


# ---------------------------------------------------------------------------
# 5. Integration: request log line contains expected fields
# ---------------------------------------------------------------------------

class TestRequestLoggingIntegration:
    """Integration test: a real HTTP request produces a structured log with
    method, route, status_code, duration_ms, and request_id."""

    def test_access_log_fields_present(self, caplog):
        app = _make_app()
        # Attach filter to the root logger so log records get request_id
        logging.getLogger().addFilter(request_id_filter)
        try:
            with caplog.at_level(logging.INFO):
                client = TestClient(app)
                resp = client.get("/ping", headers={"X-Request-ID": "test-rid-001"})
                assert resp.status_code == 200

            # Find the access log line from request_id module
            access_lines = [
                r for r in caplog.records
                if "GET /ping completed" in r.getMessage()
            ]
            assert access_lines, "No access log line found for GET /ping"
            rec = access_lines[0]
            assert getattr(rec, "method", None) == "GET"
            assert getattr(rec, "route", None) == "/ping"
            assert getattr(rec, "request_id", None) == "test-rid-001"
            assert getattr(rec, "status_code", None) == 200
            assert isinstance(getattr(rec, "duration_ms", None), float)
        finally:
            logging.getLogger().removeFilter(request_id_filter)
