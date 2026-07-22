from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.agents.task_performance import TaskPerformanceAgentRequest
from app.api.v1.endpoints import agents as agent_endpoints
from app.models.user import UserRole


def request(**scope):
    return TaskPerformanceAgentRequest(
        insight_type="team_summary",
        scope=scope,
        date_range={"start": datetime(2026, 7, 1, tzinfo=UTC), "end": datetime(2026, 7, 21, tzinfo=UTC)},
        metric_keys=["task_completion_rate"],
        idempotency_key="idempotent-1",
    )


def user(role=UserRole.MANAGER, **overrides):
    data = {
        "id": "manager-1",
        "company_id": "tenant-1",
        "department_id": "dept-1",
        "role": role,
        "ancestors": [],
        "reports_to": None,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


@pytest.mark.asyncio
async def test_task_performance_scope_rejects_employee_role():
    with pytest.raises(HTTPException) as exc:
        await agent_endpoints._validate_task_performance_scope(current_user=user(UserRole.EMPLOYEE), payload=request())

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_task_performance_scope_rejects_cross_hierarchy_user(monkeypatch):
    target = SimpleNamespace(id="employee-2", company_id="tenant-1", reports_to="lead-2", ancestors=["manager-2"])

    async def fake_get(_):
        return target

    monkeypatch.setattr(agent_endpoints.User, "get", staticmethod(fake_get))

    with pytest.raises(HTTPException) as exc:
        await agent_endpoints._validate_task_performance_scope(
            current_user=user(UserRole.MANAGER),
            payload=request(user_id="employee-2"),
        )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_task_performance_scope_allows_manager_subordinate(monkeypatch):
    target = SimpleNamespace(id="employee-1", company_id="tenant-1", reports_to="lead-1", ancestors=["manager-1"])

    async def fake_get(_):
        return target

    monkeypatch.setattr(agent_endpoints.User, "get", staticmethod(fake_get))

    await agent_endpoints._validate_task_performance_scope(
        current_user=user(UserRole.MANAGER),
        payload=request(user_id="employee-1"),
    )
