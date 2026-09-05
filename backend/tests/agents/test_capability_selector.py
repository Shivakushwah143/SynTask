"""Tests for the dynamic capability selector and step budget heuristics."""
from __future__ import annotations

import pytest

from app.agents.capability_selector import (
    CAPABILITY_PACKS,
    select_tools,
    is_cross_domain,
    _score_packs,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

ALL_TOOL_SCHEMAS = [
    {"type": "function", "function": {"name": name, "description": f"Tool {name}", "parameters": {}}}
    for pack_tools in CAPABILITY_PACKS.values()
    for name in pack_tools
]


# ---------------------------------------------------------------------------
# select_tools tests
# ---------------------------------------------------------------------------

class TestSelectTools:
    def test_returns_minimum_tools_for_empty_message(self):
        selected, packs = select_tools("", ALL_TOOL_SCHEMAS, min_tools=2, max_tools=6)
        assert len(selected) >= 2
        assert len(selected) <= 6
        assert len(packs) > 0

    def test_employee_query_selects_hr_employee_tools(self):
        selected, packs = select_tools(
            "How many employees do we have?", ALL_TOOL_SCHEMAS, min_tools=2, max_tools=6,
        )
        names = [s["function"]["name"] for s in selected]
        assert any(n in names for n in ("get_company_summary", "search_employees", "get_employee_360"))

    def test_client_query_selects_client_tools(self):
        selected, packs = select_tools(
            "Tell me about our clients", ALL_TOOL_SCHEMAS, min_tools=2, max_tools=6,
        )
        names = [s["function"]["name"] for s in selected]
        assert any(n in names for n in ("search_clients", "get_client_360", "get_client_risks"))

    def test_sales_query_selects_sales_tools(self):
        selected, packs = select_tools(
            "What's our sales pipeline looking like?", ALL_TOOL_SCHEMAS, min_tools=2, max_tools=6,
        )
        names = [s["function"]["name"] for s in selected]
        assert any(n in names for n in ("get_sales_summary", "get_followup_risks", "get_lead_360"))

    def test_finance_query_selects_finance_tools(self):
        selected, packs = select_tools(
            "Show me overdue invoices", ALL_TOOL_SCHEMAS, min_tools=2, max_tools=6,
        )
        names = [s["function"]["name"] for s in selected]
        assert any(n in names for n in ("get_finance_summary", "get_overdue_invoices"))

    def test_project_query_selects_project_tools(self):
        selected, packs = select_tools(
            "What's the status of our projects?", ALL_TOOL_SCHEMAS, min_tools=2, max_tools=6,
        )
        names = [s["function"]["name"] for s in selected]
        assert any(n in names for n in ("search_projects", "get_project_360", "get_project_risks"))

    def test_meeting_query_selects_meeting_tools(self):
        selected, packs = select_tools(
            "Any upcoming meetings today?", ALL_TOOL_SCHEMAS, min_tools=2, max_tools=6,
        )
        names = [s["function"]["name"] for s in selected]
        assert any(n in names for n in ("get_meeting_summary", "get_pending_meeting_followups"))

    def test_payroll_query_selects_payroll_tools(self):
        """Payroll query should select payroll/salary tools, not recruitment."""
        selected, packs = select_tools(
            "What's Rahul's salary?", ALL_TOOL_SCHEMAS, min_tools=2, max_tools=6,
        )
        names = [s["function"]["name"] for s in selected]
        # Should have payroll tools
        assert any(n in names for n in ("get_employee_salary", "get_payroll_status"))
        # Should NOT have recruitment tools (fine-grained selection)
        assert not any(n in names for n in ("search_candidates", "get_candidate_360", "search_jobs"))

    def test_recruitment_query_selects_recruitment_tools(self):
        """Recruitment query should select candidate/job tools, not payroll."""
        selected, packs = select_tools(
            "Show me the recruitment pipeline", ALL_TOOL_SCHEMAS, min_tools=2, max_tools=6,
        )
        names = [s["function"]["name"] for s in selected]
        assert any(n in names for n in ("get_recruitment_overview", "search_candidates", "search_jobs"))
        # Should NOT have payroll tools
        assert not any(n in names for n in ("get_employee_salary", "get_payroll_status"))

    def test_attendance_query_selects_attendance_tools(self):
        """Attendance query should select attendance/leave tools."""
        selected, packs = select_tools(
            "Show me attendance records", ALL_TOOL_SCHEMAS, min_tools=2, max_tools=6,
        )
        names = [s["function"]["name"] for s in selected]
        assert any(n in names for n in ("get_employee_attendance", "get_employee_leave"))

    def test_entity_context_boosts_hr(self):
        """When user is viewing an employee page, HR tools should be boosted."""
        entity_ctx = {"selected_employee_id": "emp123", "selected_employee_name": "Rahul"}
        selected, packs = select_tools(
            "Tell me about this person", ALL_TOOL_SCHEMAS,
            entity_context=entity_ctx, min_tools=2, max_tools=6,
        )
        names = [s["function"]["name"] for s in selected]
        assert any(n in names for n in ("search_employees", "get_employee_360", "get_hr_attention_summary"))

    def test_entity_context_boosts_recruitment(self):
        """When user is viewing a candidate page, recruitment tools should be boosted."""
        entity_ctx = {"selected_candidate_id": "cand123"}
        selected, packs = select_tools(
            "Tell me about this candidate", ALL_TOOL_SCHEMAS,
            entity_context=entity_ctx, min_tools=2, max_tools=6,
        )
        names = [s["function"]["name"] for s in selected]
        assert any(n in names for n in ("search_candidates", "get_candidate_360", "get_recruitment_overview"))

    def test_max_tools_respected(self):
        selected, _ = select_tools(
            "everything about the company", ALL_TOOL_SCHEMAS, min_tools=2, max_tools=3,
        )
        assert len(selected) <= 3

    def test_min_tools_guaranteed(self):
        selected, _ = select_tools(
            "x", ALL_TOOL_SCHEMAS, min_tools=4, max_tools=6,
        )
        assert len(selected) >= 4


# ---------------------------------------------------------------------------
# is_cross_domain tests
# ---------------------------------------------------------------------------

class TestCrossDomain:
    def test_single_domain_not_cross(self):
        assert not is_cross_domain("How many employees do we have?")

    def test_multi_domain_is_cross(self):
        assert is_cross_domain("Why are our clients at risk and how are the projects delayed?")

    def test_empty_not_cross(self):
        assert not is_cross_domain("")

    def test_entity_context_affects_cross_domain(self):
        """With entity context, fewer keyword hits may still be cross-domain."""
        entity_ctx = {"selected_employee_id": "emp123"}
        result = is_cross_domain("What's their workload?", entity_ctx)
        assert isinstance(result, bool)


# ---------------------------------------------------------------------------
# _score_packs tests
# ---------------------------------------------------------------------------

class TestScorePacks:
    def test_employee_message_scores_hr_employees(self):
        scores = _score_packs("How many employees are there?")
        assert scores.get("hr_employees", 0) > 0

    def test_finance_message_scores_finance(self):
        scores = _score_packs("Show me overdue invoices")
        assert scores.get("finance", 0) > 0

    def test_empty_message_all_zero(self):
        scores = _score_packs("")
        assert all(v == 0 for v in scores.values())

    def test_payroll_message_scores_hr_payroll(self):
        scores = _score_packs("What's Rahul's salary?")
        assert scores.get("hr_payroll", 0) > 0
        # Should NOT score recruitment
        assert scores.get("hr_recruitment", 0) == 0

    def test_entity_context_adds_boost(self):
        entity_ctx = {"selected_employee_id": "emp123"}
        scores = _score_packs("What's their workload?", entity_ctx)
        # Entity context should boost hr_employees
        assert scores.get("hr_employees", 0) > 0
