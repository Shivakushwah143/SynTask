from __future__ import annotations

from typing import Any, Dict, Iterable, List

from app.knowledge.contracts import KnowledgeRelationship


class KnowledgeRelationshipBuilder:
    @staticmethod
    def from_refs(refs: Iterable[dict[str, Any]]) -> List[Dict[str, Any]]:
        relationships: List[Dict[str, Any]] = []
        for ref in refs:
            relationships.append(
                KnowledgeRelationship(
                    relationship_type=ref["relationship_type"],
                    entity_type=ref["entity_type"],
                    entity_id=ref["entity_id"],
                    label=ref.get("label"),
                    metadata=dict(ref.get("metadata") or {}),
                ).model_dump()
            )
        return relationships

