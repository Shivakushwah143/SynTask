import pytest
from datetime import datetime, timezone
from app.integrations.meta import readiness_service
from app.integrations.meta.readiness_service import MetaReadinessService

class MockReadinessRecord:
    inserted_records = []

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.status = kwargs.get("status", "pending")
        self.evidence_url = kwargs.get("evidence_url", None)
        self.verified_at = kwargs.get("verified_at", None)
        self.verified_by = kwargs.get("verified_by", None)
        self.notes = kwargs.get("notes", None)
        self.inserted = False
        self.saved = False

    async def insert(self):
        self.inserted = True
        self.inserted_records.append(self)
        return self

    async def save(self):
        self.saved = True
        return self

    @classmethod
    def find_all(cls):
        pass

    @classmethod
    def find_one(cls, query):
        pass

class FakeQuery:
    def __init__(self, items):
        self.items = items
        
    async def to_list(self):
        return self.items

@pytest.fixture(autouse=True)
def mock_beanie_model(monkeypatch):
    monkeypatch.setattr(readiness_service, "MetaReadinessRecord", MockReadinessRecord)

@pytest.mark.asyncio
async def test_get_readiness_checklist_seeds_defaults(monkeypatch):
    MockReadinessRecord.inserted_records = []

    def mock_find_all():
        return FakeQuery(MockReadinessRecord.inserted_records)

    monkeypatch.setattr(MockReadinessRecord, "find_all", mock_find_all)

    checklist = await MetaReadinessService.get_readiness_checklist()
    assert len(checklist) == 5
    assert len(MockReadinessRecord.inserted_records) == 5
    
    pii_redaction = next(item for item in checklist if item.checklist_id == "PII_REDACTION")
    assert pii_redaction.status == "pending"
    assert pii_redaction.checklist_name == "PII & Access Token Log Redaction"

@pytest.mark.asyncio
async def test_update_readiness_record(monkeypatch):
    record = MockReadinessRecord(
        checklist_id="PII_REDACTION",
        checklist_name="PII",
        status="pending",
        evidence_url=None,
        notes=None,
        verified_by=None,
        verified_at=None
    )

    async def mock_find_one(query):
        if query.get("checklist_id") == "PII_REDACTION":
            return record
        return None

    monkeypatch.setattr(MockReadinessRecord, "find_one", mock_find_one)

    updated = await MetaReadinessService.update_readiness_record(
        checklist_id="PII_REDACTION",
        status="passed",
        evidence_url="http://example.com/evidence.mp4",
        notes="All logs checked",
        verified_by="admin-user"
    )

    assert updated.status == "passed"
    assert updated.evidence_url == "http://example.com/evidence.mp4"
    assert updated.notes == "All logs checked"
    assert updated.verified_by == "admin-user"
    assert updated.verified_at is not None
    assert updated.saved is True

@pytest.mark.asyncio
async def test_is_fully_ready(monkeypatch):
    records = [
        MockReadinessRecord(checklist_id="1", status="passed"),
        MockReadinessRecord(checklist_id="2", status="pending")
    ]

    monkeypatch.setattr(MockReadinessRecord, "find_all", lambda: FakeQuery(records))

    assert not (await MetaReadinessService.is_fully_ready())

    for r in records:
        r.status = "passed"

    assert await MetaReadinessService.is_fully_ready()

@pytest.mark.asyncio
async def test_export_evidence_package(monkeypatch):
    records = [
        MockReadinessRecord(
            checklist_id="PII_REDACTION",
            checklist_name="PII",
            status="passed",
            evidence_url="http://example.com/evidence.mp4",
            notes="Redacted",
            verified_by="admin-1",
            verified_at=datetime.now(timezone.utc)
        ),
        MockReadinessRecord(
            checklist_id="OAUTH_FLOW",
            checklist_name="OAuth",
            status="pending",
            evidence_url=None,
            notes=None,
            verified_by=None,
            verified_at=None
        )
    ]

    monkeypatch.setattr(MockReadinessRecord, "find_all", lambda: FakeQuery(records))

    package = await MetaReadinessService.export_evidence_package()
    assert package["checklist_count"] == 2
    assert package["passed_count"] == 1
    assert package["fully_ready"] is False

    pii_item = next(item for item in package["items"] if item["checklist_id"] == "PII_REDACTION")
    assert pii_item["status"] == "passed"
    assert pii_item["evidence_url"] == "http://example.com/evidence.mp4"
    assert pii_item["notes"] == "Redacted"
    assert pii_item["verified_by"] == "admin-1"
