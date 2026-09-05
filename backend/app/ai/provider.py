from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Optional


@dataclass(slots=True)
class ToolCall:
    """A single tool/function call requested by the LLM."""
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass(slots=True)
class AIProviderResult:
    content: str
    model: str
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    raw_response: Optional[dict[str, Any]] = None
    tool_calls: list[ToolCall] = None
    finish_reason: Optional[str] = None

    def __post_init__(self):
        if self.tool_calls is None:
            self.tool_calls = []


class AIProvider(ABC):
    @abstractmethod
    async def generate(
        self,
        prompt: str,
        context: dict[str, Any],
        options: dict[str, Any] | None = None,
    ) -> AIProviderResult:
        raise NotImplementedError

    async def generate_with_tools(
        self,
        prompt: str,
        context: dict[str, Any],
        tools: list[dict[str, Any]],
        options: dict[str, Any] | None = None,
    ) -> AIProviderResult:
        """Generate a response with tool/function calling support.

        Default implementation raises NotImplementedError — providers that
        support tool calling override this.
        """
        raise NotImplementedError("This provider does not support tool calling")

