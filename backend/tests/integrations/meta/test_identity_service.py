from types import SimpleNamespace

import pytest

from app.integrations.meta.channel_adapters import ChannelType
from app.integrations.meta.identity_service import MetaIdentityService


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows

    def limit(self, _limit):
        return self

    async def to_list(self):
        return self.rows


class FakeIdentityModel:
    rows = []
    find_one_queries = []
    find_queries = []

    @classmethod
    async def find_one(cls, query):
        cls.find_one_queries.append(query)
        for row in cls.rows:
            if _matches(row, query):
                return row
        return None

    @classmethod
    def find(cls, query):
        cls.find_queries.append(query)
        return FakeCursor([row for row in cls.rows if _matches(row, query)])


class FakeLink:
    inserted = []
    existing = []

    @classmethod
    async def find_one(cls, query):
        for row in cls.existing:
            if _matches(row, query):
                return row
        return None

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = "link-1"
        self.status = kwargs.get("status", "confirmed")

    async def insert(self):
        self.__class__.inserted.append(self)
        return self


def _identity(**overrides):
    data = {
        "id": "identity-1",
        "company_id": "tenant-1",
        "channel": ChannelType.WHATSAPP,
        "provider_user_id": "15551234567",
        "display_name": "Customer",
        "normalized_phone": "5551234567",
        "linked_lead_id": "lead-1",
        "linked_contact_id": "contact-1",
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
    FakeIdentityModel.rows = []
    FakeIdentityModel.find_one_queries = []
    FakeIdentityModel.find_queries = []
    FakeLink.inserted = []
    FakeLink.existing = []


@pytest.mark.asyncio
async def test_suggest_links_uses_only_tenant_scoped_deterministic_evidence():
    source = _identity()
    match = _identity(id="identity-2", channel=ChannelType.INSTAGRAM, provider_user_id="ig-user")
    other_tenant = _identity(id="identity-3", company_id="tenant-2", channel=ChannelType.MESSENGER)
    no_match = _identity(id="identity-4", normalized_phone="999", linked_lead_id=None, linked_contact_id=None)
    FakeIdentityModel.rows = [source, match, other_tenant, no_match]

    suggestions = await MetaIdentityService(identity_model=FakeIdentityModel).suggest_links(
        company_id="tenant-1",
        identity_id="identity-1",
    )

    assert [item.identity_id for item in suggestions] == ["identity-2"]
    assert suggestions[0].evidence == [
        {"type": "normalized_phone", "value": "5551234567"},
        {"type": "linked_contact_id", "value": "contact-1"},
        {"type": "linked_lead_id", "value": "lead-1"},
    ]
    assert all(query["company_id"] == "tenant-1" for query in FakeIdentityModel.find_queries)


@pytest.mark.asyncio
async def test_confirm_link_requires_deterministic_evidence():
    FakeIdentityModel.rows = [
        _identity(),
        _identity(
            id="identity-2",
            channel=ChannelType.INSTAGRAM,
            provider_user_id="ig-user",
            normalized_phone=None,
            linked_lead_id=None,
            linked_contact_id=None,
        ),
    ]

    with pytest.raises(ValueError, match="Deterministic evidence"):
        await MetaIdentityService(
            identity_model=FakeIdentityModel,
            link_model=FakeLink,
            link_factory=FakeLink,
        ).confirm_link(
            company_id="tenant-1",
            identity_id="identity-1",
            target_identity_id="identity-2",
            confirmed_by="admin-1",
        )

    assert FakeLink.inserted == []


@pytest.mark.asyncio
async def test_confirm_link_creates_human_confirmed_link_and_timeline():
    source = _identity()
    target = _identity(id="identity-2", channel=ChannelType.MESSENGER, provider_user_id="psid-1")
    FakeIdentityModel.rows = [source, target]
    timeline_calls = []

    async def publish_timeline(**kwargs):
        timeline_calls.append(kwargs)

    link = await MetaIdentityService(
        identity_model=FakeIdentityModel,
        link_model=FakeLink,
        link_factory=FakeLink,
        timeline_publisher=publish_timeline,
    ).confirm_link(
        company_id="tenant-1",
        identity_id="identity-1",
        target_identity_id="identity-2",
        confirmed_by="admin-1",
    )

    assert link.status == "confirmed"
    assert link.identity_ids == ["identity-1", "identity-2"]
    assert link.confirmed_by == "admin-1"
    assert link.linked_lead_id == "lead-1"
    assert timeline_calls[0]["event_name"] == "MetaIdentityLinkConfirmed"
    assert timeline_calls[0]["aggregate_id"] == "lead-1"
    assert timeline_calls[0]["company_id"] == "tenant-1"


@pytest.mark.asyncio
async def test_confirm_link_is_idempotent_for_existing_confirmed_pair():
    source = _identity()
    target = _identity(id="identity-2", channel=ChannelType.MESSENGER, provider_user_id="psid-1")
    existing = FakeLink(
        company_id="tenant-1",
        identity_ids=["identity-1", "identity-2"],
        link_key="identity-1:identity-2",
        evidence=[],
        confirmed_by="admin-1",
    )
    FakeIdentityModel.rows = [source, target]
    FakeLink.existing = [existing]

    link = await MetaIdentityService(
        identity_model=FakeIdentityModel,
        link_model=FakeLink,
        link_factory=FakeLink,
    ).confirm_link(
        company_id="tenant-1",
        identity_id="identity-1",
        target_identity_id="identity-2",
        confirmed_by="admin-2",
    )

    assert link is existing
    assert FakeLink.inserted == []
