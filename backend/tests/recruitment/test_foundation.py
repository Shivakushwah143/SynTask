from app.events.registry import event_registry
from app.models.capability import DEFAULT_CAPABILITIES
from app.models.department import DepartmentType
from app.models.user import UserRole
from app.recruitment.events import RECRUITMENT_EVENTS, build_recruitment_event
from app.recruitment.models import Application, Candidate
from app.recruitment.subscribers import register_recruitment_subscribers
from app.recruitment.repositories import TenantRepository
from app.recruitment.transactions import recruitment_transaction
import pytest


def test_candidate_and_application_are_separate_collections():
    assert Candidate.Settings.name == "recruitment_candidates"
    assert Application.Settings.name == "recruitment_applications"
    assert Candidate.Settings.name != Application.Settings.name


def test_application_has_tenant_candidate_job_unique_index():
    indexes = Application.Settings.indexes
    assert any(index.document.get("unique") and list(index.document["key"].keys()) == ["company_id", "candidate_id", "job_id"] for index in indexes)


def test_hr_capabilities_use_platform_capability_map():
    capabilities = DEFAULT_CAPABILITIES[(DepartmentType.HR, UserRole.MANAGER)]
    assert "recruitment.view" in capabilities
    assert "recruitment.convert_employee" in capabilities


def test_recruitment_event_uses_canonical_domain_event():
    event = build_recruitment_event(event_name="RecruitmentCandidateCreated", aggregate_type="candidate", aggregate_id="candidate-1", company_id="company-1", actor_id="user-1", payload={"created_at": "v1"})
    assert event.company_id == "company-1"
    assert event.metadata["surface"] == "recruitment"
    assert event.idempotency_key


def test_recruitment_subscribers_are_registered_idempotently():
    register_recruitment_subscribers(); register_recruitment_subscribers()
    for event_name in RECRUITMENT_EVENTS:
        assert len(event_registry.get_handlers(event_name)) == 2


@pytest.mark.asyncio
async def test_tenant_repository_rejects_cross_tenant_document():
    class Item:
        company_id = "company-2"
        deleted_at = None
    class Model:
        @staticmethod
        async def get(_entity_id): return Item()
    assert await TenantRepository.get(Model, "id-1", "company-1") is None


@pytest.mark.asyncio
async def test_transaction_helper_opens_session_and_transaction(monkeypatch):
    class Context:
        async def __aenter__(self): return self
        async def __aexit__(self, *_args): return False
    class Session(Context):
        def start_transaction(self): return Context()
    class Client:
        async def start_session(self): return Session()
    monkeypatch.setattr("app.core.database.client", Client())
    async with recruitment_transaction() as session:
        assert isinstance(session, Session)
