from app.events.subscribers.knowledge import register_knowledge_subscribers
from app.recruitment.subscribers import register_recruitment_subscribers

__all__ = ["register_knowledge_subscribers", "register_recruitment_subscribers"]
