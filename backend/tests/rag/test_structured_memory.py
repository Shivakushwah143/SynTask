from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

import pytest

from app.models.user import UserRole
from app.rag.structured_memory import StructuredMemoryRequest, StructuredMemoryService, StructuredRecordType


def user(*, user_id="u1", company_id="c1", role=UserRole.ADMIN, modules=None):
    return SimpleNamespace(id=user_id, company_id=company_id, role=role, modules=modules if modules is not None else ["task", "sales"])


def record(**kwargs):
    defaults = {"id": "r1", "company_id": "c1", "deleted": False, "updated_at": datetime(2026, 7, 20), "created_by": "u1"}
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def async_record(value):
    async def _load(**_):
        return value

    return _load


@pytest.mark.asyncio
async def test_client_supplied_tenant_identity_is_ignored_and_cross_tenant_read_forbidden(monkeypatch):
    service = StructuredMemoryService()
    monkeypatch.setattr(service, "_load_record", async_record(record(company_id="evil")))

    result = await service.read(
        current_user=user(company_id="c1"),
        request=StructuredMemoryRequest(record_type=StructuredRecordType.CONTACT, record_id="contact-1", query="tenant_id=evil"),
    )

    assert result.status == "forbidden"
    assert result.tenant_scope["company_id"] == "c1"


@pytest.mark.asyncio
async def test_missing_server_scope_fails_closed():
    service = StructuredMemoryService()

    result = await service.read(
        current_user=user(company_id=None, role=UserRole.EMPLOYEE),
        request=StructuredMemoryRequest(record_type=StructuredRecordType.CURRENT_USER),
    )

    assert result.status == "forbidden"
    assert result.error == "missing_server_scope"


@pytest.mark.asyncio
async def test_crm_module_permission_enforced(monkeypatch):
    service = StructuredMemoryService()
    monkeypatch.setattr(service, "_load_record", async_record(record(id="lead-1", assigned_to="u1")))

    result = await service.read(
        current_user=user(role=UserRole.EMPLOYEE, modules=["task"]),
        request=StructuredMemoryRequest(record_type=StructuredRecordType.LEAD, record_id="lead-1"),
    )

    assert result.status == "forbidden"


@pytest.mark.asyncio
async def test_project_membership_rules_enforced(monkeypatch):
    service = StructuredMemoryService()
    monkeypatch.setattr(service, "_load_record", async_record(record(id="p1", lead_id="other", assigned_to="other", created_by="other", team_member_ids=[], assigned_user_ids=[])))

    result = await service.read(
        current_user=user(role=UserRole.EMPLOYEE),
        request=StructuredMemoryRequest(record_type=StructuredRecordType.PROJECT, record_id="p1"),
    )

    assert result.status == "forbidden"


@pytest.mark.asyncio
async def test_authorized_fields_are_minimized_and_sensitive_fields_excluded(monkeypatch):
    service = StructuredMemoryService()
    monkeypatch.setattr(
        service,
        "_load_record",
        async_record(record(id="m1", title="Planning", zoom_password="secret", zoom_start_url="secret", host_id="u1", participant_ids=["u2"], meeting_date=datetime(2026, 7, 24), meeting_time="10:00")),
    )

    result = await service.read(
        current_user=user(role=UserRole.EMPLOYEE),
        request=StructuredMemoryRequest(record_type=StructuredRecordType.MEETING, record_id="m1", requested_fields=["title", "zoom_password", "zoom_start_url"]),
    )

    assert result.status == "available"
    assert result.fields == {"title": "Planning"}


@pytest.mark.asyncio
async def test_structured_read_failure_is_unavailable_not_inferred(monkeypatch):
    service = StructuredMemoryService()

    async def fail(**_):
        raise RuntimeError("db down")

    monkeypatch.setattr(service, "_load_record", fail)

    result = await service.read(
        current_user=user(),
        request=StructuredMemoryRequest(record_type=StructuredRecordType.TASK, record_id="task-1"),
    )

    assert result.status == "unavailable"
    assert result.fields == {}
    assert result.error == "RuntimeError"
