from unittest.mock import AsyncMock, patch

import pytest


class StrictBeanieQuery:
    def __init__(self, result=None):
        self.result = result if result is not None else []
        self.sort_args = None
        self.skip_value = None
        self.limit_value = None

    def sort(self, *args):
        if len(args) != 1 or not isinstance(args[0], str):
            raise TypeError("Wrong argument type")
        self.sort_args = args
        return self

    def skip(self, value):
        self.skip_value = value
        return self

    def limit(self, value):
        self.limit_value = value
        return self

    async def to_list(self):
        return self.result

    async def count(self):
        return len(self.result)


@pytest.mark.asyncio
async def test_leave_types_use_supported_beanie_sort():
    from app.services.leave_service import active_leave_types

    query = StrictBeanieQuery()
    with patch("app.services.leave_service.ensure_default_leave_types", new_callable=AsyncMock), \
         patch("app.services.leave_service.LeaveTypeConfig.find", return_value=query):
        result = await active_leave_types("company-1")

    assert result == []
    assert query.sort_args == ("name",)


@pytest.mark.asyncio
async def test_holidays_use_supported_beanie_sort():
    from app.services.attendance_holiday_service import list_holidays

    query = StrictBeanieQuery()
    with patch("app.services.attendance_holiday_service.Holiday.find", return_value=query):
        result = await list_holidays("company-1")

    assert result == []
    assert query.sort_args == ("date",)


@pytest.mark.asyncio
async def test_hr_document_types_use_supported_beanie_sort():
    from app.services.hr_document_service import list_document_types

    query = StrictBeanieQuery()
    with patch("app.services.hr_document_service.HRDocumentType.find", return_value=query):
        result = await list_document_types("company-1")

    assert result == []
    assert query.sort_args == ("name",)


class FakeWriteCollection:
    def __init__(self):
        self.find_one_and_update_calls = []
        self.update_one_calls = []

    async def find_one_and_update(self, query, update, **kwargs):
        self.find_one_and_update_calls.append((query, update, kwargs))
        return {"_id": query.get("_id"), **(update.get("$set") or {})}

    async def update_one(self, query, update, **kwargs):
        self.update_one_calls.append((query, update, kwargs))

        class Result:
            modified_count = 1

        return Result()


@pytest.mark.asyncio
async def test_reconcile_balance_uses_beanie2_collection_accessor(monkeypatch):
    from app.services import leave_service

    balance = type("Balance", (), {
        "id": "507f1f77bcf86cd799439011",
        "version": 3,
    })()
    collection = FakeWriteCollection()

    monkeypatch.setattr(leave_service, "compute_used_pending", AsyncMock(return_value=(2.0, 1.0)))
    monkeypatch.setattr(leave_service, "_find_balance", AsyncMock(return_value=balance))
    monkeypatch.setattr(leave_service.LeaveBalance, "get_pymongo_collection", lambda: collection)

    await leave_service.reconcile_balance("company-1", "employee-1", "type-1")

    assert len(collection.find_one_and_update_calls) == 1
    query, update, kwargs = collection.find_one_and_update_calls[0]
    assert query == {"_id": balance.id, "version": 3}
    assert update["$set"]["used"] == 2.0
    assert update["$set"]["pending"] == 1.0
    assert update["$inc"] == {"version": 1}
    assert "return_document" in kwargs


@pytest.mark.asyncio
async def test_mark_leave_days_on_attendance_uses_beanie2_collection_accessor(monkeypatch):
    from datetime import datetime
    from app.services import leave_service

    collection = FakeWriteCollection()
    monkeypatch.setattr(leave_service.Attendance, "get_pymongo_collection", lambda: collection)

    await leave_service.mark_leave_days_on_attendance(
        "company-1",
        "employee-1",
        datetime(2026, 8, 15),
        datetime(2026, 8, 15),
        "paid_leave",
    )

    assert len(collection.update_one_calls) == 1
    query, update, kwargs = collection.update_one_calls[0]
    assert query["company_id"] == "company-1"
    assert query["employee_id"] == "employee-1"
    assert update["$set"]["leave_status"] == "paid_leave"
    assert kwargs["upsert"] is True


@pytest.mark.asyncio
async def test_leave_transition_uses_beanie2_collection_accessor(monkeypatch):
    from app.api.v1.endpoints import leaves
    from app.models.leave import LeaveStatus

    collection = FakeWriteCollection()
    refreshed = object()
    monkeypatch.setattr(leaves.LeaveRequest, "get_pymongo_collection", lambda: collection)
    monkeypatch.setattr(leaves.LeaveRequest, "get", AsyncMock(return_value=refreshed))

    result = await leaves._claim_leave(
        "507f1f77bcf86cd799439011",
        [LeaveStatus.PENDING],
        {"status": LeaveStatus.APPROVED},
        history_action="approved",
        actor_id="admin-1",
    )

    assert result is refreshed
    assert len(collection.update_one_calls) == 1
    query, update, _ = collection.update_one_calls[0]
    assert query["status"] == {"$in": [LeaveStatus.PENDING.value]}
    assert update["$set"]["status"] == LeaveStatus.APPROVED.value
    assert "$push" in update


def test_scoped_hrms_sources_do_not_use_legacy_model_collection():
    from pathlib import Path

    root = Path(__file__).resolve().parents[2] / "app"
    scoped_files = [
        root / "services" / "leave_service.py",
        root / "services" / "salary_component_service.py",
        root / "services" / "salary_structure_service.py",
        root / "services" / "hr_document_service.py",
        root / "services" / "ess_service.py",
        root / "services" / "attendance_holiday_service.py",
        root / "api" / "v1" / "endpoints" / "leaves.py",
        root / "api" / "v1" / "endpoints" / "salary.py",
        root / "api" / "v1" / "endpoints" / "hr_documents.py",
        root / "api" / "v1" / "endpoints" / "ess.py",
    ]
    offenders = []
    for path in scoped_files:
        text = path.read_text(encoding="utf-8")
        if ".collection" in text:
            offenders.append(str(path))

    assert offenders == []
