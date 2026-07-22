from __future__ import annotations

import os
import asyncio
from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
import pytest_asyncio
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.agents.orchestrator import AgentOrchestrator
from app.agents.schemas import AgentRunCreateRequest
from app.models.agent import ActionProposal, AgentDefinition, AgentRun, AgentRunEvent, SpecialistDefinition
from app.models.user import User, UserRole, UserStatus


pytestmark = pytest.mark.skipif(
    os.getenv("RUN_MONGO_INTEGRATION") != "1",
    reason="Set RUN_MONGO_INTEGRATION=1 with a real MongoDB service container available.",
)


@pytest_asyncio.fixture
async def mongo_db(monkeypatch):
    db_name = f"syntask_agent_platform_test_{uuid4().hex}"
    client = AsyncIOMotorClient(os.getenv("MONGODB_URL", "mongodb://localhost:27017"), serverSelectionTimeoutMS=5000)
    await client.admin.command("ping")
    await init_beanie(database=client[db_name], document_models=[User, AgentDefinition, SpecialistDefinition, AgentRun, AgentRunEvent, ActionProposal])
    try:
        yield client[db_name]
    finally:
        await client.drop_database(db_name)
        client.close()


async def _user(company_id: str = "tenant-a", role: UserRole = UserRole.ADMIN) -> User:
    user = User(
        email=f"{uuid4().hex}@example.com",
        first_name="Agent",
        last_name="User",
        role=role,
        status=UserStatus.ACTIVE,
        company_id=company_id,
        modules=["task"],
    )
    await user.insert()
    return user


async def _definition(**overrides) -> AgentDefinition:
    payload = dict(
        agent_id="foundation-agent",
        version="1",
        name="Foundation Agent",
        objective="Shared foundation test",
        allowed_trigger_types=["manual"],
        allowed_roles=["admin", "manager", "lead", "employee"],
        required_scopes=[],
        retrieval_profile_id="foundation",
        retrieval_profile_version="foundation-v1",
        input_schema_version="input-v1",
        output_schema_version="output-v1",
        prompt_id="foundation",
        prompt_version="prompt-v1",
        provider_policy_id="test-policy",
        budget_policy={"max_tokens_per_run": 10000, "max_cost_per_run": 1},
        evaluation_set_version="eval-v1",
        enabled=True,
        published=True,
        created_by="test",
    )
    payload.update(overrides)
    definition = AgentDefinition(**payload)
    await definition.insert()
    return definition


class FakeContextBuilder:
    async def build(self, **kwargs):
        return SimpleNamespace(context_package_id="ctx-1", clarification_required=False, warnings=[])


class MissingContextBuilder:
    async def build(self, **kwargs):
        return SimpleNamespace(context_package_id="ctx-1", clarification_required=True, warnings=["missing"])


class FakeProviderRouter:
    def __init__(self, *, proposed: bool = False, fail: bool = False):
        self.calls = 0
        self.proposed = proposed
        self.fail = fail

    async def generate(self, **kwargs):
        self.calls += 1
        if self.fail:
            raise ValueError("invalid")
        parsed = {"summary": "ok", "facts": [], "missing_data": [], "confidence": 1.0, "proposed_actions": []}
        if self.proposed:
            parsed["proposed_actions"] = [
                {
                    "action_type": "proposed_update",
                    "target_record_type": "task",
                    "target_record_id": "task-1",
                    "proposed_changes": {"status": "todo"},
                    "reason": "test",
                }
            ]
        return SimpleNamespace(
            provider="fake",
            model="fake-model",
            parsed=parsed,
            total_tokens=10,
            estimated_cost=0.001,
        )


def _payload(key: str = "idem-123456") -> AgentRunCreateRequest:
    return AgentRunCreateRequest(
        agent_id="foundation-agent",
        agent_version="1",
        trigger_type="manual",
        idempotency_key=key,
        session_id="session-1",
        conversation_id="conversation-1",
        query="summarize safely",
    )


