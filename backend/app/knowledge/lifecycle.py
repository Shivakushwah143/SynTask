from __future__ import annotations

from app.models.knowledge import KnowledgeStatus


class KnowledgeLifecycle:
    INITIAL = KnowledgeStatus.DRAFT
    DEFAULT = KnowledgeStatus.ACTIVE

    @staticmethod
    def next_version(current_version: int) -> int:
        return max(1, current_version + 1)

