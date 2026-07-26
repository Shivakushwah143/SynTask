from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status

from app.models.agent import AgentDefinition, SpecialistDefinition


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
        definition.retired_at = datetime.utcnow()
        await definition.save()
        return definition
