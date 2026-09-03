"""
HR Dashboard canvas regression tests (unit).

Exercises the aggregation parsing + response contracts of every section
fetcher in ``hr_reporting_service`` by mocking the pymongo collection layer
(facet/aggregate outputs are canned to what MongoDB would produce for the
seeded rows), plus the canvas caching/concurrency behavior. No server needed.
"""
from __future__ import annotations

import pytest

from app.services import hr_reporting_service as service


class FakeAggregationCursor:
    def __init__(self, result):
        self._result = result

    async def to_list(self, length=None):
        return self._result


class FakeFindCursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def sort(self, *args, **kwargs):
        return self

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    async def to_list(self, length=None):
        return self._docs


class FakeCollection:
    """Minimal stand-in: aggregate/count_documents/find return canned results."""

    def __init__(self, aggregate_result=None, count_result=0, find_docs=None):
        self.aggregate_result = aggregate_result
        self.count_result = count_result
        self.find_docs = find_docs or []

    def aggregate(self, pipeline):
        return FakeAggregationCursor(self.aggregate_result)

    async def count_documents(self, filter):
        return self.count_result

    def find(self, filter, projection=None):
        return FakeFindCursor(self.find_docs)


def _patch_collection(monkeypatch, model, fake):
    monkeypatch.setattr(model, "get_pymongo_collection", lambda: fake)


# =============================================================================
# Section fetchers
# =============================================================================

def test_get_employee_summary_maps_facet_rows(monkeypatch):
    from app.models.employee_profile import EmployeeProfile

    fake = FakeCollection(aggregate_result=[{
        "total": [{"n": 4}],
        "by_status": [
            {"_id": "active", "count": 2},
            {"_id": "probation", "count": 1},
            {"_id": "exited", "count": 1},
        ],
        "by_dept": [
            {"_id": "dept-1", "count": 3},
            {"_id": "unassigned", "count": 1},
        ],
        "by_type": [
            {"_id": "full_time", "count": 3},
            {"_id": "contract", "count": 1},
        ],
    }])
    _patch_collection(monkeypatch, EmployeeProfile, fake)

    async def fake_dep_names(company_id, dept_ids):
        return {"dept-1": "Engineering"}

    monkeypatch.setattr(service, "_resolve_department_names", fake_dep_names)

    summary = _run(service.get_employee_summary("company-1"))

    assert summary["total"] == 4
    assert summary["active"] == 2
    assert summary["probation"] == 1
    assert summary["exited"] == 1
    assert summary["department_distribution"] == [
        {"department": "Engineering", "count": 3},
        {"department": "unassigned", "count": 1},
    ]
    assert summary["employment_type_distribution"] == [
        {"type": "full_time", "count": 3},
        {"type": "contract", "count": 1},
    ]


def test_get_attendance_today_summary_counts_statuses(monkeypatch):
    from app.models.attendance import Attendance
    from app.models.employee_profile import EmployeeProfile

    async def fake_business_date(company_id):
        from datetime import date
        return date(2026, 9, 3)

    monkeypatch.setattr(service, "_company_business_date", fake_business_date)
    _patch_collection(monkeypatch, EmployeeProfile, FakeCollection(aggregate_result=[{
        "_id": None,
        "ids": ["u-1", "u-2", "u-3"],
    }]))
    _patch_collection(monkeypatch, Attendance, FakeCollection(aggregate_result=[{
        "by_status": [
            {"_id": "present", "count": 1},
            {"_id": "absent", "count": 1},
        ],
        "recorded": [{"n": 2}],
    }]))

    summary = _run(service.get_attendance_today_summary("company-1"))

    assert summary["total_employees"] == 3
    assert summary["present"] == 1
    assert summary["absent"] == 1
    assert summary["no_record"] == 1
    assert summary["date"] is not None


def test_get_attendance_today_summary_no_active_employees(monkeypatch):
    from app.models.attendance import Attendance
    from app.models.employee_profile import EmployeeProfile

    async def fake_business_date(company_id):
        from datetime import date
        return date(2026, 9, 3)

    monkeypatch.setattr(service, "_company_business_date", fake_business_date)
    _patch_collection(monkeypatch, EmployeeProfile, FakeCollection(aggregate_result=[]))
    _patch_collection(monkeypatch, Attendance, FakeCollection(aggregate_result=[]))

    summary = _run(service.get_attendance_today_summary("company-1"))
    assert summary["total_employees"] == 0
    assert summary["no_record"] == 0


