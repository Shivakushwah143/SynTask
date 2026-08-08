"""Tests for CRMPipelineService.delete_lead / restore_lead / bulk_delete_leads.

Covers: permission gating (admin vs. owning employee vs. stranger), company
isolation, cascade cleanup of every lead-scoped record (history, deals,
proposals, documents, notes, files, activities, tasks), the hard-delete of the
lead itself, restore-from-archive (Undo), bulk delete, and idempotent 404s for
missing/already-deleted leads.
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

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
        self.deleted_doc = None

    async def delete(self):
        self.deleted_doc = True


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
    assert prospect.deleted_doc is True


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


@pytest.mark.asyncio
async def test_delete_lead_snapshot_failure_still_deletes(monkeypatch):
    """A snapshot/archive failure must never block the deletion (restore_token=None)."""
    prospect = _prospect()
    monkeypatch.setattr(
        "app.crm.pipeline.SalesProspect.get",
        FakeProspectGetter(prospect).get,
    )

    async def boom(*args, **kwargs):
        raise RuntimeError("archive unavailable")

    monkeypatch.setattr("app.crm.pipeline._archive_lead_snapshot", boom)
    _stub_cascade(monkeypatch)
    monkeypatch.setattr("app.models.task.Task", SimpleNamespace(find=FakeTaskQuery(0)))
    monkeypatch.setattr(
        "app.models.ownership_transfer.OwnershipTransfer",
        SimpleNamespace(find=FakeTaskQuery(0)),
    )

    result = await CRMPipelineService.delete_lead(_user(UserRole.ADMIN), "lead-1")
    assert result["message"] == "Lead deleted permanently"
    assert result["restore_token"] is None
    assert prospect.deleted_doc is True


@pytest.mark.asyncio
async def test_delete_lead_returns_restore_token(monkeypatch):
    """A successful archive snapshot surfaces its restore token for the Undo toast."""
    prospect = _prospect()
    monkeypatch.setattr(
        "app.crm.pipeline.SalesProspect.get",
        FakeProspectGetter(prospect).get,
    )
    async def fake_snapshot(prospect, company_id, current_user):
        return "token-abc"

    monkeypatch.setattr("app.crm.pipeline._archive_lead_snapshot", fake_snapshot)
    _stub_cascade(monkeypatch)
    monkeypatch.setattr("app.models.task.Task", SimpleNamespace(find=FakeTaskQuery(0)))
    monkeypatch.setattr(
        "app.models.ownership_transfer.OwnershipTransfer",
        SimpleNamespace(find=FakeTaskQuery(0)),
    )

    result = await CRMPipelineService.delete_lead(_user(UserRole.ADMIN), "lead-1")
    assert result["restore_token"] == "token-abc"
    assert prospect.deleted_doc is True


class FakeArchiveCollection:
    """In-memory stand-in for the raw archive collection."""

    def __init__(self):
        self.docs = {}
        self.last_filter = None

    async def find_one(self, filt):
        self.last_filter = filt
        token = filt.get("_id")
        doc = self.docs.get(token)
        if not doc:
            return None
        company_filter = filt.get("company_id")
        if company_filter and doc.get("company_id") != company_filter:
            return None
        return doc

    async def delete_one(self, filt):
        token = filt.get("_id")
        self.docs.pop(token, None)
        return SimpleNamespace(deleted_count=1)

    async def insert_one(self, doc):
        if doc["_id"] in self.docs:
            raise DuplicateKeyError(f"E11000 duplicate key: {doc['_id']}")
        self.docs[doc["_id"]] = doc
        return SimpleNamespace(inserted_id=doc["_id"])

    async def insert_many(self, docs):
        for doc in docs:
            self.docs[doc["_id"]] = doc
        return SimpleNamespace(inserted_ids=[doc["_id"] for doc in docs])


class FakeArchiveDb:
    def __init__(self):
        self.archive = FakeArchiveCollection()
        self.sales_prospects = FakeArchiveCollection()
        self.crm_deals = FakeArchiveCollection()

    def __getitem__(self, name):
        return {
            "sales_prospect_delete_archives": self.archive,
            "sales_prospects": self.sales_prospects,
            "crm_deals": self.crm_deals,
        }[name]


@pytest.mark.asyncio
async def test_restore_lead_reinserts_documents(monkeypatch):
    """restore_lead re-inserts the lead + children from the archive and removes it."""
    db = FakeArchiveDb()
    db.archive.docs["token-1"] = {
        "_id": "token-1",
        "company_id": "company-1",
        "lead_id": "lead-1",
        "lead": {"_id": "lead-1", "prospect_name": "Alpha"},
        "children": {
            "crm_deals": [{"_id": "deal-1", "lead_id": "lead-1"}],
        },
    }
    monkeypatch.setattr("app.core.database.get_database", lambda: db)

    result = await CRMPipelineService.restore_lead(_user(UserRole.ADMIN), "token-1")

    assert result["message"] == "Lead restored"
    assert db.sales_prospects.docs["lead-1"]["prospect_name"] == "Alpha"
    assert db.crm_deals.docs["deal-1"]["lead_id"] == "lead-1"
    assert "token-1" not in db.archive.docs


@pytest.mark.asyncio
async def test_restore_lead_cross_company_forbidden(monkeypatch):
    """Restoring from another company's archive is forbidden (404)."""
    db = FakeArchiveDb()
    db.archive.docs["token-1"] = {
        "_id": "token-1",
        "company_id": "company-other",
        "lead_id": "lead-1",
        "lead": {"_id": "lead-1"},
        "children": {},
    }
    monkeypatch.setattr("app.core.database.get_database", lambda: db)

    with pytest.raises(HTTPException) as excinfo:
        await CRMPipelineService.restore_lead(_user(UserRole.ADMIN), "token-1")
    assert excinfo.value.status_code == 404


