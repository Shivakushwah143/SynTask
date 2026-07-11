from dataclasses import dataclass

import pytest

from app.events.factories import build_domain_event
from app.events.registry import event_registry
from app.events.subscribers import knowledge as knowledge_subscriber
from app.models.knowledge import KnowledgeStatus


@dataclass
class DummyTask:
    id: str
    company_id: str
    title: str
    description: str | None = None
    project_id: str | None = None
    status: object = None
    priority: object = None
    tags: list[str] = None
    department_id: str | None = None
    attachments: list[str] = None
    created_by: str = "user-1"
    assigned_to: str | None = None
    assigned_by: str | None = None
    due_date: object = None
    start_date: object = None
    completed_at: object = None
    updated_at: object = None
    epic_id: str | None = None
    sprint_id: str | None = None
    story_points: int | None = None
    estimated_hours: float | None = None
    actual_hours: float | None = None
    workflow_id: str | None = None
    issue_type_id: str | None = None
    component_id: str | None = None
    fix_version_id: str | None = None
    affects_version_ids: list[str] = None
    resolution: str | None = None
    resolved_at: object = None
    resolved_by: str | None = None

    def __post_init__(self):
        self.attachments = self.attachments or []
        self.tags = self.tags or []
        self.affects_version_ids = self.affects_version_ids or []


class DummyRecord:
    def __init__(self, version=1, status=KnowledgeStatus.ACTIVE):
        self.version = version
        self.status = status
        self.knowledge_type = "task"
        self.source_entity = "task"
        self.source_entity_id = "task-1"
        self.metadata = {"idempotency_key": "company-1:task:task-1:TaskCreated:task-v1"}


class DummyRepo:
    def __init__(self):
        self.latest = None
        self.created = []
        self.archived = False

    async def get_latest_by_source(self, company_id, source_entity, source_entity_id, knowledge_type=None):
        return self.latest

    async def archive_previous_versions(self, company_id, source_entity, source_entity_id, knowledge_type):
        self.archived = True
        if self.latest:
            self.latest.status = KnowledgeStatus.SUPERSEDED
        return 1

    async def create(self, record):
        self.created.append(record)
        self.latest = record
        return record


@pytest.mark.asyncio
async def test_knowledge_subscriber_routes_task_events_and_is_replay_safe(monkeypatch):
    handlers = event_registry.get_handlers("TaskCreated")
    for handler in handlers:
        event_registry._handlers["TaskCreated"].remove(handler)

    repo = DummyRepo()
    service = knowledge_subscriber.KnowledgeIngestionService(repository=repo)
    monkeypatch.setattr(knowledge_subscriber, "knowledge_service", service)

    task = DummyTask(
        id="task-1",
        company_id="company-1",
        project_id="project-1",
        title="Fix login bug",
        description="Review login failures",
        updated_at=type("T", (), {"isoformat": lambda self: "2026-06-30T00:00:00"})(),
    )

    async def fake_task_get(task_id):
        return task if task_id == "task-1" else None

    monkeypatch.setattr("app.models.task.Task.get", fake_task_get)
    async def fake_get_redis_health(force_refresh=False):
        return True
    monkeypatch.setattr(knowledge_subscriber, "get_redis_health", fake_get_redis_health)
    knowledge_subscriber.register_knowledge_subscribers()

    event = build_domain_event(
        event_name="TaskCreated",
        aggregate_type="task",
        aggregate_id="task-1",
        company_id="company-1",
        actor_id="user-1",
        payload={
            "title": "Fix login bug",
            "description": "Review login failures",
            "updated_at": "task-v1",
        },
        project_id="project-1",
    )

    await knowledge_subscriber._handle_event(event)
    await knowledge_subscriber._handle_event(event)

    assert len(repo.created) == 1
    assert repo.latest.version == 1
