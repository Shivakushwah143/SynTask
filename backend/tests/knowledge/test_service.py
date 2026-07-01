import pytest

from app.knowledge.contracts import KnowledgeEvent
from app.knowledge.service import KnowledgeIngestionService
from app.models.knowledge import KnowledgeStatus


class DummyRecord:
    def __init__(self, version=1, status=KnowledgeStatus.ACTIVE, knowledge_type="task", source_entity="task", source_entity_id="1"):
        self.version = version
        self.status = status
        self.knowledge_type = knowledge_type
        self.source_entity = source_entity
        self.source_entity_id = source_entity_id
        self.metadata = {"idempotency_key": "k1"}
        self.knowledge_id = "knowledge-1"
        self.company_id = "company-1"
        self.created_at = None
        self.updated_at = None


class DummyRepo:
    def __init__(self):
        self.created = []
        self.archived = False
        self.latest = None

    async def get_latest_by_source(self, company_id, source_entity, source_entity_id, knowledge_type=None):
        return self.latest

    async def archive_previous_versions(self, company_id, source_entity, source_entity_id, knowledge_type):
        self.archived = True
        if self.latest:
            self.latest.status = KnowledgeStatus.SUPERSEDED
        return 1

    async def create(self, record):
        self.created.append(record)
        return record


@pytest.mark.asyncio
async def test_ingest_event_is_idempotent(monkeypatch):
    repo = DummyRepo()
    repo.latest = DummyRecord()
    service = KnowledgeIngestionService(repository=repo)
    event = KnowledgeEvent(
        event_name="TaskCreated",
        event_version=1,
        aggregate_type="task",
        aggregate_id="1",
        company_id="company-1",
        actor_id="user-1",
        payload={"title": "Task", "summary": "Task summary"},
        idempotency_key="k1",
    )

    record = await service.ingest_event(event)

    assert record is repo.latest
    assert len(repo.created) == 0


@pytest.mark.asyncio
async def test_ingest_event_versions_new_records(monkeypatch):
    repo = DummyRepo()
    repo.latest = DummyRecord(version=1)
    repo.latest.metadata = {"idempotency_key": "old-key"}
    service = KnowledgeIngestionService(repository=repo)
    event = KnowledgeEvent(
        event_name="TaskUpdated",
        event_version=1,
        aggregate_type="task",
        aggregate_id="1",
        company_id="company-1",
        actor_id="user-1",
        payload={"title": "Task", "summary": "Task summary", "version_marker": "v2"},
        idempotency_key="new-key",
    )

    record = await service.ingest_event(event)

    assert repo.archived is True
    assert record.version == 2
    assert len(repo.created) == 1