@pytest.mark.asyncio
async def test_orchestrator_completes_and_is_idempotent(mongo_db, monkeypatch):
    await _definition()
    user = await _user()
    provider = FakeProviderRouter()
    monkeypatch.setattr("app.agents.orchestrator.sanitize_for_model_context", lambda package: SimpleNamespace(model_dump=lambda mode: {"items": []}))
    orchestrator = AgentOrchestrator(context_builder=FakeContextBuilder(), provider_router=provider)

    first = await orchestrator.create_run(current_user=user, payload=_payload())
    second = await orchestrator.create_run(current_user=user, payload=_payload())

    assert first.run_id == second.run_id
    assert first.state == "COMPLETED"
    assert provider.calls == 1
    assert await AgentRun.find_all().count() == 1
    assert await AgentRunEvent.find_all().count() >= 1


@pytest.mark.asyncio
async def test_concurrent_duplicate_creation_produces_one_run_and_one_provider_call(mongo_db, monkeypatch):
    await _definition()
    user = await _user()
    provider = FakeProviderRouter()
    monkeypatch.setattr("app.agents.orchestrator.sanitize_for_model_context", lambda package: SimpleNamespace(model_dump=lambda mode: {"items": []}))
    orchestrator = AgentOrchestrator(context_builder=FakeContextBuilder(), provider_router=provider)

    first, second = await asyncio.gather(
        orchestrator.create_run(current_user=user, payload=_payload("idem-concurrent")),
        orchestrator.create_run(current_user=user, payload=_payload("idem-concurrent")),
    )

    assert first.run_id == second.run_id
    assert provider.calls == 1
    assert await AgentRun.find_all().count() == 1


@pytest.mark.asyncio
async def test_orchestrator_blocks_missing_context_and_never_calls_provider(mongo_db, monkeypatch):
    await _definition()
    user = await _user()
    provider = FakeProviderRouter()
    orchestrator = AgentOrchestrator(context_builder=MissingContextBuilder(), provider_router=provider)

    result = await orchestrator.create_run(current_user=user, payload=_payload("idem-missing"))

    assert result.state == "BLOCKED_MISSING_DATA"
    assert provider.calls == 0


@pytest.mark.asyncio
async def test_orchestrator_creates_proposal_but_does_not_execute(mongo_db, monkeypatch):
    await _definition(approval_policy={"required_approver_roles": ["admin"]})
    user = await _user()
    monkeypatch.setattr("app.agents.orchestrator.sanitize_for_model_context", lambda package: SimpleNamespace(model_dump=lambda mode: {"items": []}))
    orchestrator = AgentOrchestrator(context_builder=FakeContextBuilder(), provider_router=FakeProviderRouter(proposed=True))

    result = await orchestrator.create_run(current_user=user, payload=_payload("idem-proposal"))

    assert result.state == "AWAITING_APPROVAL"
    assert len(result.proposed_action_ids) == 1
    proposal = await ActionProposal.find_one(ActionProposal.proposal_id == result.proposed_action_ids[0])
    assert proposal.status == "proposed"


@pytest.mark.asyncio
async def test_definition_role_and_disabled_rejections(mongo_db):
    await _definition(agent_id="disabled", enabled=False)
    await _definition(agent_id="role-agent", allowed_roles=["admin"])
    employee = await _user(role=UserRole.EMPLOYEE)
    orchestrator = AgentOrchestrator(context_builder=FakeContextBuilder(), provider_router=FakeProviderRouter())

    disabled_payload = _payload("idem-disabled")
    disabled_payload.agent_id = "disabled"
    with pytest.raises(Exception):
        await orchestrator.create_run(current_user=employee, payload=disabled_payload)

    role_payload = _payload("idem-role")
    role_payload.agent_id = "role-agent"
    with pytest.raises(Exception):
        await orchestrator.create_run(current_user=employee, payload=role_payload)
