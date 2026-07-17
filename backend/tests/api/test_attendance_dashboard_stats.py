from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import attendance as attendance_api
from app.models.attendance import AttendanceStatus
from app.models.user import UserRole


class FakeQuery:
    def __init__(self, *, count_value=0, list_value=None, fail=None):
        self.count_value = count_value
        self.list_value = list_value or []
        self.fail = fail

    async def count(self):
        if self.fail:
            raise self.fail
        return self.count_value

    async def to_list(self):
        if self.fail:
            raise self.fail
        return self.list_value


class FakeAttendanceCollection:
    def __init__(self):
        self.queries = []

    async def count_documents(self, query):
        self.queries.append(query)
        if query.get("status") == AttendanceStatus.WORKING.value:
            return 1
        if query.get("status") == AttendanceStatus.ON_BREAK.value:
            return 1
        if query.get("is_late") is True:
            return 1
        return 3


@pytest.mark.asyncio
async def test_dashboard_stats_returns_safe_defaults_without_company():
    current_user = SimpleNamespace(id="u1", role=UserRole.ADMIN, company_id=None)

    result = await attendance_api.get_dashboard_statistics(current_user)

    assert result == {
        "success": True,
        "data": {
            "total_employees": 0,
            "present_today": 0,
            "working_now": 0,
            "on_break": 0,
            "offline": 0,
            "late_today": 0,
        },
    }


@pytest.mark.asyncio
async def test_dashboard_stats_uses_raw_filters_and_counts_today(monkeypatch):
    seen = {"user_query": None, "attendance_query": None}
    collection = FakeAttendanceCollection()

    class FakeUserModel:
        @staticmethod
        def find(query):
            seen["user_query"] = query
            return FakeQuery(count_value=5)

    class FakeAttendanceModel:
        @staticmethod
        def get_pymongo_collection():
            return collection

    monkeypatch.setattr(attendance_api, "User", FakeUserModel)
    monkeypatch.setattr(attendance_api, "Attendance", FakeAttendanceModel)

    current_user = SimpleNamespace(id="admin-1", role=UserRole.ADMIN, company_id="company-1")
    result = await attendance_api.get_dashboard_statistics(current_user)

    assert seen["user_query"] == {"role": UserRole.EMPLOYEE.value, "company_id": "company-1"}
    assert collection.queries[0]["company_id"] == "company-1"
    assert result["data"] == {
        "total_employees": 5,
        "present_today": 3,
        "working_now": 1,
        "on_break": 1,
        "offline": 3,
        "late_today": 1,
    }
    assert collection.queries[1]["status"] == AttendanceStatus.WORKING.value
    assert collection.queries[2]["status"] == AttendanceStatus.ON_BREAK.value
    assert collection.queries[3]["is_late"] is True


@pytest.mark.asyncio
async def test_dashboard_stats_returns_503_when_employee_count_fails(monkeypatch):
    class FakeUserModel:
        @staticmethod
        def find(query):
            return FakeQuery(fail=RuntimeError("database offline"))

    monkeypatch.setattr(attendance_api, "User", FakeUserModel)

    current_user = SimpleNamespace(id="admin-1", role=UserRole.ADMIN, company_id="company-1")

    with pytest.raises(HTTPException) as exc:
        await attendance_api.get_dashboard_statistics(current_user)

    assert exc.value.status_code == 503
    assert "employee count" in exc.value.detail