def test_get_leave_summary_maps_all_buckets(monkeypatch):
    from app.models.leave import LeaveRequest, LeaveTypeConfig

    async def fake_business_date(company_id):
        from datetime import date
        return date(2026, 9, 3)

    monkeypatch.setattr(service, "_company_business_date", fake_business_date)
    _patch_collection(monkeypatch, LeaveRequest, FakeCollection(aggregate_result=[{
        "pending": [{"n": 1}],
        "approved_month": [{"n": 1}],
        "rejected_month": [{"n": 1}],
        "on_leave_today": [{"n": 2}],
        "approved_by_type": [
            {"_id": {"ltid": "lt-1", "lt": None}, "units": 1.0},
            {"_id": {"ltid": None, "lt": "casual_leave"}, "units": 0.5},
            {"_id": {"ltid": None, "lt": None}, "units": 0.25},
        ],
    }]))
    _patch_collection(monkeypatch, LeaveTypeConfig, FakeCollection(find_docs=[
        {"_id": "lt-1", "name": "Sick Leave"},
    ]))

    summary = _run(service.get_leave_summary("company-1"))

    assert summary["pending_requests"] == 1
    assert summary["approved_this_month"] == 1
    assert summary["rejected_this_month"] == 1
    assert summary["on_leave_today"] == 2
    assert summary["leave_by_type"] == [
        {"type": "Sick Leave", "units": 1.0},
        {"type": "casual_leave", "units": 0.5},
        {"type": "Other", "units": 0.25},
    ]


def test_get_document_summary_buckets_by_expiry(monkeypatch):
    from app.models.hr_document import HRDocument

    _patch_collection(monkeypatch, HRDocument, FakeCollection(aggregate_result=[{
        "total": [{"n": 4}],
        "expired": [{"n": 1}],
        "expiring_soon": [{"n": 1}],
        "valid": [{"n": 1}],
    }]))

    summary = _run(service.get_document_summary("company-1"))
    assert summary == {"total_active": 4, "expired": 1, "expiring_soon": 1, "valid": 1}


def test_get_lifecycle_summary_maps_counts(monkeypatch):
    from app.models.employee_profile import EmployeeProfile
    from app.models.lifecycle import EmployeeSeparationRequest

    _patch_collection(monkeypatch, EmployeeProfile, FakeCollection(aggregate_result=[{
        "probation": [{"n": 1}],
        "confirmations_due": [{"n": 1}],
        "notice_period": [{"n": 0}],
        "onboarding": [{"n": 2}],
    }]))
    _patch_collection(monkeypatch, EmployeeSeparationRequest, FakeCollection(count_result=1))

    summary = _run(service.get_lifecycle_summary("company-1"))
    assert summary == {
        "probation_count": 1,
        "confirmations_due": 1,
        "notice_period_count": 0,
        "upcoming_joinings": 2,
        "upcoming_exits": 1,
    }


def test_get_recruitment_summary_uses_canonical_open_jobs(monkeypatch):
    from app.recruitment.models import RecruitmentJob, Candidate

    _patch_collection(monkeypatch, RecruitmentJob, FakeCollection(aggregate_result=[{
        "open": [{"n": 2}],
    }]))
    _patch_collection(monkeypatch, Candidate, FakeCollection(aggregate_result=[
        {"_id": "screening", "count": 1},
        {"_id": "interview_1", "count": 1},
        {"_id": "joined", "count": 1},
        {"_id": "new", "count": 2},
    ]))

    summary = _run(service.get_recruitment_summary("company-1"))
    assert summary == {
        "open_jobs": 2,
        "total_candidates": 5,
        "shortlisted": 1,
        "interviewing": 1,
        "offers_sent": 0,
        "hired": 1,
    }


def test_get_attention_items_builds_actionable_items(monkeypatch):
    from app.models.leave import LeaveRequest
    from app.models.attendance import AttendanceCorrectionRequest
    from app.models.hr_document import HRDocument
    from app.models.employee_profile import EmployeeProfile
    from app.models.payroll import PayrollPeriod, PayrollRecord

    _patch_collection(monkeypatch, LeaveRequest, FakeCollection(count_result=2))
    _patch_collection(monkeypatch, AttendanceCorrectionRequest, FakeCollection(count_result=1))
    _patch_collection(monkeypatch, HRDocument, FakeCollection(count_result=3))
    _patch_collection(monkeypatch, EmployeeProfile, FakeCollection(count_result=1))
    _patch_collection(monkeypatch, PayrollPeriod, FakeCollection(find_docs=[{"_id": "period-1"}]))
    _patch_collection(monkeypatch, PayrollRecord, FakeCollection(count_result=4))

    items = _run(service.get_attention_items("company-1"))
    by_type = {item["type"]: item for item in items}

    assert by_type["leave_pending"]["count"] == 2
    assert by_type["correction_pending"]["count"] == 1
    assert by_type["document_expiring"]["count"] == 3
    assert by_type["probation_due"]["count"] == 1
    assert by_type["payroll_blocked"]["count"] == 4
    assert by_type["payroll_blocked"]["severity"] == "critical"


