from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ToolDefinition:
    tool_id: str
    version: str
    description: str
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    required_permissions: list[str]
    permitted_agent_ids: list[str]
    risk_class: str
    read_write: str
    approval_required: bool
    idempotency_required: bool
    timeout_seconds: int
    sensitivity_rules: dict[str, Any] = field(default_factory=dict)
    enabled: bool = False


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}

    def register(self, definition: ToolDefinition) -> None:
        if definition.read_write not in {"read", "write"}:
            raise ValueError("Tool read_write must be read or write")
        if definition.read_write == "write" and not definition.approval_required:
            raise ValueError("Write tools require approval")
        self._tools[definition.tool_id] = definition

    def get_allowed(self, *, agent_id: str, requested_tool_ids: list[str]) -> list[ToolDefinition]:
        allowed: list[ToolDefinition] = []
        for tool_id in requested_tool_ids:
            tool = self._tools.get(tool_id)
            if not tool or not tool.enabled:
                continue
            if agent_id not in tool.permitted_agent_ids:
                continue
            allowed.append(tool)
        return allowed

    def assert_no_unregistered_tools(self, tool_ids: list[str]) -> None:
        missing = [tool_id for tool_id in tool_ids if tool_id not in self._tools]
        if missing:
            raise ValueError("Unregistered tools are denied")


tool_registry = ToolRegistry()
