from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional


ToolHandler = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]


@dataclass(slots=True)
class ToolExecutionResult:
    tool_name: str
    success: bool
    result: dict[str, Any]


class ToolExecutor:
    """Execute approved AI tools. No direct database writes from the LLM."""

    def __init__(self) -> None:
        self._tools: dict[str, ToolHandler] = {}

    def register(self, tool_name: str, handler: ToolHandler) -> None:
        self._tools[tool_name] = handler

    def available_tools(self) -> list[str]:
        return sorted(self._tools.keys())

    async def execute(self, tool_name: str, payload: dict[str, Any]) -> ToolExecutionResult:
        handler = self._tools.get(tool_name)
        if not handler:
            return ToolExecutionResult(
                tool_name=tool_name,
                success=False,
                result={"detail": f"Tool '{tool_name}' is not registered"},
            )

        result = await handler(payload)
        return ToolExecutionResult(tool_name=tool_name, success=True, result=result)

    async def execute_many(self, actions: list[dict[str, Any]]) -> list[ToolExecutionResult]:
        results: list[ToolExecutionResult] = []
        for action in actions:
            tool_name = str(action.get("tool") or action.get("tool_name") or "").strip()
            payload = action.get("payload") or {}
            if not tool_name:
                results.append(
                    ToolExecutionResult(
                        tool_name="unknown",
                        success=False,
                        result={"detail": "Missing tool name"},
                    )
                )
                continue
            results.append(await self.execute(tool_name, payload))
        return results

