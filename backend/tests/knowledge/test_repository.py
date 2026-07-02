import pytest

from app.knowledge.repository import KnowledgeRepository
from app.models.knowledge import KnowledgeStatus


class DummyRecord:
    def __init__(self, status):
        self.status = status


@pytest.mark.asyncio
async def test_archive_previous_versions_marks_active_records_superseded(monkeypatch):
    repo = KnowledgeRepository()
    records = [DummyRecord(KnowledgeStatus.ACTIVE), DummyRecord(KnowledgeStatus.VERIFIED), DummyRecord(KnowledgeStatus.ARCHIVED)]
    updated = []

    async def fake_find_by_source(company_id, source_entity, source_entity_id, knowledge_type=None):
        return records

    async def fake_update(record):
        updated.append(record.status)
        return record

    monkeypatch.setattr(repo, "find_by_source", fake_find_by_source)
    monkeypatch.setattr(repo, "update", fake_update)

    count = await repo.archive_previous_versions("company-1", "task", "task-1", "task")

    assert count == 2
    assert updated == [KnowledgeStatus.SUPERSEDED, KnowledgeStatus.SUPERSEDED]

