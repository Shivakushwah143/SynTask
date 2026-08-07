from datetime import datetime
from types import SimpleNamespace

import pytest

from app.api.v1.endpoints import tasks as tasks_endpoint
from app.api.deps import PaginationParams
from app.models.scheduled_job import ScheduledJobActionType, ScheduledJobStatus
from app.models.user import UserRole


def user(user_id):
    return SimpleNamespace(id=user_id, role=UserRole.ADMIN, company_id="company-1")


class FakeQuery:
    def __init__(self, items):
        self.items = items

    def skip(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def sort(self, *_args, **_kwargs):
        return self

    async def to_list(self):
        return list(self.items)

    async def count(self):
        return len(self.items)


class FakeTaskModel:
    @classmethod
    def find(cls, *_args, **_kwargs):
        return FakeQuery([])


class FakeScheduledJobModel:
    queries = []

    @classmethod
    def find(cls, query):
        cls.queries.append(query)
        creator = query.get("created_by")
        jobs = []
        if creator == "creator-1":
            jobs.append(SimpleNamespace(
                id="job-1",
                action_type=ScheduledJobActionType.CREATE_TASK,
                status=ScheduledJobStatus.PENDING,
                company_id="company-1",
                created_by="creator-1",
                run_at=datetime(2026, 8, 5, 10, 30),
                created_at=datetime(2026, 8, 3, 9, 0),
                payload={
                    "title": "Publish later",
                    "priority": "high",
                    "assigned_to": "employee-1",
                    "due_date": "2026-08-10T10:00:00Z",
                },
            ))
        elif creator == "follow-up-creator":
            jobs.append(SimpleNamespace(
                id="job-2",
                action_type=ScheduledJobActionType.CREATE_TASK,
                status=ScheduledJobStatus.PENDING,
                company_id="company-1",
                created_by="follow-up-creator",
                run_at=datetime(2026, 8, 6, 11, 0),
                created_at=datetime(2026, 8, 4, 10, 0),
                payload={
                    "title": "Follow up call with Acme",
                    "priority": "medium",
                    "source_type": "sales_follow_up",
                },
            ))
        return FakeQuery(jobs)


@pytest.mark.asyncio
async def test_task_list_includes_pending_scheduled_task_only_for_creator(monkeypatch):
    monkeypatch.setattr(tasks_endpoint, "Task", FakeTaskModel)
    monkeypatch.setattr(tasks_endpoint, "ScheduledJob", FakeScheduledJobModel)

    pagination = PaginationParams(skip=0, limit=20)
    response = await tasks_endpoint.list_tasks(pagination=pagination, current_user=user("creator-1"))

    assert response["total"] == 1
    assert response["tasks"][0]["is_scheduled_placeholder"] is True
    assert response["tasks"][0]["scheduled_job_id"] == "job-1"
    assert response["tasks"][0]["status"] == "scheduled"

    response = await tasks_endpoint.list_tasks(pagination=pagination, current_user=user("other-1"))

    assert response["total"] == 0
    assert response["tasks"] == []


@pytest.mark.asyncio
async def test_scheduled_placeholder_carries_source_type_from_payload(monkeypatch):
    monkeypatch.setattr(tasks_endpoint, "Task", FakeTaskModel)
    monkeypatch.setattr(tasks_endpoint, "ScheduledJob", FakeScheduledJobModel)

    pagination = PaginationParams(skip=0, limit=20)
    response = await tasks_endpoint.list_tasks(
        pagination=pagination,
        current_user=user("follow-up-creator"),
    )

    assert response["total"] == 1
    placeholder = response["tasks"][0]
    assert placeholder["is_scheduled_placeholder"] is True
    assert placeholder["source_type"] == "sales_follow_up"

    response = await tasks_endpoint.list_tasks(pagination=pagination, current_user=user("creator-1"))
    assert response["tasks"][0]["source_type"] is None
