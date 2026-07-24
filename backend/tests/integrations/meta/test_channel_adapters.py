from app.integrations.meta.channel_adapters import (
    ChannelCapabilities,
    ChannelConnectionHealth,
    ChannelType,
    NormalizedChannelEvent,
    NormalizedEventType,
)
from app.integrations.meta.messaging_models import MetaChannelConnection


def test_channel_contract_uses_phase2_channel_names():
    assert {channel.value for channel in ChannelType} == {
        "whatsapp",
        "instagram",
        "messenger",
    }


def test_normalized_event_keeps_provider_payload_outside_core_fields():
    event = NormalizedChannelEvent(
        company_id="tenant-1",
        channel=ChannelType.INSTAGRAM,
        connection_id="conn-1",
        provider_event_id="event-1",
        provider_message_id="message-1",
        event_type=NormalizedEventType.INBOUND_MESSAGE,
        sender_id="sender-1",
        recipient_id="ig-professional-1",
        text="hello",
        raw_payload={"entry": [{"id": "ig-professional-1"}]},
    )

    assert event.channel == ChannelType.INSTAGRAM
    assert event.event_type == NormalizedEventType.INBOUND_MESSAGE
    assert event.raw_payload["entry"][0]["id"] == "ig-professional-1"


def test_channel_connection_indexes_are_tenant_scoped():
    index_keys = [
        tuple(key for key, _direction in index.document["key"].items())
        for index in MetaChannelConnection.Settings.indexes
    ]

    assert ("company_id", "channel", "provider_asset_id") in index_keys
    assert ("company_id", "status") in index_keys


def test_capabilities_default_to_no_autonomous_send():
    capabilities = ChannelCapabilities(channel=ChannelType.WHATSAPP)

    assert capabilities.supports_outbound is False
    assert capabilities.requires_human_approval is True


def test_connection_health_is_explicit_per_channel():
    health = ChannelConnectionHealth(
        channel=ChannelType.MESSENGER,
        status="disabled",
        can_receive=False,
        can_send=False,
        reason="connection disabled",
    )

    assert health.channel == ChannelType.MESSENGER
    assert health.can_receive is False
    assert health.can_send is False


def test_channel_connection_declares_social_asset_and_scoped_sender_fields():
    fields = MetaChannelConnection.model_fields

    assert "instagram_professional_account_id" in fields
    assert "page_id" in fields
    assert "scoped_sender_ids" in fields
