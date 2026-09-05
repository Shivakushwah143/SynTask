from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime

from app.core.clock import utc_now

from fastapi import HTTPException, status

from app.models.agent import AgentDefinition, SpecialistDefinition


async def register_builtin_agent_definitions(*, created_by: str = "system") -> list[AgentDefinition]:
    from app.agents.executive_operations import executive_operations_agent_definition
    from app.agents.hr_operations import hr_operations_agent_definition

    return await AgentRegistry().register_definitions(
        [
            hr_operations_agent_definition(created_by=created_by),
            executive_operations_agent_definition(created_by=created_by),
        ]
    )


class AgentRegistry:
    async def get_definition(self, *, agent_id: str, version: str) -> AgentDefinition:
        definition = await AgentDefinition.find_one(AgentDefinition.agent_id == agent_id, AgentDefinition.version == version)
        if not definition:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent definition not found")
        if not definition.enabled or definition.retired_at is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Agent definition is disabled or retired")
        return definition

    async def assert_can_publish(self, definition: AgentDefinition) -> None:
        if definition.published:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Published agent versions are immutable")

    async def list_definitions(self, *, skip: int = 0, limit: int = 50) -> list[dict]:
        definitions = await AgentDefinition.find({}).sort("agent_id").skip(skip).limit(limit).to_list()
        return [item.model_dump(mode="json") for item in definitions]

    async def versions(self, *, agent_id: str) -> list[dict]:
        definitions = await AgentDefinition.find(AgentDefinition.agent_id == agent_id).sort("-created_at").to_list()
        return [item.model_dump(mode="json") for item in definitions]

    async def register_definition(self, definition: AgentDefinition) -> AgentDefinition:
        existing = await AgentDefinition.find_one(
            AgentDefinition.agent_id == definition.agent_id,
            AgentDefinition.version == definition.version,
        )
        if existing and existing.published:
            return existing
        payload = definition.model_dump(exclude={"id"})
        if existing:
            for key, value in payload.items():
                setattr(existing, key, value)
            await existing.save()
            return existing
        saved = AgentDefinition(**payload)
        await saved.insert()
        return saved

    async def register_definitions(self, definitions: Iterable[AgentDefinition]) -> list[AgentDefinition]:
        registered = []
        for definition in definitions:
            registered.append(await self.register_definition(definition))
        return registered


class SpecialistRegistry:
    async def get_evaluated(self, *, specialist_id: str, version: str) -> SpecialistDefinition:
        definition = await SpecialistDefinition.find_one(SpecialistDefinition.specialist_id == specialist_id, SpecialistDefinition.version == version)
        if not definition:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Specialist definition not found")
        if not definition.enabled or not definition.evaluated or definition.retired_at is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Specialist definition is disabled, unevaluated or retired")
        return definition

    async def retire(self, definition: SpecialistDefinition) -> SpecialistDefinition:
        definition.enabled = False
        definition.retired_at = utc_now()
        await definition.save()
        return definition
