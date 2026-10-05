"""Tests for structured answer-block builders (Executive/HR Agents).

These blocks are what the Executive Assistant UI renders as KPI cards,
tables, risk cards, etc. — instead of parsing raw Markdown out of prose.

Covers:
- build_answer_blocks: tool results -> count / table / risk / detail blocks
- ObjectId / internal-id redaction (never show Mongo ids unless asked)
- build_fast_fact_blocks: deterministic facts -> count / summary blocks
- make_answer_concise: filler stripped, raw ObjectIds removed
"""

from __future__ import annotations

from app.agents.answer_blocks import (
    build_answer_blocks,
    build_fast_fact_blocks,
    finalize_answer_text,
    record_display_row,
    user_asked_for_ids,
)
from app.agents.executive.agent import AgentLoopResult, ToolExecution


class _FakeExecution:
    def __init__(self, tool_name, result):
        self.tool_name = tool_name
        self.result = result


def _mk_agent_result(tool_executions, message="company health"):
    return AgentLoopResult(
        answer="ok",
        tool_executions=tool_executions,
        answer_blocks=build_answer_blocks(tool_executions, message=message),
    )


# ---------------------------------------------------------------------------
# Block type derivation
# ---------------------------------------------------------------------------

class TestBuildAnswerBlocks:
    def test_count_block_from_overdue_tasks(self):
        result = {"count": 8, "open": 2, "overdue": 8}
        blocks = build_answer_blocks([_FakeExecution("list_overdue_tasks", result)])
        assert blocks and blocks[0]["type"] == "count"
        assert blocks[0]["value"] == 8

    def test_risk_block_from_attention_items(self):
        result = {"items": [
            {"priority": "HIGH", "title": "Overdue tasks", "detail": "12 tasks past due", "recommended_action": "Reassign"},
            {"priority": "MEDIUM", "title": "Deadline approaching", "detail": "3 projects due this week"},
        ]}
        blocks = build_answer_blocks([_FakeExecution("get_company_attention_summary", result)])
        assert blocks and blocks[0]["type"] == "risk"
        items = blocks[0]["items"]
        assert items[0]["priority"] == "HIGH"
        assert items[1]["priority"] == "MEDIUM"
        assert items[0]["action"] == "Reassign"

    def test_table_block_from_workload(self):
        result = {"workload": [
            {"name": "Riya Jain", "total": 12, "overdue": 3},
            {"name": "Gaurav Sharma", "total": 7, "overdue": 0},
        ]}
        blocks = build_answer_blocks([_FakeExecution("get_team_workload", result)])
        assert blocks and blocks[0]["type"] == "table"
        assert blocks[0]["columns"] == ["Name", "Tasks", "Overdue"]
        assert blocks[0]["rows"] == [["Riya Jain", 12, 3], ["Gaurav Sharma", 7, 0]]

    def test_error_results_are_skipped(self):
        blocks = build_answer_blocks([_FakeExecution("list_overdue_tasks", {"error": "boom"})])
        assert blocks == []

    def test_deduplicates_same_title(self):
        execs = [
            _FakeExecution("list_overdue_tasks", {"count": 8}),
            _FakeExecution("get_overdue_tasks", {"count": 9}),
        ]
        blocks = build_answer_blocks(execs, max_blocks=4)
        assert len(blocks) <= 2

    def test_blocks_attached_to_agent_result(self):
        execs = [_FakeExecution("list_overdue_tasks", {"count": 8})]
        result = _mk_agent_result(execs)
        assert result.answer_blocks and result.answer_blocks[0]["value"] == 8


class TestObjectIdRedaction:
    def test_object_id_values_never_emitted_by_default(self):
        oid = "5f8f9a2b3c4d5e6f7a8b9c0d"
        result = {"employees": [
            {"name": "Riya Jain", "_id": oid, "user_id": oid, "email": "riya@syn.com"},
        ]}
        blocks = build_answer_blocks([_FakeExecution("search_employees", result)])
        assert blocks and blocks[0]["type"] == "table"
        # Internal ids are dropped; only human-readable fields survive.
        assert "Name" in blocks[0]["columns"]
        assert "_id" not in " ".join(blocks[0]["columns"]).lower()
        assert "User Id" not in blocks[0]["columns"]
        assert oid not in str(blocks)

    def test_object_id_shown_when_user_asks_for_ids(self):
        oid = "5f8f9a2b3c4d5e6f7a8b9c0d"
        assert user_asked_for_ids("give me the ids please")
        result = {"employees": [{"name": "Riya Jain", "_id": oid}]}
        blocks = build_answer_blocks(
            [_FakeExecution("search_employees", result)],
            message="give me the ids please",
        )
        assert blocks and blocks[0]["type"] == "table"
        assert oid in str(blocks)

    def test_record_display_row_drops_internal_ids(self):
        row = record_display_row(
            {"name": "Riya", "user_id": "abc123", "status": "active", "role": "Lead"},
            asked_for_ids=False,
        )
        labels = [label for label, _ in row]
        assert "Name" in labels and "Status" in labels
        assert "user_id" not in [label.lower() for label in labels]


class TestBuildFastFactBlocks:
    def test_single_numeric_fact_becomes_count(self):
        blocks = build_fast_fact_blocks([{"metric": "task.pending", "value": 8}])
        assert blocks and blocks[0]["type"] == "count"
        assert blocks[0]["value"] == 8

    def test_multiple_facts_become_summary_grid(self):
        blocks = build_fast_fact_blocks([
            {"metric": "sales.active_leads", "value": 15},
            {"metric": "sales.won_deals", "value": 4},
        ])
        assert blocks and blocks[0]["type"] == "summary"
        labels = [fact["label"] for fact in blocks[0]["facts"]]
        assert "Active Leads" in labels and "Won Deals" in labels

    def test_non_numeric_facts_are_skipped(self):
        blocks = build_fast_fact_blocks([{"metric": "employee.names", "value": ["A", "B"]}])
        assert blocks == []


class TestAnswerConcise:
    def test_filler_and_object_ids_removed(self):
        oid = "5f8f9a2b3c4d5e6f7a8b9c0d"
        text = f"There are 8 overdue tasks. {oid}\n\nLet me know if you have any other questions!"
        cleaned = finalize_answer_text(text)
        assert "8 overdue tasks" in cleaned
        assert oid not in cleaned
        assert "Let me know" not in cleaned

    def test_invented_role_sentence_stripped(self):
        text = "Gaurav is handling 5 tasks. Role: Team Lead, based on their task assignments."
        cleaned = finalize_answer_text(text)
        assert "Team Lead" not in cleaned
        assert "5 tasks" in cleaned
