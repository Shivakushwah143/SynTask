from types import SimpleNamespace

import pytest

from app.integrations.meta.channel_adapters import ChannelType, NormalizedEventType
from app.integrations.meta.ai_draft_service import MetaAIDraftService


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *_args):
        return self

    def limit(self, _limit):
        return self

    async def to_list(self):
        return self.rows


class FakeConversationModel:
    rows = []
    queries = []

    @classmethod
    async def find_one(cls, query):
        cls.queries.append(query)
        for row in cls.rows:
            if _matches(row, query):
                return row
        return None


class FakeMessageModel:
    rows = []
    queries = []

    @classmethod
    def find(cls, query):
        cls.queries.append(query)
        return FakeCursor([row for row in cls.rows if _matches(row, query)])


class FakeDraft:
    inserted = []
    saved = []

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = kwargs.get("id", "draft-1")
        self.status = kwargs.get("status", "drafted")

    async def insert(self):
        self.__class__.inserted.append(self)
        return self

    async def save(self):
        self.__class__.saved.append(self.status)
        return self


class FakeDraftModel:
    rows = []
    queries = []

    @classmethod
    async def find_one(cls, query):
        cls.queries.append(query)
        for row in cls.rows:
            if _matches(row, query):
                return row
        return None


class FakeAuditLog:
    inserted = []

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)

    async def insert(self):
        self.__class__.inserted.append(self)
        return self


def _conversation(**overrides):
    data = {
        "id": "conversation-1",
        "company_id": "tenant-1",
        "channel": ChannelType.INSTAGRAM,
        "connection_id": "connection-1",
        "provider_thread_id": "thread-1",
        "linked_lead_id": "lead-1",
        "linked_contact_id": None,
        "customer_identity_id": "identity-1",
        "last_inbound_at": None,
        "last_outbound_at": None,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def _message(**overrides):
    data = {
        "id": "message-1",
        "company_id": "tenant-1",
        "conversation_id": "conversation-1",
        "channel": ChannelType.INSTAGRAM,
        "event_type": NormalizedEventType.INBOUND_MESSAGE,
        "direction": "inbound",
        "text": "secret customer message body",
        "provider_message_id": "provider-message-1",
        "created_at": None,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def _matches(row, query):
    for key, value in query.items():
        attr = "id" if key == "_id" else key
        if getattr(row, attr, None) != value:
            return False
    return True


@pytest.fixture(autouse=True)
def reset_fakes():
    FakeConversationModel.rows = []
    FakeConversationModel.queries = []
    FakeMessageModel.rows = []
    FakeMessageModel.queries = []
    FakeDraft.inserted = []
    FakeDraft.saved = []
    FakeDraftModel.rows = []
    FakeDraftModel.queries = []
    FakeAuditLog.inserted = []


@pytest.mark.asyncio
async def test_generate_draft_is_tenant_scoped_and_does_not_send():
    FakeConversationModel.rows = [_conversation()]
    FakeMessageModel.rows = [_message()]
    async def generator(prompt):
        assert prompt.channel == ChannelType.INSTAGRAM
        assert prompt.policy["requires_human_approval"] is True
        return "Thanks for reaching out. A teammate will help shortly."

    service = MetaAIDraftService(
        conversation_model=FakeConversationModel,
        message_model=FakeMessageModel,
        draft_factory=FakeDraft,
        audit_log_factory=FakeAuditLog,
        draft_generator=generator,
    )

    draft = await service.generate_draft(
        company_id="tenant-1",
        conversation_id="conversation-1",
        requested_by="agent-1",
    )

    assert draft.status == "drafted"
    assert draft.channel == ChannelType.INSTAGRAM
    assert draft.policy_snapshot["requires_human_approval"] is True
    assert draft.policy_snapshot["provider_send_allowed"] is False
    assert FakeConversationModel.queries == [{"company_id": "tenant-1", "_id": "conversation-1"}]
    assert FakeMessageModel.queries == [{"company_id": "tenant-1", "conversation_id": "conversation-1"}]


@pytest.mark.asyncio
async def test_audit_metadata_excludes_message_bodies_and_raw_payloads():
    FakeConversationModel.rows = [_conversation(channel=ChannelType.WHATSAPP)]
    FakeMessageModel.rows = [_message(channel=ChannelType.WHATSAPP)]

    await MetaAIDraftService(
        conversation_model=FakeConversationModel,
        message_model=FakeMessageModel,
        draft_factory=FakeDraft,
        audit_log_factory=FakeAuditLog,
        draft_generator=lambda _prompt: "Safe draft",
    ).generate_draft(
        company_id="tenant-1",
        conversation_id="conversation-1",
        requested_by="agent-1",
        instruction="Be warm.",
    )

    audit = FakeAuditLog.inserted[0]
    assert audit.feature == "meta_ai_reply_draft"
    assert audit.company_id == "tenant-1"
    assert audit.prompt is None
    assert audit.raw_response is None
    assert "secret customer message body" not in str(audit.context)
    assert "raw_payload" not in str(audit.context)
    assert audit.context["message_count"] == 1
    assert audit.context["instruction_provided"] is True


@pytest.mark.asyncio
async def test_approve_and_reject_only_update_draft_status():
    draft = FakeDraft(
        company_id="tenant-1",
        conversation_id="conversation-1",
        channel=ChannelType.MESSENGER,
        draft_text="Safe draft",
        requested_by="agent-1",
    )
    FakeDraftModel.rows = [draft]
    service = MetaAIDraftService(
        draft_model=FakeDraftModel,
        audit_log_factory=FakeAuditLog,
    )

    await service.approve_draft(
        company_id="tenant-1",
        draft_id="draft-1",
        approved_by="manager-1",
    )
    await service.reject_draft(
        company_id="tenant-1",
        draft_id="draft-1",
        rejected_by="manager-1",
        reason="Needs tone change",
    )

    assert FakeDraft.saved == ["approved", "rejected"]
    assert [entry.status for entry in FakeAuditLog.inserted] == ["approved", "rejected"]
