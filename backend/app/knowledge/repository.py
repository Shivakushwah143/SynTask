from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from app.models.knowledge import KnowledgeRecord, KnowledgeStatus


class KnowledgeRepository:
    async def create(self, record: KnowledgeRecord) -> KnowledgeRecord:
        record.updated_at = datetime.utcnow()
        await record.insert()
        return record

    async def update(self, record: KnowledgeRecord) -> KnowledgeRecord:
        record.updated_at = datetime.utcnow()
        await record.save()
        return record

    async def find_by_source(
        self,
        company_id: str,
        source_entity: str,
        source_entity_id: str,
        knowledge_type: str | None = None,
    ) -> List[KnowledgeRecord]:
        query = [
            KnowledgeRecord.company_id == company_id,
            KnowledgeRecord.source_entity == source_entity,
            KnowledgeRecord.source_entity_id == source_entity_id,
        ]
        if knowledge_type:
            query.append(KnowledgeRecord.knowledge_type == knowledge_type)
        return await KnowledgeRecord.find(*query).sort("-version", "-updated_at").to_list()

    async def get_latest_by_source(
        self,
        company_id: str,
        source_entity: str,
        source_entity_id: str,
        knowledge_type: str | None = None,
    ) -> Optional[KnowledgeRecord]:
        records = await self.find_by_source(company_id, source_entity, source_entity_id, knowledge_type)
        return records[0] if records else None

    async def archive_previous_versions(
        self,
        company_id: str,
        source_entity: str,
        source_entity_id: str,
        knowledge_type: str,
    ) -> int:
        records = await self.find_by_source(company_id, source_entity, source_entity_id, knowledge_type)
        updated = 0
        for record in records:
            if record.status not in {KnowledgeStatus.ARCHIVED, KnowledgeStatus.SUPERSEDED, KnowledgeStatus.DELETED}:
                record.status = KnowledgeStatus.SUPERSEDED
                await self.update(record)
                updated += 1
        return updated

