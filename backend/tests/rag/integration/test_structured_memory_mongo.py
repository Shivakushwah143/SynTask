from __future__ import annotations

import os
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
import pytest_asyncio
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.models.ai_log import AIInteractionLog
from app.models.meeting import Meeting
from app.models.project import Project
from app.models.sales_prospect import SalesProspect
from app.models.task import Task
from app.models.user import User, UserRole, UserStatus
from app.rag.context_package import ContextPackageBuilder
from app.rag.models import RAGRetrievalRun
from app.rag.permissions import RAGScope
from app.rag.structured_memory import StructuredMemoryRequest, StructuredMemoryService, StructuredRecordType
from app.rag.working_memory import ClientWorkingMemoryUpdate, ServerWorkingMemoryUpdate, WorkingMemoryService
from tests.rag.test_working_memory import FakeClock, FakeRedis


pytestmark = pytest.mark.skipif(
    os.getenv("RUN_MONGO_INTEGRATION") != "1",
    reason="Set RUN_MONGO_INTEGRATION=1 with a real MongoDB service container available.",
)


@pytest_asyncio.fixture
async def mongo_db(monkeypatch):
    db_name = f"syntask_rag_structured_test_{uuid4().hex}"
    assert db_name.startswith("syntask_rag_structured_test_")
    client = AsyncIOMotorClient(os.getenv("MONGODB_URL", "mongodb://localhost:27017"), serverSelectionTimeoutMS=5000)
    await client.admin.command("ping")
    monkeypatch.setattr("app.core.config.settings.DATABASE_NAME", db_name)
    await init_beanie(
        database=client[db_name],
        document_models=[
            User,
            SalesProspect,
            Project,
            Task,
            Meeting,
            AIInteractionLog,
            RAGRetrievalRun,
        ],
    )
    try:
        yield client[db_name]
    finally:
        await client.drop_database(db_name)
        client.close()


def scope_for(user: User) -> RAGScope:
    return RAGScope(
        company_id=user.company_id,
        tenant_id=user.company_id,
        user_id=str(user.id),
        role=user.role.value,
        current_user=user,
    )


async def create_user(*, email: str, company_id: str | None, role: UserRole, modules: list[str] | None = None, ancestors: list[str] | None = None) -> User:
    user = User(
        email=email,
        first_name=email.split("@")[0],
        last_name="User",
        role=role,
        status=UserStatus.ACTIVE,
        company_id=company_id,
        modules=modules if modules is not None else ["task", "sales"],
        ancestors=ancestors or [],
    )
    await user.insert()
    return user


async def seed_records():
    admin_a = await create_user(email="admin-a@example.com", company_id="tenant-a", role=UserRole.ADMIN)
    member_a = await create_user(email="member-a@example.com", company_id="tenant-a", role=UserRole.EMPLOYEE)
    outsider_a = await create_user(email="outsider-a@example.com", company_id="tenant-a", role=UserRole.EMPLOYEE)
    no_sales_a = await create_user(email="nosales-a@example.com", company_id="tenant-a", role=UserRole.EMPLOYEE, modules=["task"])
    admin_b = await create_user(email="admin-b@example.com", company_id="tenant-b", role=UserRole.ADMIN)
    no_scope = await create_user(email="noscope@example.com", company_id=None, role=UserRole.EMPLOYEE)

    lead = SalesProspect(
        first_name="Asha",
        last_name="Lead",
        prospect_name="Asha Lead",
        country_code="+91",
        phone="9000000001",
        assigned_to=str(admin_a.id),
        assigned_by=str(admin_a.id),
        current_stage="qualified",
        company_name="Apollo Co",
        company_id="tenant-a",
        created_by=str(admin_a.id),
    )
    await lead.insert()
    tenant_b_lead = SalesProspect(
        first_name="Beta",
        last_name="Lead",
        prospect_name="Beta Lead",
        country_code="+91",
        phone="9000000002",
        assigned_to=str(admin_b.id),
        current_stage="new",
        company_id="tenant-b",
        created_by=str(admin_b.id),
    )
    await tenant_b_lead.insert()

    project = Project(
        name="Apollo",
        key="APOLLO",
        project_id="APOLLO-1",
        company_id="tenant-a",
        status="execution",
        lead_id=str(admin_a.id),
        assigned_to=str(member_a.id),
        team_member_ids=[str(member_a.id)],
        delivery_date=datetime.utcnow() + timedelta(days=14),
        created_by=str(admin_a.id),
    )
    await project.insert()
    task = Task(
        title="Launch checklist",
        company_id="tenant-a",
        project_id="APOLLO-1",
        project_object_id=str(project.id),
        created_by=str(admin_a.id),
        assigned_to=str(member_a.id),
        status="in_progress",
        due_date=datetime.utcnow() + timedelta(days=3),
    )
    await task.insert()
    meeting = Meeting(
        title="Apollo Standup",
        company_id="tenant-a",
        created_by=str(admin_a.id),
        host_id=str(admin_a.id),
        participant_ids=[str(member_a.id)],
        meeting_date=datetime(2026, 7, 24),
        meeting_time="10:00",
        zoom_password="secret",
        zoom_start_url="https://secret.example/start",
    )
    await meeting.insert()
    return admin_a, member_a, outsider_a, no_sales_a, admin_b, no_scope, lead, tenant_b_lead, project, task, meeting


