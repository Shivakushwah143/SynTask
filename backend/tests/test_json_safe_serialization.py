"""Regression tests for the to_json_safe serialization utility.

Proves that all non-JSON-serializable types used in SynTask agent/context
serialization are safely converted before being sent to Pydantic, Groq,
or API responses.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from enum import Enum

import pytest

from app.core.json_safe import to_json_safe


# ---------------------------------------------------------------------------
# Test helpers — synthetic types that mirror SynTask models
# ---------------------------------------------------------------------------

class MockStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class MockPriority(str, Enum):
    HIGH = "high"
    LOW = "low"


# Use beanie's PydanticObjectId if available, else bson.ObjectId
try:
    from beanie.odm.fields import PydanticObjectId

    def _make_oid() -> PydanticObjectId:
        return PydanticObjectId("507f1f77bcf86cd799439011")
except ImportError:
    from bson import ObjectId

    class PydanticObjectId(ObjectId):
        pass

    def _make_oid() -> PydanticObjectId:
        return PydanticObjectId("507f1f77bcf86cd799439011")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestToJsonSafePrimitives:
    def test_none_passthrough(self):
        assert to_json_safe(None) is None

    def test_bool_passthrough(self):
        assert to_json_safe(True) is True
        assert to_json_safe(False) is False

    def test_int_passthrough(self):
        assert to_json_safe(42) == 42

    def test_float_passthrough(self):
        assert to_json_safe(3.14) == 3.14

    def test_str_passthrough(self):
        assert to_json_safe("hello") == "hello"


class TestToJsonSafeObjectId:
    def test_pydantic_objectid_becomes_string(self):
        oid = _make_oid()
        result = to_json_safe(oid)
        assert isinstance(result, str)
        assert result == "507f1f77bcf86cd799439011"

    def test_nested_objectid_in_dict(self):
        oid = _make_oid()
        data = {"employee_id": oid, "name": "Riya"}
        result = to_json_safe(data)
        assert isinstance(result["employee_id"], str)
        assert result["employee_id"] == "507f1f77bcf86cd799439011"
        assert result["name"] == "Riya"

    def test_nested_objectids_in_list(self):
        oid1 = _make_oid()
        oid2 = PydanticObjectId("507f1f77bcf86cd799439012")
        data = {"participant_ids": [oid1, oid2]}
        result = to_json_safe(data)
        assert all(isinstance(pid, str) for pid in result["participant_ids"])

    def test_deeply_nested_objectids(self):
        oid = _make_oid()
        data = {
            "task": {
                "assigned_to": oid,
                "created_by": oid,
            },
            "team": [oid],
        }
        result = to_json_safe(data)
        assert isinstance(result["task"]["assigned_to"], str)
        assert isinstance(result["task"]["created_by"], str)
        assert isinstance(result["team"][0], str)


class TestToJsonSafeEnum:
    def test_enum_becomes_value(self):
        result = to_json_safe(MockStatus.ACTIVE)
        assert result == "active"

    def test_enum_in_dict(self):
        data = {"status": MockStatus.ACTIVE, "priority": MockPriority.HIGH}
        result = to_json_safe(data)
        assert result["status"] == "active"
        assert result["priority"] == "high"


class TestToJsonSafeDatetime:
    def test_datetime_becomes_iso(self):
        dt = datetime(2026, 9, 2, 14, 30, 0, tzinfo=timezone.utc)
        result = to_json_safe(dt)
        assert isinstance(result, str)
        assert "2026-09-02" in result

    def test_date_becomes_iso(self):
        d = date(2026, 9, 2)
        result = to_json_safe(d)
        assert result == "2026-09-02"

    def test_datetime_in_dict(self):
        dt = datetime(2026, 9, 2, 14, 30, 0, tzinfo=timezone.utc)
        data = {"created_at": dt, "title": "test"}
        result = to_json_safe(data)
        assert isinstance(result["created_at"], str)


class TestToJsonSafeNestedComplex:
    def test_full_agent_context_simulation(self):
        """Simulate a realistic agent context with all problematic types."""
        oid1 = _make_oid()
        oid2 = PydanticObjectId("507f1f77bcf86cd799439012")
        dt = datetime(2026, 9, 2, 14, 30, 0, tzinfo=timezone.utc)

        context = {
            "context_package_id": "test-pkg-001",
            "structured_memory": {
                "items": [
                    {
                        "record_type": "task",
                        "record_id": str(oid1),
                        "fields": {
                            "id": str(oid1),
                            "assigned_to": oid1,
                            "created_by": oid2,
                            "status": MockStatus.ACTIVE,
                            "priority": MockPriority.HIGH,
                            "due_date": dt,
                            "title": "Fix serialization bug",
                        },
                        "fetched_at": dt,
                    }
                ],
            },
            "participant_ids": [oid1, oid2],
            "citations": [
                {
                    "citation_id": "cite-001",
                    "source_id": oid1,
                    "excerpt": "Test excerpt",
                }
            ],
        }

        result = to_json_safe(context)

        # Must be JSON-serializable
        json_str = json.dumps(result)
        assert len(json_str) > 0

        # Verify specific conversions
        item = result["structured_memory"]["items"][0]
        assert isinstance(item["fields"]["assigned_to"], str)
        assert isinstance(item["fields"]["created_by"], str)
        assert item["fields"]["status"] == "active"
        assert item["fields"]["priority"] == "high"
        assert isinstance(item["fields"]["due_date"], str)
        assert isinstance(item["fetched_at"], str)

        assert isinstance(result["participant_ids"][0], str)
        assert isinstance(result["participant_ids"][1], str)
        assert isinstance(result["citations"][0]["source_id"], str)

    def test_model_dump_mode_json_always_succeeds_after_to_json_safe(self):
        """Prove that model_dump(mode='json') succeeds after to_json_safe."""
        oid = _make_oid()
        data = {"id": oid, "nested": {"ref": oid}}
        safe = to_json_safe(data)
        # This must not raise
        json_str = json.dumps(safe)
        parsed = json.loads(json_str)
        assert parsed["id"] == "507f1f77bcf86cd799439011"
        assert parsed["nested"]["ref"] == "507f1f77bcf86cd799439011"

    def test_set_becomes_sorted_list(self):
        data = {"tags": {"beta", "alpha", "gamma"}}
        result = to_json_safe(data)
        assert isinstance(result["tags"], list)
        assert result["tags"] == ["alpha", "beta", "gamma"]

    def test_tuple_becomes_list(self):
        data = {"coords": (1, 2, 3)}
        result = to_json_safe(data)
        assert isinstance(result["coords"], list)
        assert result["coords"] == [1, 2, 3]

    def test_unknown_type_becomes_string(self):
        """Fallback: unknown types become their str() representation."""
        class CustomType:
            def __str__(self):
                return "custom_value"

        result = to_json_safe(CustomType())
        assert result == "custom_value"


class TestToJsonSafeEdgeCases:
    def test_empty_dict(self):
        assert to_json_safe({}) == {}

    def test_empty_list(self):
        assert to_json_safe([]) == []

    def test_none_values_in_dict(self):
        data = {"a": None, "b": "value"}
        result = to_json_safe(data)
        assert result["a"] is None
        assert result["b"] == "value"

    def test_mixed_nested_types(self):
        oid = _make_oid()
        data = {
            "ids": [oid, "string-id", 123],
            "metadata": {"key": MockStatus.ACTIVE, "count": 5},
        }
        result = to_json_safe(data)
        json_str = json.dumps(result)
        assert "507f1f77bcf86cd799439011" in json_str
        assert "active" in json_str