# =============================================================================
# Canvas assembly + caching
# =============================================================================

def _run(coro):
    import asyncio
    return asyncio.run(coro)


@pytest.mark.asyncio
async def test_build_hr_dashboard_canvas_gathers_sections_and_caches(monkeypatch):
    store: dict = {}
    sets = {"count": 0}

    async def fake_get(key):
        return store.get(key)

    async def fake_set(key, value, ttl=300):
        store[key] = value
        sets["count"] += 1
        return True

    monkeypatch.setattr(service, "cache_get", fake_get)
    monkeypatch.setattr(service, "cache_set", fake_set)

    section_results = {
        "get_employee_summary": {"total": 4, "active": 2, "probation": 1, "notice_period": 0, "onboarding": 0, "exited": 1, "department_distribution": [], "employment_type_distribution": []},
        "get_attendance_today_summary": {"date": "2026-09-03", "total_employees": 3, "present": 1, "absent": 1, "on_leave": 0, "half_day": 0, "holiday": 0, "week_off": 0, "in_progress": 0, "no_record": 1},
        "get_leave_summary": {"pending_requests": 1, "approved_this_month": 1, "rejected_this_month": 1, "on_leave_today": 1, "leave_by_type": []},
        "get_document_summary": {"total_active": 4, "expired": 1, "expiring_soon": 1, "valid": 1},
        "get_lifecycle_summary": {"probation_count": 1, "confirmations_due": 1, "notice_period_count": 0, "upcoming_joinings": 0, "upcoming_exits": 1},
        "get_recruitment_summary": {"open_jobs": 1, "total_candidates": 3, "shortlisted": 1, "interviewing": 1, "offers_sent": 0, "hired": 1},
        "get_payroll_summary": {"latest_period_label": "2026-08", "latest_period_status": "calculated", "employee_count": 10, "total_earnings": 100, "total_deductions": 10, "total_net": 90, "currency": "INR", "processed_at": None},
        "get_attention_items": [{"type": "leave_pending", "label": "1 Leave Request Pending", "count": 1, "severity": "warning", "route": "/leaves"}],
    }

    for name in section_results:
        async def section(company_id, _name=name):
            return section_results[_name]
        monkeypatch.setattr(service, name, section)

    canvas = await service.build_hr_dashboard_canvas("company-1")

    assert canvas["employee_summary"]["total"] == 4
    assert canvas["attendance_today"]["present"] == 1
    assert canvas["attention_items"][0]["type"] == "leave_pending"
    assert sets["count"] == 1
    assert service._hr_canvas_cache_key("company-1") in store

    # Second call served from cache — no additional set.
    again = await service.build_hr_dashboard_canvas("company-1")
    assert again == canvas
    assert sets["count"] == 1


@pytest.mark.asyncio
async def test_build_hr_dashboard_canvas_failure_degrades_section_to_none(monkeypatch):
    store: dict = {}

    async def fake_get(key):
        return store.get(key)

    async def fake_set(key, value, ttl=300):
        store[key] = value
        return True

    monkeypatch.setattr(service, "cache_get", fake_get)
    monkeypatch.setattr(service, "cache_set", fake_set)

    async def ok(company_id):
        return {"total": 4}

    async def boom(company_id):
        raise RuntimeError("db down")

    monkeypatch.setattr(service, "get_employee_summary", ok)
    monkeypatch.setattr(service, "get_attendance_today_summary", boom)
    monkeypatch.setattr(service, "get_leave_summary", ok)
    monkeypatch.setattr(service, "get_document_summary", ok)
    monkeypatch.setattr(service, "get_lifecycle_summary", ok)
    monkeypatch.setattr(service, "get_recruitment_summary", ok)
    monkeypatch.setattr(service, "get_payroll_summary", ok)
    monkeypatch.setattr(service, "get_attention_items", ok)

    canvas = await service.build_hr_dashboard_canvas("company-1")

    assert canvas["employee_summary"] == {"total": 4}
    assert canvas["attendance_today"] is None
    assert canvas["attention_items"] == {"total": 4}


def test_hr_canvas_cache_key_is_company_scoped():
    assert service._hr_canvas_cache_key("company-1") == "dashboard:data:company-1:hr_canvas"
    assert service._hr_canvas_cache_key("company-2") != service._hr_canvas_cache_key("company-1")
    assert service._hr_canvas_cache_key("company-1").startswith("dashboard:data:company-1:")