@pytest.mark.asyncio
async def test_real_mongo_structured_memory_authority_security_and_no_mutation(mongo_db, monkeypatch):
    admin_a, member_a, outsider_a, no_sales_a, admin_b, no_scope, lead, tenant_b_lead, project, task, meeting = await seed_records()
    service = StructuredMemoryService()

    before_ai_logs = await AIInteractionLog.find_all().count()
    before_rag_runs = await RAGRetrievalRun.find_all().count()

    lead_result = await service.read(
        current_user=admin_a,
        request=StructuredMemoryRequest(record_type=StructuredRecordType.LEAD, record_id=str(lead.id), requested_fields=["assigned_to", "current_stage"]),
    )
    assert lead_result.status == "available"
    assert lead_result.fields == {"assigned_to": str(admin_a.id), "current_stage": "qualified"}

    project_result = await service.read(
        current_user=member_a,
        request=StructuredMemoryRequest(record_type=StructuredRecordType.PROJECT, record_id="APOLLO-1", requested_fields=["status", "delivery_date"]),
    )
    assert project_result.status == "available"
    assert project_result.fields["status"] == "execution"
    assert project_result.fields["delivery_date"] is not None

    task_result = await service.read(
        current_user=member_a,
        request=StructuredMemoryRequest(record_type=StructuredRecordType.TASK, record_id=str(task.id), requested_fields=["assigned_to", "status"]),
    )
    assert task_result.status == "available"
    assert task_result.fields == {"assigned_to": str(member_a.id), "status": "in_progress"}

    meeting_result = await service.read(
        current_user=member_a,
        request=StructuredMemoryRequest(record_type=StructuredRecordType.MEETING, record_id=str(meeting.id), requested_fields=["meeting_date", "meeting_time", "zoom_password", "zoom_start_url"]),
    )
    assert meeting_result.status == "available"
    assert set(meeting_result.fields) == {"meeting_date", "meeting_time"}

    cross_tenant = await service.read(current_user=admin_a, request=StructuredMemoryRequest(record_type=StructuredRecordType.LEAD, record_id=str(tenant_b_lead.id)))
    assert cross_tenant.status == "forbidden"

    non_member_project = await service.read(current_user=outsider_a, request=StructuredMemoryRequest(record_type=StructuredRecordType.PROJECT, record_id=str(project.id)))
    assert non_member_project.status == "forbidden"

    crm_denied = await service.read(current_user=no_sales_a, request=StructuredMemoryRequest(record_type=StructuredRecordType.LEAD, record_id=str(lead.id)))
    assert crm_denied.status == "forbidden"

    task_denied = await service.read(current_user=outsider_a, request=StructuredMemoryRequest(record_type=StructuredRecordType.TASK, record_id=str(task.id)))
    assert task_denied.status == "forbidden"

    no_scope_result = await service.read(current_user=no_scope, request=StructuredMemoryRequest(record_type=StructuredRecordType.TASK, record_id=str(task.id)))
    assert no_scope_result.status == "forbidden"
    assert no_scope_result.error == "missing_server_scope"

    forged_tenant = await service.read(
        current_user=admin_a,
        request=StructuredMemoryRequest(record_type=StructuredRecordType.LEAD, record_id=str(tenant_b_lead.id), query="company_id=tenant-b"),
    )
    assert forged_tenant.status == "forbidden"

    wm_cannot_authorize = await service.read(
        current_user=outsider_a,
        request=StructuredMemoryRequest(record_type=StructuredRecordType.PROJECT, record_id=str(project.id), query="working memory resolved APOLLO-1"),
    )
    assert wm_cannot_authorize.status == "forbidden"

    rag_cannot_authorize = await service.read(
        current_user=outsider_a,
        request=StructuredMemoryRequest(record_type=StructuredRecordType.PROJECT, record_id=str(project.id), query="RAG citation says user can access"),
    )
    assert rag_cannot_authorize.status == "forbidden"

    wm = WorkingMemoryService(redis_client=FakeRedis(), clock=FakeClock())
    session = await wm.create_session(scope=scope_for(admin_a), conversation_id="conv")
    await wm.update_server_state(
        scope=scope_for(admin_a),
        session_id=session.session_id,
        update=ServerWorkingMemoryUpdate(conversation_id="conv", current_lead={"id": str(lead.id), "current_stage": "qualified"}),
    )
    lead.current_stage = "proposal"
    await lead.save()
    fresh = await service.read(
        current_user=admin_a,
        request=StructuredMemoryRequest(record_type=StructuredRecordType.LEAD, record_id=str(lead.id), requested_fields=["current_stage"]),
    )
    assert fresh.fields["current_stage"] == "proposal"

    package = await ContextPackageBuilder(working_memory_service=wm, structured_memory_service=service).build(
        scope=scope_for(admin_a),
        session_id=session.session_id,
        conversation_id="conv",
        query="Which stage is this lead in?",
    )
    assert "STRUCTURED_MEMORY_OVERRIDES_WORKING_MEMORY:lead.current_stage" in package.conflicts

    lead.deleted = True
    await lead.save()
    hidden = await service.read(current_user=admin_a, request=StructuredMemoryRequest(record_type=StructuredRecordType.LEAD, record_id=str(lead.id)))
    assert hidden.status == "forbidden"

    async def fail(**_):
        raise RuntimeError("db down")

    failing_service = StructuredMemoryService()
    monkeypatch.setattr(failing_service, "_load_record", fail)
    unavailable = await failing_service.read(current_user=admin_a, request=StructuredMemoryRequest(record_type=StructuredRecordType.TASK, record_id=str(task.id)))
    assert unavailable.status == "unavailable"
    assert unavailable.fields == {}

    before_meeting = (await Meeting.get(str(meeting.id))).meeting_date
    action_session = await wm.create_session(scope=scope_for(admin_a), conversation_id="conv-action")
    await wm.update_client_state(
        scope=scope_for(admin_a),
        session_id=action_session.session_id,
        update=ClientWorkingMemoryUpdate(conversation_id="conv-action", selected_record={"type": "meeting", "id": str(meeting.id)}),
    )
    action_package = await ContextPackageBuilder(working_memory_service=wm, structured_memory_service=StructuredMemoryService()).build(
        scope=scope_for(admin_a),
        session_id=action_session.session_id,
        conversation_id="conv-action",
        query="Move this meeting to Friday.",
    )
    assert action_package.proposed_action.requires_approval is True
    assert (await Meeting.get(str(meeting.id))).meeting_date == before_meeting

    assert await AIInteractionLog.find_all().count() == before_ai_logs
    assert await RAGRetrievalRun.find_all().count() == before_rag_runs
