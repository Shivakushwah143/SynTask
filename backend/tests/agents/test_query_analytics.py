"""Tests for query analytics intent normalization and event capture."""
from __future__ import annotations

import pytest

from app.agents.query_analytics import _normalize_intent, capture_query_event, _event_buffer


class TestNormalizeIntent:
    def test_count_query(self):
        assert _normalize_intent("How many employees do we have?") == "count_query"
        assert _normalize_intent("What is the total number of tasks?") == "count_query"

    def test_entity_lookup(self):
        assert _normalize_intent("Who is Vivek?") == "entity_lookup"
        assert _normalize_intent("Find the employee named John") == "entity_lookup"
        assert _normalize_intent("Tell me about client Acme") == "entity_lookup"

    def test_analysis(self):
        assert _normalize_intent("Why is the project delayed?") == "analysis"
        assert _normalize_intent("How is the sales team performing?") == "analysis"
        assert _normalize_intent("What happened today?") == "analysis"

    def test_overview(self):
        assert _normalize_intent("What needs my attention today?") == "overview"
        assert _normalize_intent("Give me a company health summary") == "overview"
        assert _normalize_intent("Daily brief") == "overview"

    def test_risk_assessment(self):
        assert _normalize_intent("Any overdue tasks?") == "risk_assessment"
        assert _normalize_intent("What are the project risks?") == "risk_assessment"

    def test_comparison(self):
        assert _normalize_intent("Compare Q1 and Q2 revenue") == "comparison"
        assert _normalize_intent("Sales versus last month") == "comparison"

    def test_general_query(self):
        assert _normalize_intent("Hello, how are you?") == "general_query"
        assert _normalize_intent("Tell me a joke") == "general_query"


class TestCaptureQueryEvent:
    def test_event_added_to_buffer(self):
        before = len(_event_buffer)
        capture_query_event(
            company_id="c1",
            user_id="u1",
            conversation_id="conv1",
            message="test message",
            path="FAST_FACT",
            agent_id="test",
            selected_tools=[],
            packs_used=[],
            success=True,
        )
        assert len(_event_buffer) == before + 1
        event = _event_buffer[-1]
        assert event["company_id"] == "c1"
        assert event["message"] == "test message"
        assert event["success"] is True
        assert event["normalized_intent"] == "general_query"

    def test_message_truncated_for_privacy(self):
        long_msg = "x" * 1000
        capture_query_event(
            company_id="c1",
            user_id="u1",
            conversation_id="conv1",
            message=long_msg,
            path="EXECUTIVE",
            agent_id="test",
            selected_tools=[],
            packs_used=[],
            success=True,
        )
        event = _event_buffer[-1]
        assert len(event["message"]) == 500
