import pytest
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from app.integrations.meta.omnichannel_analytics import MetaOmnichannelAnalyticsService
from app.integrations.meta.channel_adapters import ChannelType, NormalizedEventType

class FakeConversation:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = ObjectId()
        self.company_id = "company-1"
        self.channel = kwargs.get("channel", ChannelType.INSTAGRAM)
        self.status = kwargs.get("status", "open")
        self.linked_lead_id = kwargs.get("linked_lead_id", None)

    class Cursor:
        def __init__(self, items):
            self.items = items
        async def to_list(self):
            return self.items

    @classmethod
    def find(cls, query):
        return cls.Cursor(cls._items)

class FakeMessage:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = ObjectId()
        self.company_id = "company-1"
        self.conversation_id = kwargs.get("conversation_id")
        self.direction = kwargs.get("direction")
        self.occurred_at = kwargs.get("occurred_at", datetime.now(timezone.utc))

    class Cursor:
        def __init__(self, items):
            self.items = items
        async def to_list(self):
            return self.items

    @classmethod
    def find(cls, query):
        return cls.Cursor(cls._items)

class FakeAIDraft:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = ObjectId()
        self.status = kwargs.get("status")

    class Cursor:
        def __init__(self, items):
            self.items = items
        async def to_list(self):
            return self.items

    @classmethod
    def find(cls, query):
        return cls.Cursor(cls._items)

@pytest.fixture
def analytics_mocks(monkeypatch):
    monkeypatch.setattr("app.integrations.meta.omnichannel_analytics.MetaConversation", FakeConversation)
    monkeypatch.setattr("app.integrations.meta.omnichannel_analytics.MetaMessage", FakeMessage)
    monkeypatch.setattr("app.integrations.meta.omnichannel_analytics.MetaAIDraft", FakeAIDraft)

@pytest.mark.asyncio
async def test_get_analytics_summary(analytics_mocks):
    # Setup test conversations
    conv1 = FakeConversation(channel=ChannelType.INSTAGRAM, status="open", linked_lead_id="lead-1")
    conv2 = FakeConversation(channel=ChannelType.WHATSAPP, status="closed")
    FakeConversation._items = [conv1, conv2]

    # Setup messages with FRT calculation timing
    t0 = datetime.now(timezone.utc) - timedelta(hours=2)
    t1 = t0 + timedelta(minutes=10) # 10 mins response time
    
    m1 = FakeMessage(conversation_id=str(conv1.id), direction="inbound", occurred_at=t0)
    m2 = FakeMessage(conversation_id=str(conv1.id), direction="outbound", occurred_at=t1)
    
    FakeMessage._items = [m1, m2]

    # Setup drafts
    d1 = FakeAIDraft(status="approved")
    d2 = FakeAIDraft(status="rejected")
    FakeAIDraft._items = [d1, d2]

    res = await MetaOmnichannelAnalyticsService.get_analytics_summary("company-1")

    assert res["total_conversations"] == 2
    assert res["channel_counts"]["instagram"] == 1
    assert res["channel_counts"]["whatsapp"] == 1
    assert res["status_counts"]["open"] == 1
    assert res["status_counts"]["closed"] == 1
    assert res["total_messages"] == 2
    assert res["inbound_messages"] == 1
    assert res["outbound_messages"] == 1
    assert res["average_first_response_time_seconds"] == 600.0 # 10 minutes in seconds
    assert res["ai_metrics"]["total_drafts"] == 2
    assert res["ai_metrics"]["approved_drafts"] == 1
    assert res["ai_metrics"]["acceptance_rate"] == 50.0
    assert res["crm_metrics"]["converted_conversations"] == 1
    assert res["crm_metrics"]["conversion_rate"] == 50.0
