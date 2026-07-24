"""Facebook Messenger adapter for inbound webhook normalization."""

from app.integrations.meta.channel_adapters import ChannelType
from app.integrations.meta.social_messaging_adapter import SocialMessagingAdapter


class MessengerAdapter(SocialMessagingAdapter):
    channel = ChannelType.MESSENGER
    channel_label = "Messenger"
