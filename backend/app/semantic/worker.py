from __future__ import annotations

import logging

from app.events import publish_event
from app.events.factories import build_domain_event
from app.events.registry import event_registry
from app.worker.tasks.semantic_tasks import process_knowledge_created

logger = logging.getLogger(__name__)


async def _process_knowledge_created(event):
    process_knowledge_created.delay(event.model_dump())


def register_semantic_subscribers() -> None:
    event_registry.register("KnowledgeCreated", _process_knowledge_created)