@pytest.mark.asyncio
async def test_restore_lead_missing_token_404(monkeypatch):
    """An unknown/expired restore token is a 404."""
    db = FakeArchiveDb()
    monkeypatch.setattr("app.core.database.get_database", lambda: db)

    with pytest.raises(HTTPException) as excinfo:
        await CRMPipelineService.restore_lead(_user(UserRole.ADMIN), "token-nope")
    assert excinfo.value.status_code == 404


@pytest.mark.asyncio
async def test_bulk_delete_leads_aggregates_results(monkeypatch):
    """Bulk delete aggregates per-lead outcomes (one blocked lead never fails the batch)."""

    async def fake_delete(current_user, lead_id):
        if lead_id == "lead-blocked":
            raise HTTPException(status_code=403, detail="Access denied")
        return {"message": "Lead deleted permanently", "deleted_lead_id": lead_id, "restore_token": f"token-{lead_id}"}

    monkeypatch.setattr("app.crm.pipeline.CRMPipelineService.delete_lead", staticmethod(fake_delete))

    result = await CRMPipelineService.bulk_delete_leads(_user(UserRole.ADMIN), ["lead-a", "lead-blocked", "lead-b"])

    assert result["deleted_count"] == 2
    assert result["skipped_count"] == 1
    by_id = {item["lead_id"]: item for item in result["results"]}
    assert by_id["lead-a"]["status"] == "deleted"
    assert by_id["lead-blocked"]["status"] == "error"
    assert by_id["lead-b"]["restore_token"] == "token-lead-b"


@pytest.mark.asyncio
async def test_restore_lead_conflict_when_recreated(monkeypatch):
    """Restoring a lead that was re-created (duplicate email/_id) is a clear 409."""
    db = FakeArchiveDb()
    # The lead was re-created after the delete, so its _id already exists.
    db.sales_prospects.docs["lead-1"] = {"_id": "lead-1", "prospect_name": "Recreated"}
    db.archive.docs["token-1"] = {
        "_id": "token-1",
        "company_id": "company-1",
        "lead_id": "lead-1",
        "lead": {"_id": "lead-1", "prospect_name": "Alpha"},
        "children": {},
    }
    monkeypatch.setattr("app.core.database.get_database", lambda: db)

    with pytest.raises(HTTPException) as excinfo:
        await CRMPipelineService.restore_lead(_user(UserRole.ADMIN), "token-1")
    assert excinfo.value.status_code == 409
    assert "already re-created" in excinfo.value.detail
