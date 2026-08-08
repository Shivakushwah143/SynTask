"""Tests for CRMPipelineService.delete_lead.

Covers: permission gating (admin vs. owning employee vs. stranger), company
isolation, cascade cleanup of every lead-scoped record (history, deals,
proposals, documents, notes, files, activities, tasks), the soft-delete of the
lead itself, and idempotent 404s for missing/already-deleted leads.
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.crm.pipeline import CRMPipelineService
from app.models.user import UserRole


def _user(role: UserRole, user_id: str = "user-1", company_id: str = "company-1"):
    return SimpleNamespace(
        id=user_id,
        role=role,
        company_id=company_id,
        first_name="Test",
        last_name="User",
    )


class FakeProspect:
    """Lightweight stand-in for a SalesProspect document."""

    def __init__(self, *, company_id="company-1", assigned_to="user-1", assigned_by=None, deleted=False):
        self.id = "lead-1"
        self.company_id = company_id
        self.assigned_to = assigned_to
        self.assigned_by = assigned_by
        self.deleted = deleted
        self.prospect_name = "Alpha Co"
        self.updated_at = None
        self.saved = None

    async def save(self):
        self.saved = True


def _prospect(*, company_id="company-1", assigned_to="user-1", assigned_by=None, deleted=False):
    return FakeProspect(
        company_id=company_id,
        assigned_to=assigned_to,
        assigned_by=assigned_by,
        deleted=deleted,
    )


class FakeDeleteResult:
    """Mimics the return of a beanie find(...).delete() call (deleted count)."""

    def __init__(self, count):
        self._count = count

    async def delete(self):
        return self._count


class FakeLeadQuery:
    def __init__(self, count):
        self._count = count

    def __call__(self, *args, **kwargs):
        return self

    async def delete(self):
        return self._count


class FakeTaskQuery(FakeLeadQuery):
    """Task uses a lazy import; identical shape but named for clarity."""


class FakeProspectGetter:
    """Async stand-in for SalesProspect.get(lead_id)."""

    def __init__(self, prospect):
        self._prospect = prospect

    async def get(self, lead_id):
        return self._prospect


def _stub_cascade(monkeypatch, *, history=2, deals=1, proposals=1, documents=1, notes=3, files=2, activities=4, tasks=1):
    """Patch every collection find() to return a fake delete count."""
    monkeypatch.setattr(
        "app.crm.pipeline.SalesPipelineHistory.find",
        FakeLeadQuery(history),
    )
    monkeypatch.setattr("app.crm.pipeline.CRMDeal.find", FakeLeadQuery(deals))
    monkeypatch.setattr("app.crm.pipeline.CRMProposal.find", FakeLeadQuery(proposals))
    monkeypatch.setattr("app.crm.pipeline.CRMDocument.find", FakeLeadQuery(documents))
    monkeypatch.setattr("app.crm.pipeline.SalesLeadNote.find", FakeLeadQuery(notes))
    monkeypatch.setattr("app.crm.pipeline.SalesLeadFile.find", FakeLeadQuery(files))
    monkeypatch.setattr("app.crm.pipeline.CRMActivity.find", FakeLeadQuery(activities))


@pytest.mark.asyncio
async def test_delete_lead_admin_cascades_and_soft_deletes(monkeypatch):
    """An admin can delete a lead; all child records are removed and the lead is soft-deleted."""
    prospect = _prospect()

    class FakeProspectModel:
        @staticmethod
        async def get(lead_id):
            return prospect

    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", FakeProspectModel.get)
    _stub_cascade(monkeypatch)
    monkeypatch.setattr(
        "app.models.task.Task",
        SimpleNamespace(find=FakeTaskQuery(1)),
    )
    monkeypatch.setattr(
        "app.models.ownership_transfer.OwnershipTransfer",
        SimpleNamespace(find=FakeTaskQuery(2)),
    )

    result = await CRMPipelineService.delete_lead(_user(UserRole.ADMIN), "lead-1")

    assert result["message"] == "Lead deleted permanently"
    assert result["deleted_lead_id"] == "lead-1"
    assert result["deleted"] == {
        "history": 2,
        "deals": 1,
        "proposals": 1,
        "documents": 1,
        "notes": 3,
        "files": 2,
        "activities": 4,
        "tasks": 1,
        "ownership_transfers": 2,
    }
    assert prospect.deleted is True
    assert prospect.saved is True


@pytest.mark.asyncio
async def test_delete_lead_owning_employee_allowed(monkeypatch):
    """An employee who owns the lead (assigned_to) may delete it — same rule as other lead writes."""
    prospect = _prospect(assigned_to="employee-9")
    monkeypatch.setattr(
        "app.crm.pipeline.SalesProspect.get",
        FakeProspectGetter(prospect).get,
    )
    _stub_cascade(monkeypatch)
    monkeypatch.setattr("app.models.task.Task", SimpleNamespace(find=FakeTaskQuery(0)))
    monkeypatch.setattr(
        "app.models.ownership_transfer.OwnershipTransfer",
        SimpleNamespace(find=FakeTaskQuery(0)),
    )

    result = await CRMPipelineService.delete_lead(
        _user(UserRole.EMPLOYEE, user_id="employee-9"),
        "lead-1",
    )
    assert result["message"] == "Lead deleted permanently"


@pytest.mark.asyncio
async def test_delete_lead_unrelated_employee_forbidden(monkeypatch):
    """An employee who is not the owner/assigner gets 403 and nothing is deleted."""
    prospect = _prospect(assigned_to="someone-else")
    monkeypatch.setattr(
        "app.crm.pipeline.SalesProspect.get",
        FakeProspectGetter(prospect).get,
    )

    with pytest.raises(HTTPException) as excinfo:
        await CRMPipelineService.delete_lead(
            _user(UserRole.EMPLOYEE, user_id="employee-9"),
            "lead-1",
        )
    assert excinfo.value.status_code == 403


@pytest.mark.asyncio
async def test_delete_lead_cross_company_forbidden(monkeypatch):
    """A lead from another company must never be deletable (403 for non-super-admins)."""
    prospect = _prospect(company_id="company-other")
    monkeypatch.setattr(
        "app.crm.pipeline.SalesProspect.get",
        FakeProspectGetter(prospect).get,
    )

    with pytest.raises(HTTPException) as excinfo:
        await CRMPipelineService.delete_lead(_user(UserRole.MANAGER), "lead-1")
    assert excinfo.value.status_code == 403


@pytest.mark.asyncio
async def test_delete_lead_super_admin_cross_company_allowed(monkeypatch):
    """Super admins keep their cross-company access for lead deletion."""
    prospect = _prospect(company_id="company-other")
    monkeypatch.setattr(
        "app.crm.pipeline.SalesProspect.get",
        FakeProspectGetter(prospect).get,
    )
    _stub_cascade(monkeypatch)
    monkeypatch.setattr("app.models.task.Task", SimpleNamespace(find=FakeTaskQuery(0)))
    monkeypatch.setattr(
        "app.models.ownership_transfer.OwnershipTransfer",
        SimpleNamespace(find=FakeTaskQuery(0)),
    )

    result = await CRMPipelineService.delete_lead(
        _user(UserRole.SUPER_ADMIN),
        "lead-1",
    )
    assert result["message"] == "Lead deleted permanently"


@pytest.mark.asyncio
async def test_delete_lead_missing_lead_404(monkeypatch):
    """Deleting a nonexistent lead returns 404 (idempotent second delete)."""
    monkeypatch.setattr(
        "app.crm.pipeline.SalesProspect.get",
        FakeProspectGetter(None).get,
    )

    with pytest.raises(HTTPException) as excinfo:
        await CRMPipelineService.delete_lead(_user(UserRole.ADMIN), "lead-missing")
    assert excinfo.value.status_code == 404
    assert excinfo.value.detail == "Lead not found"


@pytest.mark.asyncio
async def test_delete_lead_already_deleted_404(monkeypatch):
    """A second delete on a soft-deleted lead behaves exactly like a missing one (404)."""
    prospect = _prospect(deleted=True)
    monkeypatch.setattr(
        "app.crm.pipeline.SalesProspect.get",
        FakeProspectGetter(prospect).get,
    )

    with pytest.raises(HTTPException) as excinfo:
        await CRMPipelineService.delete_lead(_user(UserRole.ADMIN), "lead-1")
    assert excinfo.value.status_code == 404
