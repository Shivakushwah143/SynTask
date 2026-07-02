from __future__ import annotations

import re
from typing import Any
from uuid import uuid4

from app.semantic.contracts import SemanticChunk


class SemanticChunker:
    SECTION_BREAK = re.compile(r"\n{2,}|(?:^|\n)(?:#{1,6}\s+|[-*]\s+|\d+\.\s+)")

    @staticmethod
    def _clean_section(section: str) -> str:
        lines = [line.strip() for line in section.splitlines() if line.strip()]
        if not lines:
            return ""
        first = lines[0]
        first = re.sub(r"^(#{1,6}\s+|[-*]\s+|\d+\.\s+)", "", first).strip()
        return "\n".join([first, *lines[1:]]).strip()

    @classmethod
    def chunk(cls, *, knowledge: Any) -> list[SemanticChunk]:
        sections = [cls._clean_section(section) for section in cls.SECTION_BREAK.split(knowledge.content or "") if section and section.strip()]
        if not sections:
            sections = [knowledge.summary or knowledge.title or ""]
        return [
            SemanticChunk(
                chunk_id=str(uuid4()),
                knowledge_id=knowledge.knowledge_id,
                company_id=knowledge.company_id,
                project_id=knowledge.project_id,
                campaign_id=knowledge.campaign_id,
                knowledge_type=knowledge.knowledge_type,
                source_entity=knowledge.source_entity,
                source_entity_id=knowledge.source_entity_id,
                title=knowledge.title,
                content=section.strip(),
                metadata={
                    "knowledge_title": knowledge.title,
                    "knowledge_summary": knowledge.summary,
                    "knowledge_status": getattr(knowledge.status, "value", knowledge.status),
                    "tags": list(knowledge.tags or []),
                    "importance": knowledge.importance,
                    "confidence": knowledge.confidence,
                    "freshness": knowledge.freshness,
                    "created_at": knowledge.created_at,
                    "updated_at": knowledge.updated_at,
                },
            )
            for section in sections
        ]
