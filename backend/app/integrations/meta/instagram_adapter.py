"""Instagram Messaging adapter for inbound webhook normalization."""

from app.integrations.meta.channel_adapters import ChannelType
from app.integrations.meta.social_messaging_adapter import SocialMessagingAdapter


class InstagramAdapter(SocialMessagingAdapter):
    channel = ChannelType.INSTAGRAM
    channel_label = "Instagram"
