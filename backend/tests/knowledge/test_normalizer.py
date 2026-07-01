from datetime import datetime

from app.knowledge.contracts import KnowledgeEvent
from app.knowledge.normalizer import KnowledgeNormalizer
from app.models.knowledge import KnowledgeType, KnowledgeStatus


def test_normalize_project_created_event():
    event = KnowledgeEvent(
        event_name="ProjectCreated",
        event_version=1,
        aggregate_type="project",
        aggregate_id="proj-123",
        company_id="company-1",
        project_id="proj-123",
        actor_id="user-1",
        occurred_at=datetime.utcnow(),
        payload={
            "title": "Brand Refresh",
            "summary": "New brand refresh project",
            "description": "Refresh client brand assets",
            "tags": ["brand", "client"],
        },
        metadata={"module": "projects"},
        idempotency_key="company-1:project:proj-123:ProjectCreated:1:marker",
    )

    record = KnowledgeNormalizer.normalize(event)

    assert record.knowledge_type == KnowledgeType.PROJECT.value
    assert record.status == KnowledgeStatus.ACTIVE
    assert record.company_id == "company-1"
    assert record.project_id == "proj-123"
    assert record.source_entity == "project"
    assert record.source_entity_id == "proj-123"
    assert record.title == "Brand Refresh"
    assert "brand" in record.tags
    assert record.source_event["event_name"] == "ProjectCreated"

